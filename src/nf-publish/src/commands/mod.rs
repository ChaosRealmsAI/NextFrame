//! command module exports
use std::panic::AssertUnwindSafe;

mod input;
mod navigation;
mod parser;
mod query;
mod system;
mod tab;

use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType};
use objc2_foundation::{NSPoint, NSString};
use objc2_web_kit::WKWebView;

use crate::error::{ensure_fix, error_with_fix};
use crate::eval::eval_js;
use crate::keyboard::jitter;

pub(super) use parser::{
    parse_command_token, parse_coords, parse_rect, parse_selector_and_timeout,
    parse_selector_and_value, parse_selector_arg, parse_selector_pair, parse_xy_args,
};

pub(super) fn js_string(result: *mut AnyObject) -> String {
    if result.is_null() {
        "null".to_owned()
    } else {
        // SAFETY: these command helpers only use JS wrappers that stringify non-null results to NSString.
        let s: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
        s.to_string()
    }
}

pub(super) fn write_error(result_path: &str, err: impl std::fmt::Display) {
    let message = ensure_fix(
        err.to_string(),
        "complete the publish command",
        "Check the command arguments and current browser tab state, then retry.",
    );
    let _ = std::fs::write(result_path, format!("error: {message}"));
}

pub(super) fn write_result(result_path: &str, value: impl AsRef<[u8]>) {
    let _ = std::fs::write(result_path, value);
}

pub(super) fn catch_objc(f: impl FnOnce()) -> Result<(), String> {
    // SAFETY: `objc2::exception::catch` is the intended wrapper around Objective-C message sends in this module.
    let result = unsafe { objc2::exception::catch(AssertUnwindSafe(f)) }; // SAFETY: see comment above.
    result.map_err(|e| {
        error_with_fix(
            "perform the macOS publish UI action",
            format!("Objective-C raised an exception: {e:?}"),
            "Retry after the UI settles. If it keeps failing, restart nf-publish.",
        )
    })
}

fn css_point(webview: &WKWebView, x: f64, y: f64) -> NSPoint {
    let frame = webview.frame();
    NSPoint::new(x, frame.size.height - y)
}

fn send_mouse_event(
    webview: &WKWebView,
    event_type: NSEventType,
    point: NSPoint,
    event_number: isize,
    click_count: isize,
    pressure: f32,
) -> Result<(), String> {
    let win_num = webview.window().map(|w| w.windowNumber()).unwrap_or(0);
    let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        event_type,
        point,
        NSEventModifierFlags::empty(),
        0.0,
        win_num,
        None,
        event_number,
        click_count,
        pressure,
    )
    .ok_or_else(|| {
        error_with_fix(
            "create the native mouse event",
            format!("AppKit did not create a `{event_type:?}` event"),
            "Retry the command after the target window becomes active.",
        )
    })?;

    catch_objc(|| match event_type {
        NSEventType::LeftMouseDown => {
            // SAFETY: `webview` is a live WKWebView and `mouseDown:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseDown: &*event] }; // SAFETY: see comment above.
        }
        NSEventType::LeftMouseUp => {
            // SAFETY: `webview` is a live WKWebView and `mouseUp:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseUp: &*event] }; // SAFETY: see comment above.
        }
        NSEventType::RightMouseDown => {
            // SAFETY: `webview` is a live WKWebView and `rightMouseDown:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, rightMouseDown: &*event] }; // SAFETY: see comment above.
        }
        NSEventType::RightMouseUp => {
            // SAFETY: `webview` is a live WKWebView and `rightMouseUp:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, rightMouseUp: &*event] }; // SAFETY: see comment above.
        }
        NSEventType::MouseMoved => {
            // SAFETY: `webview` is a live WKWebView and `mouseMoved:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseMoved: &*event] }; // SAFETY: see comment above.
        }
        NSEventType::LeftMouseDragged => {
            // SAFETY: `webview` is a live WKWebView and `mouseDragged:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, mouseDragged: &*event] }; // SAFETY: see comment above.
        }
        _ => {}
    })
}

pub(super) fn native_hover_at(webview: &WKWebView, x: f64, y: f64) -> Result<(), String> {
    send_mouse_event(
        webview,
        NSEventType::MouseMoved,
        css_point(webview, x, y),
        0,
        0,
        0.0,
    )
}

pub(super) fn native_right_click_at(webview: &WKWebView, x: f64, y: f64) -> Result<(), String> {
    let point = css_point(webview, x, y);
    send_mouse_event(webview, NSEventType::RightMouseDown, point, 0, 1, 1.0)?;
    send_mouse_event(webview, NSEventType::RightMouseUp, point, 1, 1, 0.0)
}

pub(super) fn native_double_click_at(webview: &WKWebView, x: f64, y: f64) -> Result<(), String> {
    let point = css_point(webview, x, y);
    send_mouse_event(webview, NSEventType::LeftMouseDown, point, 0, 1, 1.0)?;
    send_mouse_event(webview, NSEventType::LeftMouseUp, point, 1, 1, 0.0)?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_mouse_event(webview, NSEventType::LeftMouseDown, point, 2, 2, 1.0)?;
    send_mouse_event(webview, NSEventType::LeftMouseUp, point, 3, 2, 0.0)
}

pub(super) fn native_drag_at(
    webview: &WKWebView,
    from_x: f64,
    from_y: f64,
    to_x: f64,
    to_y: f64,
) -> Result<(), String> {
    let start = css_point(webview, from_x, from_y);
    let end = css_point(webview, to_x, to_y);
    send_mouse_event(webview, NSEventType::LeftMouseDown, start, 0, 1, 1.0)?;

    for step in 1..=10 {
        let t = step as f64 / 10.0;
        let point = NSPoint::new(
            start.x + (end.x - start.x) * t,
            start.y + (end.y - start.y) * t,
        );
        send_mouse_event(
            webview,
            NSEventType::LeftMouseDragged,
            point,
            step as isize,
            1,
            1.0,
        )?;
        std::thread::sleep(std::time::Duration::from_millis(12));
    }

    send_mouse_event(webview, NSEventType::LeftMouseUp, end, 11, 1, 0.0)
}

/// Send a native NSEvent mouse click at CSS coordinates (x, y) within the webview.
/// Produces isTrusted:true events that pass framework security checks.
pub(super) fn native_click_at(webview: &WKWebView, x: f64, y: f64) {
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
            let _: () = unsafe { msg_send![webview, mouseDown: &**event] }; // SAFETY: see comment above.
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
            let _: () = unsafe { msg_send![webview, mouseUp: &**event] }; // SAFETY: see comment above.
        });
    }
}

/// Executes a single automation command against the supplied webview and writes its result file.
/// Commands cover navigation, tab management, DOM interaction, and native input helpers.
pub(crate) fn run_command(
    webview: &WKWebView,
    cmd: &str,
    result_path: String,
    screenshot_path: String,
) {
    if system::handle_command(webview, cmd, &result_path, &screenshot_path) {
        return;
    }
    if tab::handle_command(webview, cmd, &result_path) {
        return;
    }
    if navigation::handle_command(cmd, &result_path) {
        return;
    }
    if input::handle_command(webview, cmd, &result_path) {
        return;
    }
    if query::handle_command(webview, cmd, result_path.clone()) {
        return;
    }

    eval_js(webview, cmd, result_path);
}
