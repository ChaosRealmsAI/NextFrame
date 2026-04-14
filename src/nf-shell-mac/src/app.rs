//! NSApplication + NSWindow setup for NextFrame desktop.

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

use crate::webview;

const WINDOW_WIDTH: f64 = 1440.0;
const WINDOW_HEIGHT: f64 = 900.0;

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

    // Create WKWebView and set as content
    match webview::create(mtm, NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT)) {
        Ok(wv) => {
            window.setContentView(Some(&wv));
        }
        Err(e) => {
            tracing::error!("failed to create webview: {e}");
            return;
        }
    }

    window.makeKeyAndOrderFront(None);

    // SAFETY: activateIgnoringOtherApps: and run are valid NSApplication methods.
    unsafe {
        let _: () = msg_send![&app, activateIgnoringOtherApps: true];
    }

    tracing::info!("NextFrame window ready");

    app.run();
}
