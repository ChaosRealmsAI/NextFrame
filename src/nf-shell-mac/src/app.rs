//! NSApplication + NSWindow setup for NextFrame desktop.

use std::ptr;

use objc2::runtime::{AnyObject, NSObject, ProtocolObject};
use objc2::{
    define_class, msg_send, rc::Retained, DeclaredClass, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSAutoresizingMaskOptions, NSBackingStoreType,
    NSEvent, NSEventType, NSView, NSWindow, NSWindowButton, NSWindowStyleMask,
};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};
use objc2_web_kit::{
    WKScriptMessage, WKScriptMessageHandler, WKUserContentController, WKUserScript,
    WKUserScriptInjectionTime, WKWebViewConfiguration,
};

use crate::webview;

const WINDOW_WIDTH: f64 = 1440.0;
const WINDOW_HEIGHT: f64 = 900.0;
const TOPBAR_H: f64 = 48.0;
const TRAFFIC_LIGHT_X: f64 = 14.0;
const WINDOW_DRAG_HANDLER_NAME: &str = "nfWindowDrag";
const WINDOW_DRAG_MESSAGE: &str = "start_dragging";
const WINDOW_DRAG_SCRIPT: &str = r#"
(() => {
  // Hide HTML fake traffic lights + add padding for native ones
  document.addEventListener('DOMContentLoaded', () => {
    const dots = document.querySelector('.tb-traffic-lights');
    if (dots) dots.style.display = 'none';
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.paddingLeft = '80px';
  });

  const handlerName = 'nfWindowDrag';
  const clickableTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
  const interactiveRoles = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option']);

  function isClickableElement(el) {
    return clickableTags.has(el.tagName)
      || (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
      || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')
      || interactiveRoles.has(el.getAttribute('role'));
  }

  function shouldStartDrag(path) {
    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue;
      if (isClickableElement(node)) return false;
      if (node.classList.contains('topbar')) return true;
    }
    return false;
  }

  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.detail !== 1) return;
    if (!shouldStartDrag(event.composedPath())) return;

    const handler = window.webkit?.messageHandlers?.[handlerName];
    if (!handler) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    handler.postMessage('start_dragging');
  }, true);
})();
"#;

struct WindowDragHandlerIvars {
    controller: Retained<WKUserContentController>,
    window: *const NSWindow,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = WindowDragHandlerIvars]
    struct WindowDragHandler;

    unsafe impl NSObjectProtocol for WindowDragHandler {}

    unsafe impl WKScriptMessageHandler for WindowDragHandler {
        #[unsafe(method(userContentController:didReceiveScriptMessage:))]
        fn did_receive(
            this: &WindowDragHandler,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
        ) {
            // SAFETY: WebKit invokes the script-message callback with a live `WKScriptMessage`.
            let body = unsafe { message.body() };
            let Ok(body) = body.downcast::<NSString>() else {
                return;
            };

            if body.to_string() != WINDOW_DRAG_MESSAGE {
                return;
            }

            let Some(window) = (unsafe { this.ivars().window.as_ref() }) else {
                return;
            };

            start_window_drag(window);
        }
    }
);

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

    // Create WKWebView
    let mut drag_handler: Option<Retained<WindowDragHandler>> = None;
    let wv = match webview::create(mtm, NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT), |config| {
        drag_handler = Some(install_window_drag_bridge(mtm, config, &window));
    }) {
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

    // Position traffic lights to align with HTML topbar center
    position_traffic_lights(&window);
    register_resize_observer(&window);

    // Auto-screenshot
    if std::env::args().any(|a| a == "--screenshot") {
        let out = "/tmp/nf-screenshot.png";
        match webview::screenshot(&wv, out) {
            Ok(()) => tracing::info!("screenshot: {out}"),
            Err(e) => tracing::error!("screenshot failed: {e}"),
        }
        std::process::exit(0);
    }

    unsafe {
        let _: () = msg_send![&app, activateIgnoringOtherApps: true];
    }

    tracing::info!("NextFrame window ready");
    app.run();
}

