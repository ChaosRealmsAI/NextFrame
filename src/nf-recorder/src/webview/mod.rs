//! `WKWebView` hosting and frame-capture helpers for the recorder.

mod capture;
mod frame;
mod inject;
mod navigation;
mod parallel;

use std::cell::Cell;
use std::time::Duration;

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSFloatingWindowLevel,
    NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use objc2_web_kit::{
    WKAudiovisualMediaTypes, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

use self::frame::{offscreen_origin, pump_main_run_loop};

pub(crate) use navigation::relative_http_url;
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
        // SAFETY: `mtm` proves main-thread access, and these arguments form a valid window initializer.
        let window: Retained<NSWindow> = unsafe {
            // SAFETY: see above.
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
        // SAFETY: `window` is live, and `setIgnoresMouseEvents:` is valid for an initialized window.
        unsafe {
            // SAFETY: see above.
            let _: () = msg_send![&window, setIgnoresMouseEvents: true];
        }
        if headed {
            window.setLevel(NSFloatingWindowLevel);
            window.orderFrontRegardless();
            pump_main_run_loop(Duration::from_millis(150));
        } else {
            // SAFETY: `window` is live, and these setters only adjust presentation attributes.
            unsafe {
                // SAFETY: see above.
                let _: () = msg_send![&window, setAlphaValue: 0.0f64];
                let _: () = msg_send![&window, setOpaque: false];
                let _: () = msg_send![&window, setHasShadow: false];
            }
        }

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
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            crate::internal_error_with_fix(
                "reset the recorder WKWebView",
                "WKWebView reset must run on the main thread",
                "Retry from the normal macOS recorder entry point so WebKit runs on the main thread.",
            )
        })?;
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

    fn create_web_view(target_size: NSSize) -> Result<Retained<WKWebView>, String> {
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            crate::internal_error_with_fix(
                "create the recorder WKWebView",
                "WKWebView creation must run on the main thread",
                "Retry from the normal macOS recorder entry point so WebKit runs on the main thread.",
            )
        })?;
        // SAFETY: `mtm` proves main-thread access, which `WKWebViewConfiguration::new` requires.
        let config = unsafe { WKWebViewConfiguration::new(mtm) }; // SAFETY: see above.
        // SAFETY: `mtm` proves main-thread access, which `nonPersistentDataStore` requires.
        let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) }; // SAFETY: see above.
        // SAFETY: `config` and `store` are live WebKit objects being configured before initialization.
        unsafe {
            // SAFETY: see above.
            config.setWebsiteDataStore(&store);
            config.setMediaTypesRequiringUserActionForPlayback(WKAudiovisualMediaTypes::All);
        }
        // SAFETY: `mtm`, the frame, and `config` satisfy `WKWebView`'s designated initializer contract.
        let web_view = unsafe {
            // SAFETY: see above.
            WKWebView::initWithFrame_configuration(
                WKWebView::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), target_size),
                &config,
            )
        };
        web_view.setWantsLayer(true);
        // SAFETY: `web_view` responds to `_setPageMuted:` on macOS, and this only toggles mute state.
        unsafe {
            // SAFETY: see above.
            let _: () = msg_send![&web_view, _setPageMuted: 0x3u64];
        }
        Ok(web_view)
    }
}
