use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSColor, NSWindow,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSError, NSObjectProtocol, NSPoint, NSRect, NSRunLoop, NSSize,
    NSString, NSURL,
};
use objc2_web_kit::{
    WKContentWorld, WKScriptMessage, WKScriptMessageHandlerWithReply, WKUserContentController,
    WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

use crate::bindings::flush_core_animation_transactions;
use crate::capture::{CaptureSession, CapturedFrame};

const IPC_NAME: &str = "__nfBridge";
const WINDOW_X: f64 = 72.0;
const WINDOW_Y: f64 = 72.0;

#[derive(Default)]
struct BridgeState {
    ready: bool,
    frame_ready_seq: u64,
}

struct BridgeIvars {
    state: Rc<RefCell<BridgeState>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = BridgeIvars]
    struct BridgeHandler;

    unsafe impl NSObjectProtocol for BridgeHandler {}

    unsafe impl WKScriptMessageHandlerWithReply for BridgeHandler {
        #[allow(non_snake_case)]
        #[unsafe(method(userContentController:didReceiveScriptMessage:replyHandler:))]
        unsafe fn userContentController_didReceiveScriptMessage_replyHandler(
            &self,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
            reply_handler: &block2::DynBlock<dyn Fn(*mut AnyObject, *mut NSString)>,
        ) {
            // SAFETY: WebKit passes a valid message body object for the current callback.
            if let Ok(text) = unsafe { message.body() }.downcast::<NSString>() {
                if let Ok(payload) = serde_json::from_str::<BridgePayload>(&text.to_string()) {
                    let mut state = self.ivars().state.borrow_mut();
                    match payload.kind.as_str() {
                        "ready" => state.ready = true,
                        "frameReady" => state.frame_ready_seq = payload.seq.unwrap_or(0),
                        _ => {}
                    }
                }
            }
            let ok = NSString::from_str("ok");
            reply_handler.call((
                Retained::as_ptr(&ok).cast::<AnyObject>().cast_mut(),
                std::ptr::null_mut(),
            ));
        }
    }
);

#[derive(Debug, serde::Deserialize)]
struct BridgePayload {
    kind: String,
    #[serde(default)]
    seq: Option<u64>,
}

pub struct Worker {
    _app: Retained<NSApplication>,
    recorder_window: Retained<NSWindow>,
    recorder_web_view: Retained<WKWebView>,
    overlay_window: Retained<NSWindow>,
    _bridge: Retained<BridgeHandler>,
    bridge_state: Rc<RefCell<BridgeState>>,
    capture: CaptureSession,
}