fn install_window_drag_bridge(
    mtm: MainThreadMarker,
    config: &WKWebViewConfiguration,
    window: &NSWindow,
) -> Retained<WindowDragHandler> {
    // SAFETY: `config` is a live configuration object created on the main thread.
    let controller = unsafe { config.userContentController() };

    let source = NSString::from_str(WINDOW_DRAG_SCRIPT);
    let script = unsafe {
        // SAFETY: The script is injected into the main frame before page scripts run.
        WKUserScript::initWithSource_injectionTime_forMainFrameOnly(
            WKUserScript::alloc(mtm),
            &source,
            WKUserScriptInjectionTime::AtDocumentStart,
            true,
        )
    };
    unsafe {
        // SAFETY: `controller` is retained and accepts user scripts during web view setup.
        controller.addUserScript(&script);
    }

    let handler = mtm
        .alloc::<WindowDragHandler>()
        .set_ivars(WindowDragHandlerIvars {
            controller,
            window: window as *const NSWindow,
        });
    let handler: Retained<WindowDragHandler> = unsafe { msg_send![super(handler), init] };

    let handler_name = NSString::from_str(WINDOW_DRAG_HANDLER_NAME);
    let protocol_handler = ProtocolObject::from_ref(&*handler);
    unsafe {
        // SAFETY: `handler` implements `WKScriptMessageHandler`, and the controller retains the bridge.
        handler
            .ivars()
            .controller
            .addScriptMessageHandler_name(protocol_handler, &handler_name);
    }

    handler
}

fn start_window_drag(window: &NSWindow) {
    let Some(mtm) = MainThreadMarker::new() else {
        tracing::error!("window drag must run on main thread");
        return;
    };

    let app = NSApplication::sharedApplication(mtm);
    let Some(current_event) = app.currentEvent() else {
        return;
    };

    unsafe {
        // SAFETY: We mirror Tao's macOS drag path: use the current AppKit event when possible,
        // or synthesize a left-mouse-down event before calling `performWindowDragWithEvent:`.
        let event = if current_event.r#type().0 as usize == 0x15 {
            let event: Retained<NSEvent> = msg_send![
                objc2::class!(NSEvent),
                mouseEventWithType: NSEventType::LeftMouseDown,
                location: NSEvent::mouseLocation(),
                modifierFlags: current_event.modifierFlags(),
                timestamp: current_event.timestamp(),
                windowNumber: current_event.windowNumber(),
                context: ptr::null::<NSObject>(),
                eventNumber: 0isize,
                clickCount: 1isize,
                pressure: 1.0f32
            ];
            event
        } else {
            current_event
        };

        let _: () = msg_send![window, performWindowDragWithEvent: &*event];
    }
}

/// Reposition traffic lights to vertically center in our 48px HTML topbar.
fn position_traffic_lights(window: &NSWindow) {
    unsafe {
        // SAFETY: Standard titlebar buttons are queried from a live NSWindow on the main thread.
        let close = window.standardWindowButton(NSWindowButton::CloseButton);
        let Some(close) = close else {
            return;
        };

        let close_frame = close.frame();
        let y = ((TOPBAR_H - close_frame.size.height) / 2.0).max(0.0);
        inset_traffic_lights(window, TRAFFIC_LIGHT_X, y);
    }
}

unsafe fn inset_traffic_lights(window: &NSWindow, x: f64, _y: f64) {
    // SAFETY: This follows Wry's macOS inset strategy: resize the titlebar container view,
    // then move the standard buttons horizontally so AppKit keeps them aligned on relayout.
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);

    let Some(title_bar_container_view) = close.superview().and_then(|view| view.superview()) else {
        return;
    };

    let close_rect = close.frame();
    let btn_h = close_rect.size.height;

    // Resize container to match our full 48px topbar
    let mut title_bar_rect = title_bar_container_view.frame();
    title_bar_rect.size.height = TOPBAR_H;
    title_bar_rect.origin.y = window.frame().size.height - TOPBAR_H;
    let _: () = msg_send![&title_bar_container_view, setFrame: title_bar_rect];

    let space_between = miniaturize.frame().origin.x - close_rect.origin.x;

    // Center buttons vertically in 48px container
    let btn_y = (TOPBAR_H - btn_h) / 2.0;

    close.setFrameOrigin(NSPoint::new(x, btn_y));
    miniaturize.setFrameOrigin(NSPoint::new(x + space_between, btn_y));
    if let Some(zoom) = zoom {
        zoom.setFrameOrigin(NSPoint::new(x + (space_between * 2.0), btn_y));
    }
}

/// Register resize/layout notifications to reapply traffic light positions.
fn register_resize_observer(window: &NSWindow) {
    unsafe {
        // SAFETY: The default notification center is process-global and the observed window outlives the app run loop.
        let center: *mut AnyObject = msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

        let names = [
            "NSWindowDidResizeNotification",
            "NSWindowDidBecomeKeyNotification",
            "NSWindowDidEndLiveResizeNotification",
            "NSWindowDidExitFullScreenNotification",
        ];

        for name in names {
            let window_ptr: *const NSWindow = window as *const NSWindow;
            let ns_name = NSString::from_str(name);

            let block = block2::RcBlock::new(move |_notif: *mut AnyObject| {
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
