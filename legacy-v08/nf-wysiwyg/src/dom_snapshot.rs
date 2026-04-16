use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct DomSnapshot {
    #[serde(default)]
    pub html: String,
    #[serde(default)]
    pub css: String,
    #[serde(default)]
    pub fonts: Vec<String>,
}

#[cfg(target_os = "macos")]
pub fn capture(web_view: &objc2_web_kit::WKWebView) -> Result<DomSnapshot> {
    let html =
        eval_js(web_view, "document.documentElement.outerHTML").map_err(|error| anyhow!(error))?;
    Ok(DomSnapshot {
        html,
        css: String::new(),
        fonts: Vec::new(),
    })
}

#[cfg(target_os = "macos")]
fn eval_js(
    web_view: &objc2_web_kit::WKWebView,
    script: &str,
) -> std::result::Result<String, String> {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::time::{Duration, Instant};

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSError, NSString};

    let slot: Rc<RefCell<Option<std::result::Result<String, String>>>> =
        Rc::new(RefCell::new(None));
    let slot_clone = Rc::clone(&slot);

    let ns_script = NSString::from_str(script);
    let block = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        let value = if !error.is_null() {
            let description = unsafe { &*error }.localizedDescription().to_string(); // SAFETY: error is non-null in this branch and originates from WebKit.
            Err(format!(
                "JS error: {description}. Fix: inspect the evaluated script and page state."
            ))
        } else if !result.is_null() {
            let description: Retained<NSString> = unsafe { objc2::msg_send![result, description] }; // SAFETY: result is non-null in this branch and Objective-C description returns NSString.
            Ok(description.to_string())
        } else {
            Ok("null".to_string())
        };
        *slot_clone.borrow_mut() = Some(value);
    });

    unsafe {
        // SAFETY: web_view is live on the main thread and WebKit accepts this completion handler.
        web_view.evaluateJavaScript_completionHandler(&ns_script, Some(&block));
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err(
                "JS eval timed out. Fix: ensure the page is responsive before capturing DOM."
                    .to_string(),
            );
        }
        pump_run_loop(Duration::from_millis(10));
    }

    let result = slot.borrow_mut().take().ok_or(
        "Internal: JS eval completed without storing a result. Fix: inspect the completion handler path."
            .to_string(),
    )?;
    result
}

#[cfg(target_os = "macos")]
fn pump_run_loop(duration: std::time::Duration) {
    use std::time::Instant;

    unsafe {
        // SAFETY: this only pumps the current CoreFoundation run loop in default mode.
        let deadline = Instant::now() + duration;
        while Instant::now() < deadline {
            unsafe extern "C" {
                fn CFRunLoopRunInMode(
                    mode: *const std::ffi::c_void,
                    seconds: f64,
                    return_after_source_handled: u8,
                ) -> i32;
                #[link_name = "kCFRunLoopDefaultMode"]
                static CF_RUN_LOOP_DEFAULT_MODE: *const std::ffi::c_void;
            }

            let _ = CFRunLoopRunInMode(CF_RUN_LOOP_DEFAULT_MODE, 0.01, 1);
        }
    }
}
