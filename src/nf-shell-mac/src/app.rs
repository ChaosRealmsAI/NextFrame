//! NSApplication + NSWindow setup for NextFrame desktop.

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSAutoresizingMaskOptions, NSBackingStoreType,
    NSView, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

use crate::verify;
use crate::window::{self, WINDOW_HEIGHT, WINDOW_WIDTH};
use crate::{protocol, webview};

/// Boot the macOS app: create window, embed WKWebView, run event loop.
pub fn run() {
    let Some(mtm) = MainThreadMarker::new() else {
        tracing::error!("must run on main thread");
        return;
    };

    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);

    // Dark appearance
    unsafe {
        // SAFETY: `app` is a live NSApplication on the main thread, and these selectors are valid AppKit APIs.
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

    let window: Retained<NSWindow> = unsafe {
        // SAFETY: NSWindow designated initializer called with valid rect, style, backing on the main thread.
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

    // Window background matches app background — prevents gray flash during resize
    unsafe {
        // SAFETY: NSColor factory method and setBackgroundColor are valid AppKit calls on the main thread.
        let bg_color: *mut AnyObject = msg_send![
            objc2::class!(NSColor),
            colorWithRed: 0.020f64,
            green: 0.020f64,
            blue: 0.027f64,
            alpha: 1.0f64
        ]; // #050507
        let _: () = msg_send![&window, setBackgroundColor: bg_color];
    }

    // Transparent titlebar
    unsafe {
        // SAFETY: `window` is a live NSWindow and both setters are standard NSWindow configuration.
        let _: () = msg_send![&window, setTitlebarAppearsTransparent: true];
        let _: () = msg_send![&window, setTitleVisibility: 1i64]; // NSWindowTitleHidden
    }

    // Create a container view to hold the full-window WKWebView.
    let container = NSView::initWithFrame(
        mtm.alloc::<NSView>(),
        NSRect::new(
            NSPoint::new(0.0, 0.0),
            NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
        ),
    );
    container.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    // Create WKWebView with IPC + drag bridges
    let scheme_handlers = protocol::create_handlers(mtm);
    let mut drag_handler = None;
    let mut ipc_handler: Option<Retained<crate::ipc::BridgeHandler>> = None;
    let wv = match webview::create(
        mtm,
        NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
        &scheme_handlers,
        |config| {
            drag_handler = Some(window::install_window_drag_bridge(mtm, config, &window));
            ipc_handler = Some(crate::ipc::install(mtm, config, std::ptr::null()));
        },
    ) {
        Ok(wv) => wv,
        Err(e) => {
            tracing::error!("failed to create webview: {e}");
            return;
        }
    };
    wv.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    container.addSubview(&wv);
    window.setContentView(Some(&container));
    window.makeKeyAndOrderFront(None);

    let _drag_handler = drag_handler;
    let _scheme_handlers = scheme_handlers;

    // Set webview pointer for IPC (must happen after WKWebView is created)
    if let Some(ref handler) = ipc_handler {
        crate::ipc::set_webview(handler, &wv);
    }
    let _ipc_handler = ipc_handler;

    // Position traffic lights to align with HTML topbar center
    window::position_traffic_lights(&window);
    window::register_resize_observer(&window);

    // Auto-screenshot
    if std::env::args().any(|a| a == "--screenshot") {
        let out = "/tmp/nf-screenshot.png";
        match webview::screenshot(&wv, out) {
            Ok(()) => tracing::info!("screenshot: {out}"),
            Err(e) => tracing::error!("screenshot failed: {e}"),
        }
        std::process::exit(0);
    }

    // Self-verification mode
    if std::env::args().any(|a| a == "--verify") {
        verify::verify_app(&wv);
        std::process::exit(0);
    }

    // Eval-script mode: run JS from file, screenshot, exit
    if let Some(script_path) = std::env::args().skip_while(|a| a != "--eval-script").nth(1) {
        verify::eval_script_mode(&wv, &script_path);
        std::process::exit(0);
    }

    unsafe {
        // SAFETY: activateIgnoringOtherApps is a standard NSApplication method on the main thread.
        let _: () = msg_send![&app, activateIgnoringOtherApps: true];
    }

    tracing::info!("NextFrame window ready");
    app.run();
}
