//! keyboard module exports
mod input;
mod shortcuts;

use objc2::msg_send;
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType};
use objc2_foundation::NSPoint;
use objc2_web_kit::WKWebView;

use crate::error::with_objc_boundary;

pub(crate) use input::{add_tag, jitter, paste_text_native, send_key_command, type_text_native};
pub(crate) use shortcuts::install_browser_shortcuts;

fn catch_objc(f: impl FnOnce()) -> Result<(), String> {
    with_objc_boundary("send native keyboard input", f)
}

fn native_click_at(webview: &WKWebView, x: f64, y: f64) {
    let frame = webview.frame();
    let jx = (jitter(0, 2, x as u64) as f64) - 1.0;
    let jy = (jitter(0, 2, y as u64) as f64) - 1.0;
    let point = NSPoint::new(x + jx, frame.size.height - y + jy);
    let win_num = webview.window().map(|w| w.windowNumber()).unwrap_or(0);

    let down = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::LeftMouseDown,
        point,
        NSEventModifierFlags::empty(),
        0.0,
        win_num,
        None,
        0,
        1,
        1.0,
    );
    if let Some(event) = &down {
        let _ = catch_objc(|| {
            // SAFETY: `webview` is a live WKWebView and `mouseDown:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseDown: &**event] }; // SAFETY: `webview` is a live WKWebView and `mouseDown:` is a valid responder selector for the synthesized NSEvent.
        });
    }

    let up = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::LeftMouseUp,
        point,
        NSEventModifierFlags::empty(),
        0.0,
        win_num,
        None,
        0,
        1,
        0.0,
    );
    if let Some(event) = &up {
        let _ = catch_objc(|| {
            // SAFETY: `webview` is a live WKWebView and `mouseUp:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseUp: &**event] }; // SAFETY: `webview` is a live WKWebView and `mouseUp:` is a valid responder selector for the synthesized NSEvent.
        });
    }
}
