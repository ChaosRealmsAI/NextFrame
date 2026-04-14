//! command module exports
use std::panic::AssertUnwindSafe;

mod input;
mod navigation;
mod query;
mod system;
mod tab;

use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType};
use objc2_foundation::{NSPoint, NSString};
use objc2_web_kit::WKWebView;

use crate::eval::eval_js;
use crate::keyboard::jitter;

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
    let _ = std::fs::write(result_path, format!("error: {err}"));
}

pub(super) fn write_result(result_path: &str, value: impl AsRef<[u8]>) {
    let _ = std::fs::write(result_path, value);
}

pub(super) fn catch_objc(f: impl FnOnce()) -> Result<(), String> {
    // SAFETY: `objc2::exception::catch` is the intended wrapper around Objective-C message sends in this module.
    let result = unsafe { objc2::exception::catch(AssertUnwindSafe(f)) }; // SAFETY: see comment above.
    result.map_err(|e| format!("ObjC exception: {e:?}"))
}

pub(super) fn parse_command_token(input: &str) -> Result<(String, &str), String> {
    let trimmed = input.trim_start();
    if trimmed.is_empty() {
        return Err("missing argument".to_owned());
    }
    if trimmed.starts_with('"') {
        let mut escaped = false;
        for (idx, ch) in trimmed.char_indices().skip(1) {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                let token = &trimmed[..=idx];
                let parsed = serde_json::from_str::<String>(token)
                    .map_err(|err| format!("invalid quoted argument: {err}"))?;
                let rest = trimmed[idx + 1..].trim_start();
                return Ok((parsed, rest));
            }
        }
        return Err("unclosed quote in argument".to_owned());
    }

    if let Some(space) = trimmed.find(char::is_whitespace) {
        Ok((trimmed[..space].to_owned(), trimmed[space..].trim_start()))
    } else {
        Ok((trimmed.to_owned(), ""))
    }
}

pub(super) fn parse_selector_arg(input: &str, usage: &str) -> Result<String, String> {
    let (selector, tail) = parse_command_token(input).map_err(|err| format!("{usage}: {err}"))?;
    if selector.is_empty() || !tail.trim().is_empty() {
        return Err(format!("usage: {usage}"));
    }
    Ok(selector)
}

pub(super) fn parse_selector_pair(input: &str, usage: &str) -> Result<(String, String), String> {
    let (first, rest) = parse_command_token(input).map_err(|err| format!("{usage}: {err}"))?;
    if first.is_empty() {
        return Err(format!("usage: {usage}"));
    }
    let (second, tail) = parse_command_token(rest).map_err(|err| format!("{usage}: {err}"))?;
    if second.is_empty() || !tail.trim().is_empty() {
        return Err(format!("usage: {usage}"));
    }
    Ok((first, second))
}

pub(super) fn parse_selector_and_value(
    input: &str,
    usage: &str,
) -> Result<(String, String), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(format!("usage: {usage}"));
    }
    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let selector = rest[..end].to_owned();
            let value = rest[end + 1..].trim();
            if value.is_empty() {
                return Err(format!("usage: {usage}"));
            }
            return Ok((selector, value.to_owned()));
        }
        return Err("unclosed quote in selector".to_owned());
    }

    let Some(space) = trimmed.find(' ') else {
        return Err(format!("usage: {usage}"));
    };
    let selector = trimmed[..space].trim();
    let value = trimmed[space + 1..].trim();
    if selector.is_empty() || value.is_empty() {
        return Err(format!("usage: {usage}"));
    }
    Ok((selector.to_owned(), value.to_owned()))
}

pub(super) fn parse_selector_and_timeout(
    input: &str,
    default_timeout_ms: u64,
) -> Result<(String, u64), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("usage: wait <selector> [timeout_ms]".to_owned());
    }

    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let selector = rest[..end].to_owned();
            let timeout = rest[end + 1..].trim();
            if timeout.is_empty() {
                return Ok((selector, default_timeout_ms));
            }
            return timeout
                .parse::<u64>()
                .map(|ms| (selector, ms))
                .map_err(|_| format!("invalid timeout_ms: {timeout}"));
        }
        return Err("unclosed quote in selector".to_owned());
    }

    let mut parts = trimmed.rsplitn(2, ' ');
    let last = parts.next().unwrap_or_default().trim();
    let rest = parts.next().unwrap_or_default().trim();
    if !rest.is_empty()
        && let Ok(timeout_ms) = last.parse::<u64>()
    {
        return Ok((rest.to_owned(), timeout_ms));
    }
    Ok((trimmed.to_owned(), default_timeout_ms))
}

pub(super) fn parse_xy_args(input: &str, usage: &str) -> Result<(f64, f64), String> {
    let parts: Vec<&str> = input.split_whitespace().collect();
    if parts.len() != 2 {
        return Err(format!("usage: {usage}"));
    }
    let x = parts[0]
        .parse::<f64>()
        .map_err(|_| "invalid x coordinate".to_owned())?;
    let y = parts[1]
        .parse::<f64>()
        .map_err(|_| "invalid y coordinate".to_owned())?;
    Ok((x, y))
}

pub(super) fn parse_coords(coords: &str) -> Result<(f64, f64), String> {
    let parts: Vec<&str> = coords.split(',').collect();
    if let (Some(xs), Some(ys)) = (parts.first(), parts.get(1))
        && let (Ok(x), Ok(y)) = (xs.parse::<f64>(), ys.parse::<f64>())
    {
        return Ok((x, y));
    }
    Err(format!("bad coords {coords}"))
}

pub(super) fn parse_rect(rect: &str) -> Result<(i64, i64, i64, i64), String> {
    let parts: Vec<&str> = rect.split(',').collect();
    if parts.len() != 4 {
        return Err(format!("bad rect {rect}"));
    }
    let x = parts[0]
        .parse::<i64>()
        .map_err(|_| format!("bad rect {rect}"))?;
    let y = parts[1]
        .parse::<i64>()
        .map_err(|_| format!("bad rect {rect}"))?;
    let w = parts[2]
        .parse::<i64>()
        .map_err(|_| format!("bad rect {rect}"))?;
    let h = parts[3]
        .parse::<i64>()
        .map_err(|_| format!("bad rect {rect}"))?;
    Ok((x, y, w, h))
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
    .ok_or_else(|| format!("failed to create mouse event {event_type:?}"))?;

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
