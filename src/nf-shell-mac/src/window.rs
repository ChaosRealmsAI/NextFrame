#![deny(unsafe_op_in_unsafe_fn)]

use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::rc::Rc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSColor, NSWindow,
    NSWindowButton, NSWindowDelegate, NSWindowStyleMask, NSWindowTitleVisibility,
    NSWindowToolbarStyle,
};
use objc2_foundation::{
    NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSTimer,
};
use objc2_web_kit::{WKWebView, WKWebViewConfiguration, WKWebsiteDataStore};

use crate::bindings::{nsurl_from_path, pump_main_run_loop};
use crate::bridge::WebViewBridge;
use crate::panels::{self, PanelViews};
use crate::screenshot::{capture_window_png, preview_center_has_nonwhite_pixels};
use crate::source_file::SourceWatcher;
use crate::{RuntimeMode, version};

const DEFAULT_SOURCE: &str = "spec/fixtures/sample.json";
const AUTOMATION_DELAY: Duration = Duration::from_secs(2);
const WATCH_POLL_INTERVAL_SECS: f64 = 0.05;

#[derive(Debug, Clone)]
pub struct ShellOptions {
    pub source_path: PathBuf,
    pub screenshot_out: Option<PathBuf>,
    pub eval_script: Option<String>,
}

impl Default for ShellOptions {
    fn default() -> Self {
        Self {
            source_path: PathBuf::from(DEFAULT_SOURCE),
            screenshot_out: None,
            eval_script: None,
        }
    }
}

struct DelegateIvars {
    state: Rc<RefCell<ShellState>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = DelegateIvars]
    struct ShellDelegate;

    unsafe impl NSObjectProtocol for ShellDelegate {}

    unsafe impl NSWindowDelegate for ShellDelegate {
        #[unsafe(method(windowDidResize:))]
        fn window_did_resize(&self, notification: &NSNotification) {
            if let Some(window) = notification.object().and_then(|obj| obj.downcast::<NSWindow>().ok()) {
                adjust_titlebar_chrome(&window);
            }
        }

        #[unsafe(method(windowWillClose:))]
        fn window_will_close(&self, _notification: &NSNotification) {
            NSApplication::sharedApplication(self.mtm()).terminate(None);
        }
    }

    impl ShellDelegate {
        #[unsafe(method(poll:))]
        fn poll(&self, _timer: &NSTimer) {
            self.ivars().state.borrow_mut().poll(self.mtm());
        }
    }
);

impl ShellDelegate {
    fn new(mtm: MainThreadMarker, state: Rc<RefCell<ShellState>>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars { state });
        // SAFETY: `ShellDelegate` inherits `NSObject`; `init` is required.
        unsafe { msg_send![super(this), init] }
    }
}

struct ShellState {
    bundle_path: PathBuf,
    window: Retained<NSWindow>,
    panels: PanelViews,
    bridge: WebViewBridge,
    watcher: Option<SourceWatcher>,
    compile_rx: Receiver<CompileEvent>,
    automation_deadline: Option<Instant>,
    screenshot_out: Option<PathBuf>,
    eval_script: Option<String>,
    eval_output: Option<serde_json::Value>,
    finished: bool,
    outcome: Option<Result<()>>,
}

enum CompileEvent {
    Reloaded,
    Failed(String),
}

impl ShellState {
    fn poll(&mut self, mtm: MainThreadMarker) {
        if let Err(err) = self.drain_compile_events() {
            self.finish_with(mtm, Err(err));
            return;
        }

        self.bridge.web_view().displayIfNeeded();
        self.panels.preview_host.displayIfNeeded();
        self.window.displayIfNeeded();

        if self.finished {
            return;
        }

        if let Some(deadline) = self.automation_deadline {
            if Instant::now() >= deadline {
                let result = self.run_automation();
                self.finish_with(mtm, result);
            }
        }
    }

    fn run_automation(&mut self) -> Result<()> {
        if let Some(script) = &self.eval_script {
            let value = self.bridge.eval_script_json(script)?;
            self.eval_output = Some(value);
        }

        if let Some(path) = &self.screenshot_out {
            let bytes = capture_window_png(&self.window)?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create screenshot dir {}", parent.display()))?;
            }
            std::fs::write(path, bytes)
                .with_context(|| format!("write screenshot {}", path.display()))?;
            if !preview_center_has_nonwhite_pixels(&self.panels.preview_host)? {
                bail!("preview center region did not contain non-white pixels");
            }
        }

