//! webview evaluation helpers
use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{NSDictionary, NSError, NSString};
use objc2_web_kit::WKWebView;
use std::cell::RefCell;
use std::rc::Rc;

use crate::error::{ensure_fix, error_with_fix};

fn encode_and_write_screenshot(image: &NSImage, screenshot_path: &str) -> Result<usize, String> {
    let tiff = image.TIFFRepresentation().ok_or_else(|| {
        error_with_fix(
            "capture the screenshot",
            "AppKit did not produce TIFF data for the snapshot",
            "Retry after the page finishes rendering.",
        )
    })?;
    let bitmap = NSBitmapImageRep::imageRepWithData(&tiff).ok_or_else(|| {
        error_with_fix(
            "decode the screenshot image",
            "AppKit could not decode the snapshot TIFF data",
            "Retry after the page finishes rendering.",
        )
    })?;
    // SAFETY: `NSDictionary::new()` returns an empty immutable dictionary object that can be viewed as the typed properties dictionary WebKit expects here.
    let dict: &NSDictionary<NSString> =
        unsafe { &*(NSDictionary::new().as_ref() as *const _ as *const _) }; // SAFETY: see comment above.
    // SAFETY: `bitmap` is a valid NSBitmapImageRep and `representationUsingType:properties:` accepts the empty properties dictionary for PNG encoding.
    let png =
        unsafe { bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, dict) } // SAFETY: see comment above.
            .ok_or_else(|| {
                error_with_fix(
                    "encode the screenshot as PNG",
                    "AppKit returned no PNG data",
                    "Retry after the page finishes rendering.",
                )
            })?;
    // SAFETY: `png` is NSData returned by AppKit and remains alive for this scope, so exposing its bytes is valid.
    let bytes = unsafe { png.as_bytes_unchecked() }; // SAFETY: see comment above.
    std::fs::write(screenshot_path, bytes).map_err(|err| {
        error_with_fix(
            "write the screenshot PNG",
            err,
            "Check that the screenshot path is writable and retry.",
        )
    })?;
    Ok(bytes.len())
}

pub(crate) fn take_screenshot_with_callback<F>(
    webview: &WKWebView,
    screenshot_path: String,
    callback: F,
) where
    F: FnOnce(Result<usize, String>) + 'static,
{
    let ss_path = screenshot_path;
    let callback = Rc::new(RefCell::new(Some(callback)));
    let handler = RcBlock::new(move |image: *mut NSImage, _error: *mut NSError| {
        let result = if image.is_null() {
            Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "capture the screenshot",
                    "WebKit returned no image",
                    "Retry after the page finishes rendering.",
                ),
            )
        } else {
            // SAFETY: WebKit passes a valid NSImage pointer when `image` is non-null for this completion handler invocation.
            let image = unsafe { &*image }; // SAFETY: see comment above.
            encode_and_write_screenshot(image, &ss_path)
        };
        if let Some(callback) = callback.borrow_mut().take() {
            callback(result);
        }
    });
    unsafe {
        // SAFETY: `webview` is a live WKWebView and the completion block outlives the async snapshot operation.
        webview.takeSnapshotWithConfiguration_completionHandler(None, &handler);
    }
}

/// Captures a native snapshot of the webview and writes it to the requested PNG path.
/// A short status message is written to `result_path` on success or failure.
pub(crate) fn take_screenshot(webview: &WKWebView, result_path: String, screenshot_path: String) {
    let ss_path = screenshot_path.clone();
    let res_path = result_path;
    take_screenshot_with_callback(webview, screenshot_path, move |result| match result {
        Ok(len) => {
            let _ = std::fs::write(&res_path, format!("ok: {} ({len} bytes)", ss_path));
        }
        Err(err) /* Fix: propagate or serialize the formatted error below */ => {
            let message = ensure_fix(
                err,
                "capture the screenshot",
                "Retry after the page finishes rendering and ensure the output path is writable.",
            );
            let _ = std::fs::write(&res_path, format!("error: {message}"));
        }
    });
}

/// Evaluates JavaScript in the webview and writes the stringified result to disk.
/// Results are wrapped to normalize `null`, errors, and non-string return values.
pub(crate) fn eval_js(webview: &WKWebView, js: &str, result_path: String) {
    // Wrap JS so the result is always a string (avoids NSNumber/NSNull crash).
    // serde_json::to_string properly escapes the JS code as a JSON string literal.
    let js_escaped = serde_json::to_string(js).unwrap_or_else(|_| "\"\"".to_owned());
    let wrapped = format!(
        "try{{var __r=eval({js_escaped});__r==null?'null':String(__r)}}catch(__e){{'error: '+__e.message}}"
    );
    let js_str = NSString::from_str(&wrapped);
    let res_path = result_path;
    let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        if !error.is_null() {
            // SAFETY: WebKit passes a valid NSError pointer when `error` is non-null.
            let err = unsafe { &*error }; // SAFETY: see comment above.
            let message = error_with_fix(
                "evaluate JavaScript in the webview",
                err.localizedDescription(),
                "Check the script for syntax errors and make sure the page is still loaded.",
            );
            let _ = std::fs::write(&res_path, format!("error: {message}"));
        } else if !result.is_null() {
            // SAFETY: this wrapper stringifies JS results, so non-null `result` is an NSString.
            let s: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
            let _ = std::fs::write(&res_path, format!("ok: {s}"));
        } else {
            let _ = std::fs::write(&res_path, "ok: null");
        }
    });
    unsafe {
        // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and block.
        webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
    }
}
