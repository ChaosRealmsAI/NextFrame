//! command polling
use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::WKWebView;

use crate::commands::run_command;
use crate::state::{
    APP_STATE, LEGACY_CMD, LEGACY_RESULT, LEGACY_SCREENSHOT, POLL_MS, TABS, all_tab_ids,
    check_session, cmd_file, current_webview, result_file, screenshot_file, webview_for_tab,
};

/// Try to read and process a command file. Returns the command string if found.
fn try_read_cmd(path: &str) -> Option<String> {
    let cmd = std::fs::read_to_string(path).ok()?;
    let _ = std::fs::remove_file(path);
    let trimmed = cmd.trim().to_owned();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed)
}

/// One poll cycle: check all per-tab channels + legacy channel
fn poll_all() {
    if APP_STATE.get().is_some() {
        for tab in all_tab_ids() {
            if let Some(cmd) = try_read_cmd(&cmd_file(tab)) {
                eprintln!("[wp] tab {tab}: {}", &cmd[..cmd.len().min(60)]);
                if let Some(webview) = webview_for_tab(tab) {
                    run_command(webview, &cmd, result_file(tab), screenshot_file(tab));
                } else {
                    let _ = std::fs::write(result_file(tab), "error: no webview");
                }
            }
        }
    }
    if let Some(cmd) = try_read_cmd(LEGACY_CMD) {
        eprintln!("[wp] legacy: {}", &cmd[..cmd.len().min(60)]);
        if let Some(webview) = current_webview() {
            run_command(
                webview,
                &cmd,
                LEGACY_RESULT.to_owned(),
                LEGACY_SCREENSHOT.to_owned(),
            );
        } else {
            let _ = std::fs::write(LEGACY_RESULT, "error: no webview");
        }
    }
}

fn wrapped_session_check_js(js: &str) -> String {
    let js_escaped = serde_json::to_string(js).unwrap_or_else(|_| "\"\"".to_owned());
    // check_session_js may return a Promise (from fetch) or a plain string.
    // WKWebView doesn't auto-resolve Promises in evaluateJavaScript.
    // Strategy: eval, if result is a Promise, use .then() to store in global var.
    // The polling handler checks for "__session_pending" and schedules a follow-up read.
    format!(
        "try{{var __r=eval({js_escaped});if(__r&&typeof __r.then==='function'){{window.__sessionCheck='pending';__r.then(function(v){{window.__sessionCheck=String(v||'')==='alive'?'alive':'expired';}}).catch(function(){{window.__sessionCheck='expired';}});'__session_pending'}}else{{__r=String(__r||'');__r==='alive'?'alive':'expired'}}}}catch(__e){{'expired'}}"
    )
}

fn evaluate_session_for_tab(tab: usize, webview: &WKWebView) {
    let js = NSString::from_str(&wrapped_session_check_js(TABS[tab].check_session_js));
    let wv_ptr = webview as *const WKWebView as usize;
    let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        if !error.is_null() {
            crate::state::log_crash("WARN", "session_check", &format!("tab {tab} JS error"));
            check_session(tab, "expired");
            return;
        }
        let status = if result.is_null() {
            "expired".to_owned()
        } else {
            // SAFETY: this JS wrapper normalizes non-null results to NSString.
            let s: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
            s.to_string()
        };
        match status.as_str() {
            "alive" => check_session(tab, "alive"),
            "expired" => check_session(tab, "expired"),
            "__session_pending" => {
                // fetch() is async — schedule a follow-up read after 3 seconds
                dispatch::Queue::main().exec_after(std::time::Duration::from_secs(3), move || {
                    let read_js = NSString::from_str("window.__sessionCheck||'expired'");
                    // SAFETY: `wv_ptr` was captured from a live WKWebView and this follow-up runs on the main queue while that tab exists.
                    let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                    let handler2 = RcBlock::new(move |result: *mut AnyObject, _: *mut NSError| {
                        let s = if !result.is_null() {
                            // SAFETY: this JS wrapper normalizes non-null results to NSString.
                            let ns: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
                            ns.to_string()
                        } else {
                            "expired".to_owned()
                        };
                        match s.as_str() {
                            "alive" => check_session(tab, "alive"),
                            "pending" => { /* still pending, will catch next cycle */ }
                            _ => check_session(tab, "expired"),
                        }
                    });
                    // SAFETY: `wv` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
                    unsafe { // SAFETY: see comment above.
                        // SAFETY: see comment above.
                        wv.evaluateJavaScript_completionHandler(&read_js, Some(&handler2));
                    }
                });
            }
            other => {
                crate::state::log_crash(
                    "WARN",
                    "session_check",
                    &format!("tab {tab} unexpected: {other}"),
                );
                check_session(tab, "expired");
            }
        }
    });
    // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.evaluateJavaScript_completionHandler(&js, Some(&handler));
    }
}