        Ok(())
    }

    fn finish_with(&mut self, mtm: MainThreadMarker, result: Result<()>) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.outcome = Some(result);
        if let Some(watcher) = self.watcher.as_mut() {
            let _ = watcher.stop();
        }
        NSApplication::sharedApplication(mtm).terminate(None);
    }

    fn drain_compile_events(&mut self) -> Result<()> {
        while let Ok(event) = self.compile_rx.try_recv() {
            match event {
                CompileEvent::Reloaded => {
                    load_bundle_file(self.bridge.web_view(), &self.bundle_path)
                        .context("reload bundle")?;
                }
                CompileEvent::Failed(err) => bail!(err),
            }
        }
        Ok(())
    }
}

pub fn run_shell(options: ShellOptions) -> Result<()> {
    let mtm = MainThreadMarker::new().ok_or_else(|| anyhow::anyhow!("must run on main thread"))?;
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    app.finishLaunching();

    let bundle_path = bundle_output_path(&options.source_path);
    build_bundle(&options.source_path, &bundle_path)?;

    let (window, panels, bridge) = build_window(mtm, &options.source_path, &bundle_path)?;
    window.makeKeyAndOrderFront(None);
    window.displayIfNeeded();
    adjust_titlebar_chrome(&window);
    #[allow(deprecated)]
    app.activateIgnoringOtherApps(true);

    let (compile_tx, compile_rx) = mpsc::channel();
    let watcher = install_source_watcher(&options.source_path, bundle_path.clone(), compile_tx.clone())?;

    let state = Rc::new(RefCell::new(ShellState {
        bundle_path: bundle_path.clone(),
        window: window.clone(),
        panels,
        bridge,
        watcher: Some(watcher),
        compile_rx,
        automation_deadline: if options.screenshot_out.is_some() || options.eval_script.is_some() {
            Some(Instant::now() + AUTOMATION_DELAY)
        } else {
            None
        },
        screenshot_out: options.screenshot_out.clone(),
        eval_script: options.eval_script.clone(),
        eval_output: None,
        finished: false,
        outcome: None,
    }));

    println!(
        "{}",
        serde_json::to_string(&serde_json::json!({
            "crate": "nf-shell-mac",
            "version": version(),
            "mode": RuntimeMode::Play,
            "source_path": options.source_path,
            "webview_bundle": bundle_path,
            "window_id": window.windowNumber(),
            "status": "running",
        }))?
    );

    if state.borrow().automation_deadline.is_some() {
        {
            let mut state = state.borrow_mut();
            let deadline = state
                .automation_deadline
                .ok_or_else(|| anyhow::anyhow!("automation requested without deadline"))?;
            while Instant::now() < deadline {
                state.drain_compile_events()?;
                state.bridge.web_view().displayIfNeeded();
                state.panels.preview_host.displayIfNeeded();
                state.window.displayIfNeeded();
                pump_main_run_loop(Duration::from_millis(16));
            }
            state.run_automation()?;
            if let Some(watcher) = state.watcher.as_mut() {
                watcher.stop()?;
            }
            if let Some(value) = state.eval_output.take() {
                println!("{}", serde_json::to_string(&value)?);
            }
        }
        return Ok(());
    }

    let delegate = ShellDelegate::new(mtm, Rc::clone(&state));
    window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // SAFETY: Timer target is a live NSObject on the main run loop.
    let _timer = unsafe {
        NSTimer::scheduledTimerWithTimeInterval_target_selector_userInfo_repeats(
            WATCH_POLL_INTERVAL_SECS,
            delegate.as_ref(),
            sel!(poll:),
            None,
            true,
        )
    };

    app.run();

    let mut state = state.borrow_mut();
    if let Some(value) = state.eval_output.take() {
        println!("{}", serde_json::to_string(&value)?);
    }
    if let Some(result) = state.outcome.take() {
        result?;
    }
    Ok(())
}

