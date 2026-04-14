//! NSApplication + NSWindow setup for NextFrame desktop.

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSWindow,
    NSWindowButton, NSWindowStyleMask,
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

    // Transparent titlebar — content extends behind it
    // SAFETY: these are valid NSWindow property setters.
    unsafe {
        let _: () = msg_send![&window, setTitlebarAppearsTransparent: true];
        let _: () = msg_send![&window, setTitleVisibility: 1i64]; // NSWindowTitleHidden = 1
        let _: () = msg_send![&window, setMovableByWindowBackground: true];
    }

    // Position traffic lights
    position_traffic_lights(&window);

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

    // Reapply after content view is set
    position_traffic_lights(&window);

    // Register for resize notifications to reapply traffic light positions
    register_resize_observer(&window);

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

/// Reposition traffic lights using proven automedia/Zed approach:
/// read real titlebar height from contentLayoutRect, set full frame per button.
fn position_traffic_lights(window: &NSWindow) {
    let padding_x = 13.0f64;
    let padding_y = 10.0f64;

    // SAFETY: standardWindowButton, frame, contentLayoutRect, setFrame are valid NSWindow/NSView methods.
    unsafe {
        let close = window.standardWindowButton(NSWindowButton::CloseButton);
        let mini = window.standardWindowButton(NSWindowButton::MiniaturizeButton);
        let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);

        let (Some(close), Some(mini), Some(zoom)) = (close, mini, zoom) else {
            return;
        };

        // Real titlebar height = window frame height - content layout rect height
        let win_frame = window.frame();
        let content_rect: NSRect = msg_send![window, contentLayoutRect];
        let titlebar_h = win_frame.size.height - content_rect.size.height;

        let close_frame = close.frame();
        let mini_frame = mini.frame();
        let btn_h = close_frame.size.height;
        let spacing = mini_frame.origin.x - close_frame.origin.x;

        // Y from bottom of titlebar area
        let y = titlebar_h - padding_y - btn_h;
        let mut x = padding_x;

        let mut cf = close_frame;
        cf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*close, setFrame: cf];
        x += spacing;

        let mut mf = mini_frame;
        mf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*mini, setFrame: mf];
        x += spacing;

        let mut zf = zoom.frame();
        zf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*zoom, setFrame: zf];
    }
}

/// Register NSNotificationCenter observer for window resize/fullscreen
/// to reapply traffic light positions (system resets them on resize).
fn register_resize_observer(window: &NSWindow) {
    // SAFETY: NSNotificationCenter and block-based observer registration are standard APIs.
    unsafe {
        let center: *mut AnyObject = msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

        // We observe multiple notification names that can reset button positions
        let names = [
            "NSWindowDidResizeNotification",
            "NSWindowDidMoveNotification",
            "NSWindowDidBecomeKeyNotification",
            "NSWindowDidEndLiveResizeNotification",
            "NSWindowWillEnterFullScreenNotification",
            "NSWindowDidExitFullScreenNotification",
        ];

        for name in names {
            let window_ptr: *const NSWindow = window as *const NSWindow;
            let ns_name = NSString::from_str(name);

            // Use a C function pointer callback via block
            let block = block2::RcBlock::new(move |_notif: *mut AnyObject| {
                // SAFETY: window_ptr is valid for the lifetime of the app.
                let win: &NSWindow = &*window_ptr;
                position_traffic_lights(win);
            });

            let _: *mut AnyObject = msg_send![
                center,
                addObserverForName: &*ns_name,
                object: window_ptr as *const AnyObject,
                queue: std::ptr::null::<AnyObject>(),
                usingBlock: &*block
            ];
        }
    }
}