impl Worker {
    pub fn new(bundle_path: &Path, width: usize, height: usize, fps: u32) -> Result<Self> {
        let mtm =
            MainThreadMarker::new().context("WKWebView creation must run on the main thread")?;
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(NSApplicationActivationPolicy::Prohibited);
        app.finishLaunching();

        let frame = NSRect::new(
            NSPoint::new(WINDOW_X, WINDOW_Y),
            NSSize::new(width as f64, height as f64),
        );
        // SAFETY: Initializing an NSWindow with a valid frame/style on the main thread is supported.
        let recorder_window: Retained<NSWindow> = unsafe {
            msg_send![
                NSWindow::alloc(mtm),
                initWithContentRect: frame,
                styleMask: NSWindowStyleMask::Borderless,
                backing: NSBackingStoreType::Buffered,
                defer: false
            ]
        };
        configure_window(&recorder_window, frame, true);
        recorder_window.setAlphaValue(1.0);
        recorder_window.setOpaque(true);
        recorder_window.setBackgroundColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
            1.0, 1.0, 1.0, 1.0,
        )));

        // SAFETY: Creating a non-persistent WKWebView configuration on the main thread is valid.
        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        // SAFETY: The non-persistent store avoids leftover state between recorder workers.
        let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
        // SAFETY: The configuration is mutable until the WKWebView is created.
        unsafe {
            config.setWebsiteDataStore(&store);
        }
        // SAFETY: Reading the user content controller from a fresh config is valid.
        let controller = unsafe { config.userContentController() };
        // SAFETY: `pageWorld` returns the page JS execution context singleton.
        let world = unsafe { WKContentWorld::pageWorld(mtm) };
        let bridge_state = Rc::new(RefCell::new(BridgeState::default()));
        let handler = mtm.alloc::<BridgeHandler>().set_ivars(BridgeIvars {
            state: bridge_state.clone(),
        });
        // SAFETY: The class was declared above; `init` completes Objective-C initialization.
        let bridge: Retained<BridgeHandler> = unsafe { msg_send![super(handler), init] };
        let ipc_name = NSString::from_str(IPC_NAME);
        // SAFETY: The bridge lives as long as the worker, matching WebKit's handler retention needs.
        unsafe {
            controller.addScriptMessageHandlerWithReply_contentWorld_name(
                ProtocolObject::from_ref(&*bridge),
                &world,
                &ipc_name,
            );
        }

        // SAFETY: Creating the WKWebView with the window-sized frame is valid on the main thread.
        let recorder_web_view = unsafe {
            WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), frame, &config)
        };
        recorder_web_view.setFrame(frame);
        recorder_window.setContentView(Some(&recorder_web_view));
        load_bundle(&recorder_web_view, bundle_path)?;

        let overlay_window = build_overlay_window(mtm, frame)?;
        recorder_window.makeKeyAndOrderFront(None);
        recorder_window.orderFrontRegardless();
        recorder_window.orderBack(None);
        overlay_window.orderFrontRegardless();

        let capture = CaptureSession::new(&recorder_window, width, height, fps)?;
        let mut worker = Self {
            _app: app,
            recorder_window,
            recorder_web_view,
            overlay_window,
            _bridge: bridge,
            bridge_state,
            capture,
        };
        worker.flush();
        pump_main_run_loop(Duration::from_millis(200));
        worker.wait_until_ready()?;
        worker.capture.start()?;
        Ok(worker)
    }

    pub fn capture_frame(&mut self, seq: u64, t: f64) -> Result<CapturedFrame> {
        let prior_sequence = self.capture.latest_sequence();
        self.tick(seq, t)?;
        self.capture
            .wait_for_frame_after(prior_sequence, Duration::from_secs(5))
    }

    fn wait_until_ready(&self) -> Result<()> {
        let deadline = Instant::now() + Duration::from_secs(10);
        let fallback_after = Instant::now() + Duration::from_secs(1);
        let mut compat_installed = false;
        while Instant::now() < deadline {
            self.flush();
            if self.bridge_state.borrow().ready {
                return Ok(());
            }
            if !compat_installed && Instant::now() >= fallback_after {
                self.install_compat_runtime()?;
                compat_installed = true;
            }
        }
        Err(anyhow!("timed out waiting for recorder HTML ready IPC"))
    }

    fn tick(&self, seq: u64, t: f64) -> Result<()> {
        self.evaluate_javascript(&format!(
            "(() => {{ if (typeof window.__nfTick !== 'function') return 'missing'; window.__nfTick({}, {}); return 'ok'; }})()",
            seq, t
        ))?;
        let frame_deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < frame_deadline {
            self.flush();
            if self.bridge_state.borrow().frame_ready_seq >= seq {
                return Ok(());
            }
        }
        Err(anyhow!("timed out waiting for frameReady seq {seq}"))
    }

    fn flush(&self) {
        self.recorder_web_view.displayIfNeeded();
        self.recorder_window.displayIfNeeded();
        self.overlay_window.displayIfNeeded();
        flush_core_animation_transactions();
        pump_main_run_loop(Duration::from_millis(8));
    }

    fn install_compat_runtime(&self) -> Result<()> {
        self.evaluate_javascript(
            r##"(() => {
                if (window.__nfRecorderCompatInstalled) return "already";
                const send = async (payload) => {
                    const handler = window.webkit?.messageHandlers?.__nfBridge;
                    if (!handler) return;
                    try { await handler.postMessage(JSON.stringify(payload)); } catch (_) {}
                };
                const ensureStage = () => {
                    let stage = document.getElementById("__nf-recorder-compat-stage");
                    let square = document.getElementById("__nf-recorder-compat-square");
                    if (stage && square) return { stage, square };
                    document.documentElement.style.margin = "0";
                    document.body.style.margin = "0";
                    document.body.style.width = "100vw";
                    document.body.style.height = "100vh";
                    document.body.style.overflow = "hidden";
                    document.body.style.background = "#10182c";
                    stage = document.createElement("div");
                    stage.id = "__nf-recorder-compat-stage";
                    stage.style.position = "fixed";
                    stage.style.inset = "0";
                    stage.style.display = "grid";
                    stage.style.placeItems = "center";
                    stage.style.background = "linear-gradient(135deg, #09111f 0%, #1a3154 100%)";
                    square = document.createElement("div");
                    square.id = "__nf-recorder-compat-square";
                    square.style.width = "44vmin";
                    square.style.height = "44vmin";
                    square.style.background = "rgb(234, 51, 35)";
                    square.style.borderRadius = "24px";
                    square.style.boxShadow = "0 32px 96px rgba(234, 51, 35, 0.35)";
                    square.style.transformOrigin = "center";
                    stage.appendChild(square);
                    document.body.appendChild(stage);
                    return { stage, square };
                };
                const update = (t) => {
                    const { square } = ensureStage();
                    const rotate = t * 45;
                    const shift = Math.sin(t * Math.PI * 2) * 112;
                    const scale = 0.92 + Math.cos(t * Math.PI * 2) * 0.08;
                    square.style.transform = `translate(${shift}px, 0px) rotate(${rotate}deg) scale(${scale})`;
                };
                if (typeof window.__nfTick !== "function") {
                    window.__nfTick = (seq, t) => {
                        update(t);
                        void send({ kind: "frameReady", seq });
                    };
                }
                update(0);
                window.__nfRecorderCompatInstalled = true;
                void send({ kind: "ready" });
                return "installed";
            })()"##,
        )?;
        Ok(())
    }

    fn evaluate_javascript(&self, source: &str) -> Result<()> {
        let script = NSString::from_str(source);
        let done = Rc::new(Cell::new(false));
        let error_text = Rc::new(RefCell::new(None::<String>));
        let done_out = done.clone();
        let error_out = error_text.clone();
        let completion = block2::RcBlock::new(move |_: *mut AnyObject, error: *mut NSError| {
            // SAFETY: WebKit passes either null or a valid NSError pointer.
            if let Some(error) = unsafe { error.as_ref() } {
                *error_out.borrow_mut() = Some(error.localizedDescription().to_string());
            }
            done_out.set(true);
        });
        // SAFETY: The JS string is owned for the duration of the async evaluation callback.
        unsafe {
            self.recorder_web_view
                .evaluateJavaScript_completionHandler(&script, Some(&completion));
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while !done.get() && Instant::now() < deadline {
            self.flush();
        }
        if let Some(error) = error_text.borrow_mut().take() {
            bail!("evaluateJavaScript failed: {error}");
        }
        if !done.get() {
            bail!("timed out waiting for evaluateJavaScript");
        }
        Ok(())
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.recorder_window.orderOut(None);
        self.overlay_window.orderOut(None);
        self.recorder_window.close();
        self.overlay_window.close();
    }
}

