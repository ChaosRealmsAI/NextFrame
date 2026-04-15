//! Window chrome: drag bridge, traffic light positioning, resize observer.

use std::ptr;

use objc2::runtime::{AnyObject, NSObject, ProtocolObject};
use objc2::{
    define_class, msg_send, rc::Retained, DeclaredClass, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{NSApplication, NSEvent, NSEventType, NSWindow, NSWindowButton};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSString};
use objc2_web_kit::{
    WKScriptMessage, WKScriptMessageHandler, WKUserContentController, WKUserScript,
    WKUserScriptInjectionTime, WKWebViewConfiguration,
};

pub(crate) const WINDOW_WIDTH: f64 = 1440.0;
pub(crate) const WINDOW_HEIGHT: f64 = 900.0;
pub(crate) const TOPBAR_H: f64 = 48.0;
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
    if (event.button !== 0) return;
    if (!shouldStartDrag(event.composedPath())) return;

    const handler = window.webkit?.messageHandlers?.[handlerName];
    if (!handler) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.detail >= 2) {
      handler.postMessage('zoom_window');
      return;
    }
    handler.postMessage('start_dragging');
  }, true);
})();
"#;

struct WindowDragHandlerIvars {
    controller: Retained<WKUserContentController>,
    window: *const NSWindow,
}

define_class!(
    #[unsafe(super(NSObject))] // SAFETY: `WindowDragHandler` is declared as an NSObject subclass for objc2 class registration.
    #[thread_kind = MainThreadOnly]
    #[ivars = WindowDragHandlerIvars]
    struct WindowDragHandler;

    unsafe impl NSObjectProtocol for WindowDragHandler {} // SAFETY: WindowDragHandler is an NSObject subclass that satisfies NSObjectProtocol expectations.

    unsafe impl WKScriptMessageHandler for WindowDragHandler { // SAFETY: WindowDragHandler is registered with WebKit as a main-thread script message handler.
        #[unsafe(method(userContentController:didReceiveScriptMessage:))] // SAFETY: Selector matches WKScriptMessageHandler's Objective-C callback.
        fn did_receive(
            this: &WindowDragHandler,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
        ) {
            let body = unsafe { message.body() }; // SAFETY: WebKit invokes the script-message callback with a live `WKScriptMessage`.
            let Ok(body) = body.downcast::<NSString>() else {
                return;
            };

            let msg = body.to_string();

            let Some(window) = (unsafe { this.ivars().window.as_ref() }) else { // SAFETY: install_window_drag_bridge stores a live NSWindow pointer that outlives the handler.
                return;
            };

            if msg == WINDOW_DRAG_MESSAGE {
                start_window_drag(window);
            } else if msg == "zoom_window" {
                // Use zoom with animation context for smooth transition
                unsafe { // SAFETY: NSAnimationContext is invoked on the main thread with blocks that stay alive for the message send.
                    let _: () = objc2::msg_send![
                        objc2::class!(NSAnimationContext),
                        runAnimationGroup: &*block2::RcBlock::new(move |ctx: *mut AnyObject| {
                            let _: () = objc2::msg_send![ctx, setDuration: 0.25f64];
                        }),
                        completionHandler: &*block2::RcBlock::new(|| {
                            // noop — zoom handles its own completion
                        })
                    ];
                }
                window.zoom(None);
            }
        }
    }
);

/// Install the window-drag script bridge. Returns an opaque handle that must be
/// kept alive for the bridge to work (the `WKUserContentController` retains it).
pub(crate) fn install_window_drag_bridge(
    mtm: MainThreadMarker,
    config: &WKWebViewConfiguration,
    window: &NSWindow,
) -> Retained<NSObject> {
    let controller = unsafe { config.userContentController() }; // SAFETY: config is a live WKWebViewConfiguration on the main thread.

    let source = NSString::from_str(WINDOW_DRAG_SCRIPT);
    let script = unsafe { // SAFETY: source is valid NSString content and this designated initializer must run on the main thread.
        WKUserScript::initWithSource_injectionTime_forMainFrameOnly(
            WKUserScript::alloc(mtm),
            &source,
            WKUserScriptInjectionTime::AtDocumentStart,
            true,
        )
    };
    unsafe { // SAFETY: controller is live during web view setup and addUserScript only registers the drag script.
        controller.addUserScript(&script);
    }

    let handler = mtm
        .alloc::<WindowDragHandler>()
        .set_ivars(WindowDragHandlerIvars {
            controller,
            window: window as *const NSWindow,
        });
    let handler: Retained<WindowDragHandler> = unsafe { msg_send![super(handler), init] }; // SAFETY: init is sent to a freshly allocated WindowDragHandler before any external aliasing.

    let handler_name = NSString::from_str(WINDOW_DRAG_HANDLER_NAME);
    let protocol_handler = ProtocolObject::from_ref(&*handler);
    unsafe { // SAFETY: handler implements WKScriptMessageHandler and the retained controller registers it for callbacks.
        handler
            .ivars()
            .controller
            .addScriptMessageHandler_name(protocol_handler, &handler_name);
    }

    Retained::into_super(handler)
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

    unsafe { // SAFETY: We use the current AppKit event or a synthesized left-mouse-down event before calling performWindowDragWithEvent:.
        // or synthesize a left-mouse-down event before calling `performWindowDragWithEvent:`.
        let event = if current_event.r#type().0 == 0x15 {
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
pub(crate) fn position_traffic_lights(window: &NSWindow) {
    unsafe { // SAFETY: standardWindowButton queries AppKit titlebar controls from a live NSWindow on the main thread.
        let close = window.standardWindowButton(NSWindowButton::CloseButton);
        let Some(close) = close else {
            return;
        };

        let close_frame = close.frame();
        let y = ((TOPBAR_H - close_frame.size.height) / 2.0).max(0.0);
        inset_traffic_lights(window, TRAFFIC_LIGHT_X, y);
    }
}

unsafe fn inset_traffic_lights(window: &NSWindow, x: f64, _y: f64) { // SAFETY: caller passes a live NSWindow on the main thread before mutating titlebar subviews.
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
pub(crate) fn register_resize_observer(window: &NSWindow) {
    unsafe { // SAFETY: notification-center access and observer registration happen on the main thread for a window that lives for the app run loop.
        let center: *mut AnyObject = msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

        // Only reposition AFTER animations/resize complete — not during.
        // NSWindowDidResizeNotification fires every frame during zoom → causes jank.
        let names = [
            "NSWindowDidEndLiveResizeNotification",
            "NSWindowDidBecomeKeyNotification",
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
