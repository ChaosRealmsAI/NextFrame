//! NSApplication + NSWindow setup for NextFrame desktop.

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSView, NSWindow,
    NSWindowButton, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

use crate::webview;

const WINDOW_WIDTH: f64 = 1440.0;
const WINDOW_HEIGHT: f64 = 900.0;
const TOPBAR_HEIGHT: f64 = 48.0;

/// Boot the macOS app: create window, embed WKWebView, run event loop.
pub fn run() {
    let Some(mtm) = MainThreadMarker::new() else {
        tracing::error!("must run on main thread");
        return;
    };

    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);

    // Dark appearance
    // SAFETY: setAppearance: is a valid NSApplication method.
    unsafe {
        let dark_name = NSString::from_str("NSAppearanceNameDarkAqua");
        let appearance: Option<Retained<objc2_app_kit::NSAppearance>> =
            objc2_app_kit::NSAppearance::appearanceNamed(&dark_name);
        if let Some(ref a) = appearance {
            let ptr: *const objc2_app_kit::NSAppearance = Retained::as_ptr(a);
            let _: () = msg_send![&app, setAppearance: ptr];
        }
    }

    let style = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Resizable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::FullSizeContentView;

    let rect = NSRect::new(
        NSPoint::new(100.0, 100.0),
        NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
    );

    // SAFETY: mtm proves main-thread, arguments form a valid window initializer.
    let window: Retained<NSWindow> = unsafe {
        msg_send![
            NSWindow::alloc(mtm),
            initWithContentRect: rect,
            styleMask: style,
            backing: NSBackingStoreType::Buffered,
            defer: false
        ]
    };

    window.setTitle(&NSString::from_str("NextFrame"));
    window.center();

    // Transparent titlebar — content extends behind it, traffic lights inline
    // SAFETY: these are valid NSWindow property setters.
    unsafe {
        let _: () = msg_send![&window, setTitlebarAppearsTransparent: true];
        let _: () = msg_send![&window, setTitleVisibility: 1i64]; // NSWindowTitleHidden = 1
    }

    // Enable window dragging from topbar area via movableByWindowBackground
    // The HTML topbar has -webkit-app-region: drag set on it
    // SAFETY: setMovableByWindowBackground: is valid for NSWindow.
    unsafe {
        let _: () = msg_send![&window, setMovableByWindowBackground: true];
    }

    // Center traffic lights using Zed approach:
    // 1. Get real titlebar height from contentLayoutRect
    // 2. Resize NSTitlebarContainerView to match our topbar
    // 3. Center buttons within container
    reposition_traffic_lights(&window);

    // Create WKWebView and set as content
    let wv = match webview::create(mtm, NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT)) {
        Ok(wv) => wv,
        Err(e) => {
            tracing::error!("failed to create webview: {e}");
            return;
        }
    };
    window.setContentView(Some(&wv));

    window.makeKeyAndOrderFront(None);

    // Reapply after content is set (system may reset)
    reposition_traffic_lights(&window);

    // Auto-screenshot if --screenshot flag passed
    if std::env::args().any(|a| a == "--screenshot") {
        let out = "/tmp/nf-screenshot.png";
        match webview::screenshot(&wv, out) {
            Ok(()) => tracing::info!("screenshot: {out}"),
            Err(e) => tracing::error!("screenshot failed: {e}"),
        }
        std::process::exit(0);
    }

    // SAFETY: activateIgnoringOtherApps: is valid for NSApplication.
    unsafe {
        let _: () = msg_send![&app, activateIgnoringOtherApps: true];
    }

    tracing::info!("NextFrame window ready");

    app.run();
}

/// Reposition traffic lights to vertically center in topbar.
/// Uses the Zed/syllo approach: find NSTitlebarContainerView, resize it,
/// then center the button bar within it.
fn reposition_traffic_lights(window: &NSWindow) {
    // Get close button → its superview (button bar) → superview (NSTitlebarContainerView)
    let close_btn = match window.standardWindowButton(NSWindowButton::CloseButton) {
        Some(b) => b,
        None => return,
    };

    // Navigate up: close_btn → button_bar → titlebar_container
    // SAFETY: superview is valid for any NSView in the hierarchy.
    let button_bar: Option<Retained<NSView>> = unsafe { close_btn.superview() };
    let Some(ref bar) = button_bar else { return };

    // SAFETY: superview is valid for any NSView in the hierarchy.
    let container: Option<Retained<NSView>> = unsafe { bar.superview() };
    let Some(ref container) = container else { return };

    // Resize container to match our topbar height
    let container_frame = container.frame();
    let window_frame = window.frame();
    // SAFETY: setFrame: is valid for NSView.
    unsafe {
        let _: () = msg_send![
            container,
            setFrame: NSRect::new(
                NSPoint::new(container_frame.origin.x, window_frame.size.height - TOPBAR_HEIGHT),
                NSSize::new(container_frame.size.width, TOPBAR_HEIGHT),
            )
        ];
    }

    // Center button bar vertically within container
    let bar_frame = bar.frame();
    let bar_y = (TOPBAR_HEIGHT - bar_frame.size.height) / 2.0;
    // SAFETY: setFrameOrigin: is valid for NSView.
    unsafe {
        let _: () = msg_send![bar, setFrameOrigin: NSPoint::new(bar_frame.origin.x, bar_y)];
    }
}
