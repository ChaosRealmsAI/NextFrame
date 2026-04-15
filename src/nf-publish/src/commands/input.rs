//! command input commands
use block2::RcBlock;
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::WKWebView;

use crate::error::error_with_fix;
use crate::eval::eval_js;
use crate::keyboard::{add_tag, paste_text_native, send_key_command, type_text_native};
use crate::state::{log_crash, switch_tab, tab_index_for_webview};

use super::query::find_element_js;
use super::{
    catch_objc, js_string, native_click_at, native_double_click_at, native_drag_at,
    native_hover_at, native_right_click_at, parse_command_token, parse_coords,
    parse_selector_and_value, parse_selector_arg, parse_selector_pair, parse_xy_args, write_error,
    write_result,
};

fn paste_text(webview: &WKWebView, text: &str) -> Result<(), String> {
    paste_text_native(webview, text)
}

fn find_element_pair_js(from_selector: &str, to_selector: &str) -> String {
    let from_lookup = super::query::element_lookup_snippet(from_selector);
    let to_lookup = super::query::element_lookup_snippet(to_selector);
    format!(
        "(function(){{try{{\
        {from_lookup}\
        if(!el)return 'from:not_found';\
        var __from_rect=el.getBoundingClientRect();\
        if(__from_rect.width<=0||__from_rect.height<=0)return 'from:not_found';\
        var __from=String(Math.round(__from_rect.x+__from_rect.width/2))+','+String(Math.round(__from_rect.y+__from_rect.height/2));\
        {to_lookup}\
        if(!el)return 'to:not_found';\
        var __to_rect=el.getBoundingClientRect();\
        if(__to_rect.width<=0||__to_rect.height<=0)return 'to:not_found';\
        var __to=String(Math.round(__to_rect.x+__to_rect.width/2))+','+String(Math.round(__to_rect.y+__to_rect.height/2));\
        return __from+'|'+__to;\
        }}catch(e){{return 'error: '+e.message;}}}})()"
    )
}

fn handle_selector_action(
    webview: &WKWebView,
    selector: String,
    result_path: &str,
    action: impl Fn(&WKWebView, f64, f64) -> Result<String, String> + 'static,
) {
    let result_path = result_path.to_owned();
    let wv_ptr = webview as *const WKWebView as usize;
    let js_str = NSString::from_str(&find_element_js(&selector));
    let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
        let coords = js_string(result);
        if coords == "not_found" || coords.starts_with("error") || coords == "null" {
            write_error(
                &result_path,
                error_with_fix(
                    "locate the target element",
                    format!("element lookup returned `{coords}`"),
                    "Check the selector and make sure the target element is visible before retrying.",
                ),
            );
            return;
        }
        match parse_coords(&coords) {
            Ok((x, y)) => {
                // SAFETY: `wv_ptr` was captured from a live WKWebView and the WebKit callback executes on the main queue while that tab exists.
                let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                match action(wv, x, y) {
                    Ok(message) => write_result(&result_path, message),
                    Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
                }
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
        }
    });
    unsafe {
        // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
        webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
    }
}