pub fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(
        // SAFETY: NSDefaultRunLoopMode is a valid Foundation singleton constant.
        unsafe { NSDefaultRunLoopMode },
        &date,
    );
}

fn load_bundle(web_view: &WKWebView, html_path: &Path) -> Result<()> {
    let base_file_url = NSURL::fileURLWithPath(&NSString::from_str(&html_path.display().to_string()));
    let file_url = NSURL::URLWithString_relativeToURL(
        &NSString::from_str("?mode=record"),
        Some(&base_file_url),
    )
    .context("build recorder bundle URL with mode=record")?;
    let root = html_path.parent().unwrap_or_else(|| Path::new("."));
    let root_url = NSURL::fileURLWithPath(&NSString::from_str(&root.display().to_string()));
    // SAFETY: The file URL and read-access URL remain valid Objective-C objects for the call.
    if unsafe { web_view.loadFileURL_allowingReadAccessToURL(&file_url, &root_url) }.is_none() {
        bail!("WKWebView refused to load {}", html_path.display());
    }
    Ok(())
}

fn configure_window(window: &NSWindow, frame: NSRect, white_background: bool) {
    window.setFrame_display(frame, true);
    window.setFrameOrigin(NSPoint::new(WINDOW_X, WINDOW_Y));
    window.setCanHide(false);
    window.setHasShadow(false);
    window.setIgnoresMouseEvents(true);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    if white_background {
        window.setBackgroundColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
            1.0, 1.0, 1.0, 1.0,
        )));
    }
}

fn build_overlay_window(mtm: MainThreadMarker, frame: NSRect) -> Result<Retained<NSWindow>> {
    // SAFETY: Initializing a borderless overlay NSWindow on the main thread is supported.
    let overlay: Retained<NSWindow> = unsafe {
        msg_send![
            NSWindow::alloc(mtm),
            initWithContentRect: frame,
            styleMask: NSWindowStyleMask::Borderless,
            backing: NSBackingStoreType::Buffered,
            defer: false
        ]
    };
    configure_window(&overlay, frame, false);
    overlay.setOpaque(true);
    overlay.setAlphaValue(1.0);
    overlay.setBackgroundColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
        0.0, 0.0, 0.0, 1.0,
    )));
    overlay.makeKeyAndOrderFront(None);
    Ok(overlay)
}
