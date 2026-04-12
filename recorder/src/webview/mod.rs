//! `WKWebView` hosting and frame-capture helpers for the recorder.

mod capture;
mod inject;
mod parallel;

use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSFloatingWindowLevel,
    NSImage, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSPoint, NSRect, NSRunLoop, NSSize, NSString, NSURL, NSURLRequest,
};
use objc2_web_kit::{
    WKAudiovisualMediaTypes, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

#[allow(unused_imports)]
pub(crate) use parallel::ParallelHost;

/// Default recorder viewport width in CSS pixels.
#[allow(dead_code)]
pub(crate) const VIEW_WIDTH: f64 = 1920.0;
/// Default recorder viewport height in CSS pixels.
#[allow(dead_code)]
pub(crate) const VIEW_HEIGHT: f64 = 1080.0;
const OFFSCREEN_ORIGIN_X: f64 = -10000.0;
const OFFSCREEN_ORIGIN_Y: f64 = -10000.0;
type SnapshotResultSlot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
type EvalResultSlot = Rc<RefCell<Option<Result<Option<String>, String>>>>;

/// Hosts a single `WKWebView` inside an offscreen-capable `NSWindow`.
pub struct WebViewHost {
    _app: Retained<NSApplication>,
    pub(super) window: Retained<NSWindow>,
    pub(super) web_view: Retained<WKWebView>,
    headed: bool,
    dpr: f64,
    view_width: f64,
    view_height: f64,
    pub(super) target_size: NSSize,
    offscreen_parked: Cell<bool>,
}

impl WebViewHost {
    /// Creates a recorder window and `WKWebView` sized for the requested DPR.
    pub fn new(
        mtm: MainThreadMarker,
        headed: bool,
        dpr: f64,
        view_width: f64,
        view_height: f64,
    ) -> Result<Self, String> {
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(if headed {
            NSApplicationActivationPolicy::Accessory
        } else {
            NSApplicationActivationPolicy::Prohibited
        });
        app.finishLaunching();

        let initial_origin = if headed {
            NSPoint::new(100.0, 100.0)
        } else {
            offscreen_origin(0)
        };
        let initial_rect = NSRect::new(initial_origin, NSSize::new(view_width, view_height));
        let window: Retained<NSWindow> = unsafe {
            msg_send![
                NSWindow::alloc(mtm),
                initWithContentRect: initial_rect,
                styleMask: NSWindowStyleMask::Borderless,
                backing: NSBackingStoreType::Buffered,
                defer: false
            ]
        };
        window.setTitle(&NSString::from_str("recorder"));
        window.setFrame_display(initial_rect, true);
        unsafe {
            let _: () = msg_send![&window, setIgnoresMouseEvents: true];
        }
        if headed {
            window.setLevel(NSFloatingWindowLevel);
            window.orderFrontRegardless();
            pump_main_run_loop(Duration::from_millis(150));
        } else {
            unsafe {
                let _: () = msg_send![&window, setAlphaValue: 0.0f64];
                let _: () = msg_send![&window, setOpaque: false];
                let _: () = msg_send![&window, setHasShadow: false];
            }
        }

        // CSS viewport uses the configured size regardless of DPR/screen scale.
        // DPR only affects output resolution via takeSnapshot configuration.
        let target_size = NSSize::new(view_width, view_height);
        window.setContentSize(target_size);
        window.setFrameOrigin(if headed {
            let frame = window.frame();
            NSPoint::new(frame.origin.x.max(100.0), frame.origin.y.max(100.0))
        } else {
            initial_origin
        });
        let web_view = Self::create_web_view(target_size)?;
        window.setContentView(Some(&web_view));

        let host = Self {
            _app: app,
            window,
            web_view,
            headed,
            dpr,
            view_width,
            view_height,
            target_size,
            offscreen_parked: Cell::new(!headed),
        };
        host.sync_view_hierarchy();
        Ok(host)
    }

    /// Returns the current capture size in backing pixels.
    pub fn target_pixel_size(&self) -> (usize, usize) {
        (
            (self.view_width * self.dpr).round().max(1.0) as usize,
            (self.view_height * self.dpr).round().max(1.0) as usize,
        )
    }

    /// Moves the host window to the requested screen position.
    #[allow(dead_code)]
    pub(crate) fn set_window_origin(&self, x: f64, y: f64) {
        self.window.setFrameOrigin(NSPoint::new(x, y));
        self.sync_view_hierarchy();
    }

    /// Updates the host window title.
    #[allow(dead_code)]
    pub(crate) fn set_window_title(&self, title: &str) {
        self.window.setTitle(&NSString::from_str(title));
    }

    /// Recreates the underlying `WKWebView` and window.
    pub fn reset_webview(&mut self) -> Result<(), String> {
        let mtm = MainThreadMarker::new().ok_or("WKWebView reset must run on the main thread")?;
        self.window.orderOut(None);
        self.window.close();
        *self = Self::new(
            mtm,
            self.headed,
            self.dpr,
            self.view_width,
            self.view_height,
        )?;
        Ok(())
    }

    /// Loads an HTTP URL into the hosted `WKWebView`.
    pub fn load_url(&self, url: &str) -> Result<(), String> {
        let url = NSURL::URLWithString(&NSString::from_str(url))
            .ok_or_else(|| format!("failed to construct NSURL from {url:?}"))?;
        let request = NSURLRequest::requestWithURL(&url);
        let navigation = unsafe { self.web_view.loadRequest(&request) };
        if navigation.is_none() {
            return Err(format!(
                "WKWebView refused loadRequest for {}",
                url.absoluteString()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "<invalid-url>".into())
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Loads a local file URL with the supplied read-access root.
    pub fn load_file_url(&self, file_path: &Path, read_access_root: &Path) -> Result<(), String> {
        let file_url = NSURL::fileURLWithPath(&NSString::from_str(&file_path.to_string_lossy()));
        let read_access_url =
            NSURL::fileURLWithPath(&NSString::from_str(&read_access_root.to_string_lossy()));
        let navigation = unsafe {
            self.web_view
                .loadFileURL_allowingReadAccessToURL(&file_url, &read_access_url)
        };
        if navigation.is_none() {
            return Err(format!(
                "WKWebView refused loadFileURL for {} with read access {}",
                file_path.display(),
                read_access_root.display()
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Waits until the page has reached a stable ready state for capture.
    pub fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let started = Instant::now();
        let mut last_ready_state = None;
        let mut last_progress = 0.0;
        let mut last_loading = true;
        let mut last_url = None;
        let mut saw_navigation = false;
        while started.elapsed() < timeout {
            self.sync_view_hierarchy();
            last_loading = unsafe { self.web_view.isLoading() };
            last_progress = unsafe { self.web_view.estimatedProgress() };
            last_url = self.current_url();
            saw_navigation |= last_loading
                || last_progress > 0.0
                || last_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty() && url != "about:blank");
            last_ready_state = self
                .eval_string("document.readyState ? String(document.readyState) : null")
                .ok()
                .flatten();

            if !last_loading
                && last_progress >= 1.0
                && matches!(last_ready_state.as_deref(), Some("complete"))
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if saw_navigation
                && !last_loading
                && matches!(last_ready_state.as_deref(), Some("complete"))
                && started.elapsed() >= Duration::from_secs(1)
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if !last_loading
                && last_progress == 0.0
                && last_url.is_none()
                && last_ready_state.is_none()
                && started.elapsed() >= Duration::from_millis(1500)
            {
                self.flush_render(Duration::from_millis(1500))?;
                let _ = self.wait_for_animation_frame(Duration::from_millis(500));
                self.park_offscreen();
                return Ok(());
            }
            pump_main_run_loop(Duration::from_millis(25));
        }
        Err(format!(
            "timed out waiting for page load (readyState={last_ready_state:?}, estimatedProgress={last_progress:.3}, isLoading={last_loading}, url={last_url:?})"
        ))
    }

    /// Applies recorder-specific DOM adjustments before capture begins.
    pub fn prepare_page(&self) -> Result<(), String> {
        let script = r#"
        (() => {
          document.documentElement.style.overflow = 'hidden';
          if (document.body) {
            document.body.style.overflow = 'hidden';
            document.body.style.margin = '0';
          }
          const help = document.querySelector('.help');
          if (help) help.style.display = 'none';
          document.querySelectorAll('audio, video').forEach(el => {
            try { el.pause(); el.currentTime = 0; el.muted = true; } catch (_) {}
          });
          return 'ok';
        })()
        "#;
        let started = Instant::now();
        let mut last_error = None;
        while started.elapsed() < Duration::from_secs(5) {
            match self.eval_ignoring_result(script) {
                Ok(()) => {
                    let on_frame_check = self.eval_string(
                        r#"
                        (() => {
                          return typeof window.__onFrame === 'function' ? 'ok' : 'missing';
                        })()
                        "#,
                    )?;
                    if on_frame_check.as_deref() == Some("missing") {
                        eprintln!(
                            "warning: page is missing window.__onFrame after load; \
                             recorder output may stay static until the page defines it"
                        );
                    }
                    return self.flush_render(Duration::from_millis(120));
                }
                Err(error) => {
                    last_error = Some(error);
                    self.flush_render(Duration::from_millis(100))?;
                }
            }
        }
        Err(format!(
            "failed to prepare page after load: {}",
            last_error.unwrap_or_else(|| "unknown JS error".into())
        ))
    }

    /// Pumps layout and the main run loop so WebKit can flush pending updates.
    pub fn flush_render(&self, duration: Duration) -> Result<(), String> {
        self.sync_view_hierarchy();
        pump_main_run_loop(duration);
        Ok(())
    }

    fn create_web_view(target_size: NSSize) -> Result<Retained<WKWebView>, String> {
        let mtm = MainThreadMarker::new().ok_or("snapshot capture must run on the main thread")?;
        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
        unsafe {
            config.setWebsiteDataStore(&store);
            config.setMediaTypesRequiringUserActionForPlayback(WKAudiovisualMediaTypes::All);
        }
        let web_view = unsafe {
            WKWebView::initWithFrame_configuration(
                WKWebView::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), target_size),
                &config,
            )
        };
        web_view.setWantsLayer(true);
        unsafe {
            let _: () = msg_send![&web_view, _setPageMuted: 0x3u64];
        }
        Ok(web_view)
    }

    pub(super) fn sync_view_hierarchy(&self) {
        // Keep the view sized and laid out before any capture attempt.
        self.web_view
            .setFrame(NSRect::new(NSPoint::new(0.0, 0.0), self.target_size));
        self.web_view.layoutSubtreeIfNeeded();
        self.web_view.displayIfNeeded();
        self.window.displayIfNeeded();
    }

    fn park_offscreen(&self) {
        if self.offscreen_parked.replace(true) {
            return;
        }
        self.window
            .setFrameOrigin(NSPoint::new(OFFSCREEN_ORIGIN_X, OFFSCREEN_ORIGIN_Y));
        self.window.displayIfNeeded();
        self.web_view.displayIfNeeded();
    }

    fn wait_for_animation_frame(&self, _timeout: Duration) -> Result<(), String> {
        // A short compositor settle time is more reliable here than polling rAF.
        std::thread::sleep(Duration::from_millis(200));
        self.sync_view_hierarchy();
        self.flush_render(Duration::from_millis(100))?;
        Ok(())
    }

    fn current_url(&self) -> Option<String> {
        unsafe { self.web_view.URL() }
            .and_then(|url| url.absoluteString().map(|value| value.to_string()))
    }
}

fn offscreen_origin(index: usize) -> NSPoint {
    NSPoint::new(
        OFFSCREEN_ORIGIN_X - index as f64 * 64.0,
        OFFSCREEN_ORIGIN_Y - index as f64 * 48.0,
    )
}

/// Converts a file path under the server root into a percent-encoded HTTP URL.
pub fn relative_http_url(base_url: &str, root: &Path, file_path: &Path) -> Result<String, String> {
    let relative = file_path.strip_prefix(root).map_err(|_| {
        format!(
            "{} is not under server root {}",
            file_path.display(),
            root.display()
        )
    })?;
    let mut encoded = String::new();
    for (index, component) in relative.components().enumerate() {
        if index > 0 {
            encoded.push('/');
        }
        let text = component.as_os_str().to_string_lossy();
        encode_path_component(&mut encoded, &text);
    }
    Ok(format!("{base_url}/{encoded}"))
}

fn encode_path_component(output: &mut String, text: &str) {
    for byte in text.bytes() {
        let allowed = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if allowed {
            output.push(byte as char);
        } else {
            output.push('%');
            output.push_str(&format!("{byte:02X}"));
        }
    }
}

fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &date);
}