fn check_all_sessions() {
    for tab in 0..TABS.len() {
        if let Some(webview) = webview_for_tab(tab) {
            evaluate_session_for_tab(tab, webview);
        }
    }
}

/// Keep-alive: periodically make credentialed requests to extend cookie TTL.
/// Only runs for tabs that are alive and have keep_alive_js defined.
fn keep_alive_all() {
    let Some(state) = APP_STATE.get() else { return };
    for tab in 0..TABS.len() {
        let Some(tab_def) = TABS.get(tab) else {
            continue;
        };
        if tab_def.keep_alive_js.is_empty() {
            continue;
        }

        // Only keep alive tabs that are currently alive
        let is_alive = {
            let Ok(statuses) = state.session_status.lock() else {
                continue;
            };
            statuses.get(tab).copied().flatten() == Some(true)
        };
        if !is_alive {
            continue;
        }

        let Some(wv) = webview_for_tab(tab) else {
            continue;
        };
        let js_src = tab_def.keep_alive_js;
        let label = tab_def.label;

        // Evaluate keep-alive JS (async, result logged but not acted on)
        let js_escaped = serde_json::to_string(js_src).unwrap_or_else(|_| "\"\"".to_owned());
        let wrapped = format!(
            "try{{var __r=eval({js_escaped});if(__r&&typeof __r.then==='function'){{__r.then(function(v){{document.title='__ka:'+v}}).catch(function(){{document.title='__ka:fail'}})}}else{{document.title='__ka:'+__r}};'async'}}catch(__e){{'error:'+__e.message}}"
        );
        let js_str = NSString::from_str(&wrapped);
        let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
            let status = if !result.is_null() {
                // SAFETY: this JS wrapper normalizes non-null results to NSString.
                let s: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
                s.to_string()
            } else {
                "null".to_owned()
            };
            // Log keep-alive results that indicate problems
            if status.contains("NEED_REFRESH") {
                crate::state::log_crash(
                    "WARN",
                    "keep_alive",
                    &format!("{label}: B站 cookie needs refresh! Re-login recommended."),
                );
                crate::state::log_activity("session_warn", label, "NEED_REFRESH");
            } else if status.contains("expired") || status.contains("fail") {
                crate::state::log_crash(
                    "WARN",
                    "keep_alive",
                    &format!("{label}: keep-alive failed: {status}"),
                );
            }
        });
        // SAFETY: `wv` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
        unsafe { // SAFETY: see comment above.
            // SAFETY: see comment above.
            wv.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
        }
    }
}

/// Starts the background polling loop for command files, session checks, and keep-alive tasks.
/// Poll work is marshaled back onto the main queue before touching AppKit or WebKit state.
pub(crate) fn start_command_poll() {
    let _ = std::fs::remove_file(LEGACY_CMD);
    let _ = std::fs::remove_file(LEGACY_RESULT);
    for i in all_tab_ids() {
        let _ = std::fs::remove_file(cmd_file(i));
        let _ = std::fs::remove_file(result_file(i));
    }

    std::thread::spawn(|| {
        let mut tick: u64 = 0;
        let save_interval = 10_000 / POLL_MS; // 10s
        let session_interval = 60_000 / POLL_MS; // 60s
        let keep_alive_interval = 300_000 / POLL_MS; // 5 min
        loop {
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            tick += 1;
            dispatch::Queue::main().exec_async(move || {
                // SAFETY: `catch` is the intended Objective-C boundary around poll callbacks running on the main queue.
                let objc_result = unsafe { // SAFETY: see comment above.
                    // SAFETY: see comment above.
                    objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
                        let result =
                            std::panic::catch_unwind(std::panic::AssertUnwindSafe(poll_all));
                        if let Err(e) = result {
                            crate::state::log_crash("PANIC", "poll_all", &format!("{e:?}"));
                        }
                    }))
                };
                if let Err(e) = objc_result {
                    crate::state::log_crash("OBJC", "poll_all", &format!("{e:?}"));
                }
                if tick.is_multiple_of(save_interval) {
                    crate::state::save_tab_urls();
                    if let Some(wv) = webview_for_tab(0)
                        && let Some(win) = wv.window()
                    {
                        let f = win.frame();
                        crate::state::save_window_frame(
                            f.origin.x,
                            f.origin.y,
                            f.size.width,
                            f.size.height,
                        );
                    }
                }
                if tick.is_multiple_of(session_interval) {
                    check_all_sessions();
                }
                if tick.is_multiple_of(keep_alive_interval) {
                    keep_alive_all();
                }
            });
        }
    });
}
