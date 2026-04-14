//! command system helpers
use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::WKWebView;

use crate::error::error_with_fix;
use crate::eval::{take_screenshot, take_screenshot_with_callback};
use crate::state::TABS;

use super::query::element_query_js;
use super::{js_string, parse_rect, parse_selector_arg, write_error, write_result};

fn current_url_for_webview(webview: &WKWebView) -> String {
    // SAFETY: `webview` is a live WKWebView and `URL` is a valid getter that returns an autoreleased NSURL if present.
    unsafe { webview.URL() } // SAFETY: see comment above.
        .and_then(|url| url.absoluteString())
        .map(|value| value.to_string())
        .unwrap_or_default()
}

fn url_host(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or("")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn matching_platform_index(url: &str) -> Option<usize> {
    let host = url_host(url);
    if host.is_empty() {
        return None;
    }
    TABS.iter().position(|tab| {
        let expected = url_host(tab.url);
        host == expected || host.ends_with(&format!(".{expected}"))
    })
}

fn wrapped_check_js(js: &str) -> String {
    let js_escaped = serde_json::to_string(js).unwrap_or_else(|_| "\"\"".to_owned());
    format!(
        "try{{var __r=eval({js_escaped});if(__r&&typeof __r.then==='function'){{window.__wpCheckStatus='pending';__r.then(function(v){{window.__wpCheckStatus=v==null?'null':String(v);}}).catch(function(){{window.__wpCheckStatus='error';}});'__wp_pending'}}else{{__r==null?'null':String(__r)}}}}catch(__e){{'error: '+__e.message}}"
    )
}

fn normalize_check_status(status: &str) -> String {
    let trimmed = status.trim();
    if trimmed.eq_ignore_ascii_case("alive") {
        "alive".to_owned()
    } else if trimmed.eq_ignore_ascii_case("expired") {
        "expired".to_owned()
    } else if trimmed == "__wp_pending" || trimmed.eq_ignore_ascii_case("pending") {
        "pending".to_owned()
    } else if trimmed.is_empty() || trimmed == "null" || trimmed.starts_with("error") {
        "expired".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn write_json_result(result_path: &str, value: serde_json::Value) {
    match serde_json::to_string(&value) {
        Ok(json) => write_result(result_path, json),
        Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
    }
}

fn write_check_result(result_path: &str, platform: &str, status: &str, url: Option<&str>) {
    let value = match url {
        Some(url) => serde_json::json!({
            "platform": platform,
            "status": status,
            "url": url,
        }),
        None => serde_json::json!({
            "platform": platform,
            "status": status,
        }),
    };
    write_json_result(result_path, value);
}

fn run_check_command(webview: &WKWebView, result_path: String) {
    let url = current_url_for_webview(webview);
    let Some(tab_index) = matching_platform_index(&url) else {
        write_check_result(&result_path, "unknown", "n/a", None);
        return;
    };

    let platform = TABS[tab_index].label.to_owned();
    let js = NSString::from_str(&wrapped_check_js(TABS[tab_index].check_session_js));
    let rp = result_path.clone();
    let url_for_result = url.clone();
    let platform_for_result = platform.clone();
    let wv_ptr = webview as *const WKWebView as usize;
    let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        if !error.is_null() {
            write_check_result(&rp, &platform_for_result, "expired", Some(&url_for_result));
            return;
        }

        let raw = if result.is_null() {
            "expired".to_owned()
        } else {
            js_string(result)
        };
        if raw == "__wp_pending" {
            let rp2 = rp.clone();
            let url2 = url_for_result.clone();
            let platform2 = platform_for_result.clone();
            dispatch::Queue::main().exec_after(std::time::Duration::from_secs(3), move || {
                let read_js = NSString::from_str("String(window.__wpCheckStatus||'pending')");
                // SAFETY: `wv_ptr` was captured from a live WKWebView and this follow-up runs on the main queue while that tab exists.
                let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                let handler2 = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                    let status = if !error.is_null() || result.is_null() {
                        "expired".to_owned()
                    } else {
                        normalize_check_status(&js_string(result))
                    };
                    write_check_result(&rp2, &platform2, &status, Some(&url2));
                });
                unsafe { // SAFETY: `wv` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
                    wv.evaluateJavaScript_completionHandler(&read_js, Some(&handler2));
                }
            });
            return;
        }

        let status = normalize_check_status(&raw);
        write_check_result(&rp, &platform_for_result, &status, Some(&url_for_result));
    });
    unsafe { // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
        webview.evaluateJavaScript_completionHandler(&js, Some(&handler));
    }
}

pub(super) fn handle_command(
    webview: &WKWebView,
    cmd: &str,
    result_path: &str,
    screenshot_path: &str,
) -> bool {
    if cmd == "screenshot" {
        take_screenshot(webview, result_path.to_owned(), screenshot_path.to_owned());
        true
    } else if cmd == "check" {
        run_check_command(webview, result_path.to_owned());
        true
    } else if cmd == "focus" {
        if let Some(window) = webview.window() {
            window.makeKeyAndOrderFront(None);
        }
        write_result(result_path, "ok: focused");
        true
    } else if let Some(selector) = cmd.strip_prefix("screenshot_el ") {
        match parse_selector_arg(selector, "screenshot_el <selector>") {
            Ok(selector) => {
                let result_path = result_path.to_owned();
                let screenshot_path = screenshot_path.to_owned();
                let wv_ptr = webview as *const WKWebView as usize;
                let js = element_query_js(
                    &selector,
                    "var r=el.getBoundingClientRect();\
                    if(r.width<=0||r.height<=0)return '__NOT_FOUND__';\
                    return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join(',');",
                    "'__NOT_FOUND__'",
                );
                let js_str = NSString::from_str(&js);
                let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                    if !error.is_null() {
                        // SAFETY: WebKit passes a valid NSError pointer when `error` is non-null.
                        let err = unsafe { &*error }; // SAFETY: see comment above.
                        write_error(
                            &result_path,
                            error_with_fix(
                                "evaluate the screenshot JavaScript",
                                err.localizedDescription(),
                                "Check the page state and retry after the target element is rendered.",
                            ),
                        );
                        return;
                    }
                    let rect = js_string(result);
                    if rect == "__NOT_FOUND__" || rect == "null" || rect.starts_with("error") {
                        write_error(
                            &result_path,
                            error_with_fix(
                                "locate the screenshot target element",
                                format!("element lookup returned `{rect}`"),
                                "Check the selector and make sure the target element is visible before retrying.",
                            ),
                        );
                        return;
                    }
                    match parse_rect(&rect) {
                        Ok((x, y, w, h)) => {
                            let rp = result_path.clone();
                            let message = format!("ok: {x},{y},{w},{h}");
                            // SAFETY: `wv_ptr` was captured from a live WKWebView and the WebKit callback executes on the main queue while that tab exists.
                            let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                            take_screenshot_with_callback(
                                wv,
                                screenshot_path.clone(),
                                move |result| match result {
                                    Ok(_) => write_result(&rp, &message),
                                    Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&rp, err),
                                },
                            );
                        }
                        Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
                    }
                });
                unsafe { // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
                    webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
                }
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else {
        false
    }
}