fn build_window(
    mtm: MainThreadMarker,
    source_path: &Path,
    bundle_path: &Path,
) -> Result<(Retained<NSWindow>, PanelViews, WebViewBridge)> {
    let style_mask = NSWindowStyleMask::Closable
        | NSWindowStyleMask::Titled
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::Resizable
        | NSWindowStyleMask::FullSizeContentView;

    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1440.0, 900.0)),
            style_mask,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: The window stays owned by Rust for the duration of the process.
    unsafe { window.setReleasedWhenClosed(false) };
    window.setAlphaValue(1.0);
    window.setOpaque(true);
    window.setHasShadow(true);
    window.setBackgroundColor(Some(&NSColor::windowBackgroundColor()));
    window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
    window.setTitlebarAppearsTransparent(true);
    window.setToolbarStyle(NSWindowToolbarStyle::UnifiedCompact);
    window.setMovableByWindowBackground(false);
    window.setContentMinSize(NSSize::new(960.0, 620.0));
    window.center();

    let content_view = window
        .contentView()
        .ok_or_else(|| anyhow::anyhow!("window did not create content view"))?;
    let panels = panels::install(&content_view, mtm).map_err(anyhow::Error::msg)?;

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
    unsafe {
        config.setWebsiteDataStore(&store);
    }
    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), panels.preview_host.bounds(), &config)
    };
    web_view.setTranslatesAutoresizingMaskIntoConstraints(false);
    panels.preview_host.addSubview(web_view.as_ref());
    let constraints = objc2_foundation::NSArray::from_retained_slice(&[
        web_view
            .leadingAnchor()
            .constraintEqualToAnchor(&panels.preview_host.leadingAnchor()),
        web_view
            .trailingAnchor()
            .constraintEqualToAnchor(&panels.preview_host.trailingAnchor()),
        web_view
            .topAnchor()
            .constraintEqualToAnchor_constant(&panels.preview_host.topAnchor(), 36.0),
        web_view
            .bottomAnchor()
            .constraintEqualToAnchor(&panels.preview_host.bottomAnchor()),
    ]);
    objc2_app_kit::NSLayoutConstraint::activateConstraints(&constraints);

    let bridge = WebViewBridge::install(mtm, &config, web_view, source_path, RuntimeMode::Play)?;
    load_bundle_file(bridge.web_view(), bundle_path)?;

    Ok((window, panels, bridge))
}

fn adjust_titlebar_chrome(window: &NSWindow) {
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(minimize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let Some(zoom) = window.standardWindowButton(NSWindowButton::ZoomButton) else {
        return;
    };

    close.setHidden(true);
    minimize.setHidden(true);
    zoom.setHidden(true);

    let frame = window.frame();
    if let Some(button_group) = unsafe { close.superview() } {
        if let Some(titlebar_container) = unsafe { button_group.superview() } {
            titlebar_container.setFrame(NSRect::new(
                NSPoint::new(0.0, frame.size.height - panels::TITLE_BAR_HEIGHT),
                NSSize::new(frame.size.width, panels::TITLE_BAR_HEIGHT),
            ));
            titlebar_container.layoutSubtreeIfNeeded();
        }
    }
}

fn install_source_watcher(
    source_path: &Path,
    bundle_path: PathBuf,
    compile_tx: Sender<CompileEvent>,
) -> Result<SourceWatcher> {
    let source_path = source_path.to_path_buf();
    let watch_path = source_path.clone();
    SourceWatcher::watch(&watch_path, move || {
        let source = source_path.clone();
        let bundle = bundle_path.clone();
        let tx = compile_tx.clone();
        thread::spawn(move || {
            let result = build_bundle(&source, &bundle)
                .map(|_| CompileEvent::Reloaded)
                .unwrap_or_else(|err| CompileEvent::Failed(err.to_string()));
            let _ = tx.send(result);
        });
    })
}

fn build_bundle(source_path: &Path, bundle_path: &Path) -> Result<()> {
    if let Some(parent) = bundle_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create bundle dir {}", parent.display()))?;
    }

    let engine_cli = engine_cli_path()?;
    let status = Command::new("node")
        .arg(engine_cli)
        .arg("build")
        .arg(source_path)
        .arg("-o")
        .arg(bundle_path)
        .status()
        .context("spawn node build")?;
    if !status.success() {
        bail!("nf build exited non-zero: {}", status.code().unwrap_or(-1));
    }
    Ok(())
}

fn load_bundle_file(web_view: &WKWebView, bundle_path: &Path) -> Result<()> {
    let file_url = nsurl_from_path(bundle_path);
    let root_url = nsurl_from_path(
        bundle_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("bundle path has no parent: {}", bundle_path.display()))?,
    );
    let navigation = unsafe { web_view.loadFileURL_allowingReadAccessToURL(&file_url, &root_url) };
    if navigation.is_none() {
        bail!("WKWebView refused to load {}", bundle_path.display());
    }
    Ok(())
}

fn engine_cli_path() -> Result<PathBuf> {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for candidate in [
        repo_root.join("src/nf-core-engine/dist/cli.js"),
        repo_root.join("src/nf-core-engine/scripts/cli.mjs"),
    ] {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    bail!("engine cli not found")
}

fn bundle_output_path(source_path: &Path) -> PathBuf {
    let stem = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("source");
    std::env::temp_dir().join(format!("nf-shell-mac-{}-{stem}.html", std::process::id()))
}