pub(super) fn handle_command(webview: &WKWebView, cmd: &str, result_path: &str) -> bool {
    if let Some(text) = cmd.strip_prefix("paste ") {
        if let Err(err) /* Fix: propagate or log the formatted error below */ = paste_text(webview, text) {
            log_crash("WARN", "commands", &format!("paste: {err}"));
            write_error(result_path, err);
        } else {
            write_result(result_path, format!("ok: pasted {} chars", text.len()));
        }
        true
    } else if let Some(tag) = cmd.strip_prefix("addtag ") {
        add_tag(webview, tag.trim(), result_path);
        true
    } else if let Some(text) = cmd.strip_prefix("type ") {
        type_text_native(webview, text, result_path);
        true
    } else if cmd == "movetoend" {
        let msg = if let Some(window) = webview.window() {
            if let Some(responder) = window.firstResponder() {
                match catch_objc(|| {
                    let _: () = unsafe { // SAFETY: `responder` is the current NSResponder from this window and `moveToEndOfLine:` is a standard text-editing selector.
                        msg_send![&*responder, moveToEndOfLine: std::ptr::null::<AnyObject>()]
                    };
                }) {
                    Ok(()) => "ok: movetoend".to_owned(),
                    Err(err) /* Fix: propagate or serialize the formatted error below */ => {
                        log_crash("WARN", "commands", &format!("movetoend: {err}"));
                        "ok: movetoend".to_owned()
                    }
                }
            } else {
                "ok: movetoend (no responder)".to_owned()
            }
        } else {
            "ok: movetoend (no window)".to_owned()
        };
        write_result(result_path, msg);
        true
    } else if let Some(key) = cmd.strip_prefix("key ") {
        if let Some(idx) = tab_index_for_webview(webview) {
            switch_tab(idx);
        }
        let key = key.trim();
        match send_key_command(webview, key) {
            Ok(()) => write_result(result_path, format!("ok: key {key}")),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => {
                log_crash("WARN", "commands", &format!("key {key}: {err}"));
                write_error(result_path, err);
            }
        }
        true
    } else if let Some(coords) = cmd.strip_prefix("hover_xy ") {
        match parse_xy_args(coords.trim(), "hover_xy x y") {
            Ok((x, y)) => match native_hover_at(webview, x, y) {
                Ok(()) => write_result(result_path, format!("ok: hovered {x},{y}")),
                Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
            },
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(coords) = cmd.strip_prefix("dblclick_xy ") {
        match parse_xy_args(coords.trim(), "dblclick_xy x y") {
            Ok((x, y)) => match native_double_click_at(webview, x, y) {
                Ok(()) => write_result(result_path, format!("ok: double-clicked {x},{y}")),
                Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
            },
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(coords) = cmd.strip_prefix("click ") {
        let parts: Vec<&str> = coords.split_whitespace().collect();
        if parts.len() >= 2 {
            if let (Ok(x), Ok(y)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                native_click_at(webview, x, y);
                write_result(result_path, format!("ok: clicked {x},{y}"));
            } else {
                write_error(
                    result_path,
                    error_with_fix(
                        "parse the click coordinates",
                        format!("`{coords}` does not contain valid numeric coordinates"),
                        "Use `click x y` with numeric values such as `click 120 240`.",
                    ),
                );
            }
        } else {
            write_error(
                result_path,
                error_with_fix(
                    "parse the click command",
                    "missing x and y coordinates",
                    "Use `click x y` with numeric values such as `click 120 240`.",
                ),
            );
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("hover ") {
        match parse_selector_arg(selector, "hover <selector>") {
            Ok(selector) => handle_selector_action(webview, selector, result_path, |wv, x, y| {
                native_hover_at(wv, x, y)?;
                Ok(format!("ok: hovered element at {x},{y}"))
            }),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("dblclick ") {
        match parse_selector_arg(selector, "dblclick <selector>") {
            Ok(selector) => handle_selector_action(webview, selector, result_path, |wv, x, y| {
                native_double_click_at(wv, x, y)?;
                Ok(format!("ok: double-clicked element at {x},{y}"))
            }),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("rightclick ") {
        match parse_selector_arg(selector, "rightclick <selector>") {
            Ok(selector) => handle_selector_action(webview, selector, result_path, |wv, x, y| {
                native_right_click_at(wv, x, y)?;
                Ok(format!("ok: right-clicked element at {x},{y}"))
            }),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(rest) = cmd.strip_prefix("drag ") {
        match parse_selector_pair(rest, "drag <from_selector> <to_selector>") {
            Ok((from_selector, to_selector)) => {
                let result_path = result_path.to_owned();
                let wv_ptr = webview as *const WKWebView as usize;
                let js_str =
                    NSString::from_str(&find_element_pair_js(&from_selector, &to_selector));
                let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
                    let coords = js_string(result);
                    if coords == "null"
                        || coords.starts_with("error")
                        || coords == "from:not_found"
                        || coords == "to:not_found"
                    {
                        write_error(
                            &result_path,
                            error_with_fix(
                                "locate the drag target elements",
                                format!("element lookup returned `{coords}`"),
                                "Check both selectors and make sure both target elements are visible before retrying.",
                            ),
                        );
                        return;
                    }
                    let parts: Vec<&str> = coords.split('|').collect();
                    if let (Some(from_coords), Some(to_coords)) = (parts.first(), parts.get(1)) {
                        match (parse_coords(from_coords), parse_coords(to_coords)) {
                            (Ok((from_x, from_y)), Ok((to_x, to_y))) => {
                                // SAFETY: `wv_ptr` was captured from a live WKWebView and the WebKit callback executes on the main queue while that tab exists.
                                let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                                match native_drag_at(wv, from_x, from_y, to_x, to_y) {
                                    Ok(()) => write_result(
                                        &result_path,
                                        format!(
                                            "ok: dragged from {from_x},{from_y} to {to_x},{to_y}"
                                        ),
                                    ),
                                    Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
                                }
                            }
                            _ => write_error(
                                &result_path,
                                error_with_fix(
                                    "parse the drag coordinates",
                                    format!(
                                        "element lookup returned invalid coordinates `{coords}`"
                                    ),
                                    "Retry after ensuring the page returns numeric `x,y` coordinates.",
                                ),
                            ),
                        }
                        return;
                    }
                    write_error(
                        &result_path,
                        error_with_fix(
                            "parse the drag coordinates",
                            format!("element lookup returned invalid coordinates `{coords}`"),
                            "Retry after ensuring the page returns numeric `x,y` coordinates.",
                        ),
                    );
                });
                unsafe { // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
                    webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
                }
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("clickel ") {
        let selector = selector.trim().to_owned();
        handle_selector_action(webview, selector, result_path, |wv, x, y| {
            native_click_at(wv, x, y);
            Ok(format!("ok: clicked element at {x},{y}"))
        });
        true
    } else if let Some(rest) = cmd.strip_prefix("inputel ") {
        let rest = rest.trim();
        let (selector, text_for_paste) = match parse_selector_and_value(rest, "inputel <selector> <text>") {
                Ok(values) => values,
                Err(err) /* Fix: propagate or serialize the formatted error below */ => {
                    write_error(result_path, err);
                    return true;
                }
            };
        let result_path = result_path.to_owned();
        let wv_ptr = webview as *const WKWebView as usize;
        let js_str = NSString::from_str(&find_element_js(&selector));
        let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
            let coords = js_string(result);
            if coords == "not_found" || coords.starts_with("error") || coords == "null" {
                write_error(
                    &result_path,
                    error_with_fix(
                        "locate the target element",
                        format!("element lookup returned `{coords}`"),
                        "Check the selector and make sure the target element is visible before retrying.",
                    ),
                );
                return;
            }
            if let Ok((x, y)) = parse_coords(&coords) {
                // SAFETY: `wv_ptr` was captured from a live WKWebView and the WebKit callback executes on the main queue while that tab exists.
                let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                native_click_at(wv, x, y);
                std::thread::sleep(std::time::Duration::from_millis(200));
                match paste_text(wv, &text_for_paste) {
                    Ok(()) => write_result(
                        &result_path,
                        format!(
                            "ok: inputel at {x},{y} pasted {} chars",
                            text_for_paste.len()
                        ),
                    ),
                    Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
                }
                return;
            }
            write_error(
                &result_path,
                error_with_fix(
                    "parse the input coordinates",
                    format!("element lookup returned invalid coordinates `{coords}`"),
                    "Retry after ensuring the page returns numeric `x,y` coordinates.",
                ),
            );
        });
        unsafe {
            // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
            webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
        }
        true
    } else if let Some(words) = cmd.strip_prefix("dismiss ") {
        let words_json = serde_json::to_string(words.trim()).unwrap_or_else(|_| "\"\"".to_owned());
        let js = format!(
            "try{{var words={words_json}.split(',').map(function(w){{return w.trim()}});var coords=[];document.querySelectorAll('button,span,div').forEach(function(e){{var t=e.textContent.trim();if(words.indexOf(t)>=0&&e.offsetWidth>0&&e.offsetHeight<80&&e.childElementCount<=3){{var r=e.getBoundingClientRect();coords.push(Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2))}}}});coords.join('|')}}catch(e){{'error:'+e.message}}"
        );
        let result_path = result_path.to_owned();
        let wv_ptr = webview as *const WKWebView as usize;
        let js_str = NSString::from_str(&js);
        let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
            let coords_str = if result.is_null() {
                String::new()
            } else {
                js_string(result)
            };
            if coords_str.is_empty() || coords_str.starts_with("error") {
                write_result(&result_path, "ok: dismissed 0");
                return;
            }
            // SAFETY: `wv_ptr` was captured from a live WKWebView and the WebKit callback executes on the main queue while that tab exists.
            let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
            let mut count = 0;
            for coord in coords_str.split('|') {
                if let Ok((x, y)) = parse_coords(coord) {
                    native_click_at(wv, x, y);
                    count += 1;
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
            write_result(&result_path, format!("ok: dismissed {count}"));
        });
        unsafe {
            // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
            webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("focusel ") {
        let selector = selector.trim().to_owned();
        handle_selector_action(webview, selector, result_path, |wv, x, y| {
            native_click_at(wv, x, y);
            Ok(format!("ok: focused at {x},{y}"))
        });
        true
    } else if let Some(selector) = cmd.strip_prefix("scrollel ") {
        let selector = parse_command_token(selector)
            .map(|(selector, _)| selector)
            .unwrap_or_else(|_| selector.trim().to_owned());
        let sel_escaped = serde_json::to_string(&selector).unwrap_or_else(|_| "\"\"".to_owned());
        let js = format!(
            "try{{var el=document.querySelector({sel_escaped});if(!el){{var w=document.querySelector('wujie-app');if(w&&w.shadowRoot)el=w.shadowRoot.querySelector({sel_escaped});}}if(el){{el.scrollIntoView({{block:'center',behavior:'smooth'}});'ok: scrolled'}}else{{'not_found'}}}}catch(e){{'error: '+e.message}}"
        );
        eval_js(webview, &js, result_path.to_owned());
        true
    } else {
        false
    }
}
