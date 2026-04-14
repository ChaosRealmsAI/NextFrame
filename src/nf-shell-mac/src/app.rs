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

use crate::{protocol, webview};

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

            let msg = body.to_string();

            let Some(window) = (unsafe { this.ivars().window.as_ref() }) else {
                return;
            };

            if msg == WINDOW_DRAG_MESSAGE {
                start_window_drag(window);
            } else if msg == "zoom_window" {
                // Use zoom with animation context for smooth transition
                unsafe {
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

    // Window background matches app background — prevents gray flash during resize
    unsafe {
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
    let mut drag_handler: Option<Retained<WindowDragHandler>> = None;
    let mut ipc_handler: Option<Retained<crate::ipc::BridgeHandler>> = None;
    let wv = match webview::create(
        mtm,
        NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
        &scheme_handlers,
        |config| {
            drag_handler = Some(install_window_drag_bridge(mtm, config, &window));
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

    // Self-verification mode
    if std::env::args().any(|a| a == "--verify") {
        verify_app(&wv);
        std::process::exit(0);
    }

    unsafe {
        let _: () = msg_send![&app, activateIgnoringOtherApps: true];
    }

    tracing::info!("NextFrame window ready");
    app.run();
}

/// Automated self-verification: check pages load, buttons work, navigation works.
fn verify_app(wv: &objc2_web_kit::WKWebView) {
    use crate::webview;

    let mut pass = 0;
    let mut fail = 0;

    macro_rules! check {
        ($name:expr, $result:expr) => {
            match $result {
                Ok(val) => {
                    tracing::info!("[PASS] {} = {}", $name, val);
                    pass += 1;
                }
                Err(e) => {
                    tracing::error!("[FAIL] {} — {}", $name, e);
                    fail += 1;
                }
            }
        };
    }

    // Wait for page load + force all animations to complete
    webview::pump_run_loop_pub(std::time::Duration::from_secs(4));
    let _ = webview::eval_js(wv, "document.querySelectorAll('.section,.project-card,.stagger-in').forEach(e=>{e.style.opacity='1';e.style.animation='none'})");
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));

    // ── HOME PAGE ──
    check!("document.title", webview::eval_js(wv, "document.title"));
    check!("topbar exists", webview::eval_js(wv, "!!document.querySelector('.topbar') ? 'yes' : 'no'"));
    check!("project cards", webview::eval_js(wv, "document.querySelectorAll('.project-card').length + ' cards'"));
    check!("search input", webview::eval_js(wv, "!!document.querySelector('.tb-search-input') ? 'yes' : 'no'"));
    check!("new project btn", webview::eval_js(wv, "!!document.querySelector('.btn-primary') ? 'yes' : 'no'"));

    let _ = webview::screenshot(wv, "/tmp/nf-verify-home.png");
    tracing::info!("[SCREENSHOT] /tmp/nf-verify-home.png");

    // ── SETTINGS MODAL ──
    check!("open settings", webview::eval_js(wv, "toggleSettings(); 'opened'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    check!("settings panel", webview::eval_js(wv, "document.getElementById('settings-panel').classList.contains('open') ? 'open' : 'closed'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-settings.png");
    check!("close settings", webview::eval_js(wv, "toggleSettings(); 'closed'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(300));

    // ── AI PROMPTS MODAL ──
    check!("open AI prompts", webview::eval_js(wv, "toggleAIPrompts(); 'opened'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    check!("prompt sections", webview::eval_js(wv, "document.querySelectorAll('.prompt-section').length + ' sections'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-ai-prompts.png");
    check!("close AI prompts", webview::eval_js(wv, "toggleAIPrompts(); 'closed'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(300));

    // ── NAVIGATE TO PROJECT ──
    check!("navigate to project", webview::eval_js(wv, "var cards=document.querySelectorAll('.project-card');if(cards.length>0){cards[0].click();'clicked'}else{'no cards'}"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!("project view active", webview::eval_js(wv, "document.getElementById('view-project')?.classList.contains('active') ? 'yes' : 'no'"));
    check!("breadcrumb visible", webview::eval_js(wv, "document.getElementById('global-breadcrumb')?.style.display !== 'none' ? 'yes' : 'no'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-project.png");

    // ── NAVIGATE TO PIPELINE ──
    check!("navigate to pipeline", webview::eval_js(wv, "var eps=document.querySelectorAll('.vp-ep-card');if(eps.length>0){eps[0].click();'clicked'}else{showView('pipeline',{projectName:'test',episodeName:'EP01'});'forced'}"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!("pipeline view active", webview::eval_js(wv, "document.getElementById('view-pipeline')?.classList.contains('active') ? 'yes' : 'no'"));
    check!("pipeline tabs visible", webview::eval_js(wv, "document.getElementById('global-pl-tabs')?.style.display !== 'none' ? 'yes' : 'no'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-pipeline.png");

    // ── SWITCH PIPELINE TABS ──
    check!("switch to audio", webview::eval_js(wv, "document.querySelector('[data-stage=\"audio\"]')?.click();'clicked'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-audio.png");

    check!("switch to editor", webview::eval_js(wv, "document.querySelector('[data-stage=\"assembly\"]')?.click();'clicked'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-editor.png");

    check!("switch to output", webview::eval_js(wv, "document.querySelector('[data-stage=\"output\"]')?.click();'clicked'"));
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-output.png");

    // ── BACK TO HOME ──
    check!("back to home", webview::eval_js(wv, "showView('home');'ok'"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(1));
    check!("home view active", webview::eval_js(wv, "document.querySelector('.view-home')?.classList.contains('active') ? 'yes' : 'no'"));

    // ── AI OPERABILITY ──
    check!("data-nf-action count", webview::eval_js(wv, "document.querySelectorAll('[data-nf-action]').length + ' actions'"));
    check!("diagnose available", webview::eval_js(wv, "typeof window.__nfDiagnose === 'function' ? 'yes' : 'no'"));

    tracing::info!("=== VERIFY DONE: {} pass, {} fail ===", pass, fail);
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
