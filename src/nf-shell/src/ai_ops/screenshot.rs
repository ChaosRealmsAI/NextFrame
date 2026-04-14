//! ai control native screenshot helpers
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::ipc::write_http_response;

use super::error_with_fix;

#[cfg(target_os = "macos")]
use wry::WebViewExtMacOS;

#[cfg(target_os = "macos")]
pub(crate) fn native_screenshot(
    webview: &wry::WebView,
    out_path: &str,
    stream: &mut TcpStream,
) -> Result<(), String> {
    use std::cell::RefCell;
    use std::rc::Rc;

    use block2::RcBlock;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::WKSnapshotConfiguration;

    let mtm = MainThreadMarker::new().ok_or_else(|| {
        error_with_fix(
            "capture a native screenshot",
            "the request did not run on the main thread",
            "Retry from the main app thread after the window has finished initializing.",
        )
    })?;

    let wk_webview = webview.webview();
    // SAFETY: `mtm` proves this runs on Cocoa's main thread, which `WKSnapshotConfiguration::new` requires.
    let config = unsafe { WKSnapshotConfiguration::new(mtm) }; // SAFETY: see above.

    type Slot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
    let slot: Slot = Rc::new(RefCell::new(None));
    let slot_clone = slot.clone();

    let block =
        RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            autoreleasepool(|_| {
                // SAFETY: WebKit passes either null or a valid `NSError *` for the duration of this callback.
                let result =
                    if let Some(error) = unsafe { error.as_ref() } { // SAFETY: see above.
                        // SAFETY: see above.
                        Err(/* Fix: user-facing error formatted below */ error_with_fix(
                    "capture a native screenshot",
                    format!("WKWebView.takeSnapshot returned {}", error.localizedDescription()),
                    "Wait for the page to finish rendering, then retry the screenshot request.",
                ))
                    // SAFETY: WebKit keeps `image` alive for this callback, and `retain` takes our own ownership.
                    } else if let Some(image) = unsafe { Retained::retain(image) } { // SAFETY: see above.
                        // SAFETY: see above.
                        Ok(image)
                    } else {
                        Err(/* Fix: user-facing error formatted below */ error_with_fix(
                    "capture a native screenshot",
                    "WKWebView.takeSnapshot returned no image",
                    "Wait for the page to finish rendering, then retry the screenshot request.",
                ))
                    };
                *slot_clone.borrow_mut() = Some(result);
            });
        });

    // SAFETY: `wk_webview`, `config`, and `block` are live Objective-C objects on the main thread.
    unsafe { // SAFETY: see above.
        // SAFETY: see above.
        wk_webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(10) {
            let timeout_error = error_with_fix(
                "capture a native screenshot",
                "WKWebView.takeSnapshot timed out after 10 seconds",
                "Reduce page load work or wait for rendering to settle before retrying.",
            );
            return write_http_response(
                stream,
                500,
                "Internal Server Error",
                "text/plain; charset=utf-8",
                timeout_error.as_bytes(),
            )
            .map_err(|e| {
                error_with_fix(
                    "write the screenshot timeout response",
                    e,
                    "Check the local HTTP connection and retry the screenshot request.",
                )
            });
        }
        std::thread::sleep(Duration::from_millis(10));
        // Pump the run loop so the completion handler fires
        #[allow(clippy::undocumented_unsafe_blocks)]
        // SAFETY: `currentRunLoop` and `runUntilDate:` use live Objective-C objects for this thread only.
        unsafe { // SAFETY: see above.
            // SAFETY: see above.
            use objc2_foundation::NSDate;
            let run_loop: *mut objc2::runtime::AnyObject =
                objc2::msg_send![objc2::class!(NSRunLoop), currentRunLoop];
            let until = NSDate::dateWithTimeIntervalSinceNow(0.01);
            let _: () = objc2::msg_send![run_loop, runUntilDate: &*until];
        }
    }

    let image = slot
        .borrow_mut()
        .take()
        .ok_or_else(|| {
            error_with_fix(
                "capture a native screenshot",
                "the snapshot callback completed without a result",
                "Retry the screenshot request after the page finishes rendering.",
            )
        })?
        .map_err(|e| {
            error_with_fix(
                "capture a native screenshot",
                e,
                "Retry the screenshot request after the page finishes rendering.",
            )
        })?;

    // Convert NSImage → PNG data
    let tiff_data = image.TIFFRepresentation().ok_or_else(|| {
        error_with_fix(
            "encode the screenshot image",
            "NSImage did not provide TIFF data",
            "Retry the screenshot request after the page finishes rendering.",
        )
    })?;
    let bitmap_rep = NSBitmapImageRep::imageRepWithData(&tiff_data).ok_or_else(|| {
        error_with_fix(
            "decode the screenshot image",
            "AppKit could not build an NSBitmapImageRep from the TIFF data",
            "Retry the screenshot request after the page finishes rendering.",
        )
    })?;

    // NSBitmapImageFileType.PNG = 4
    // SAFETY: `bitmap_rep` is live, and Cocoa accepts a null properties dictionary for default PNG options.
    let png_data: Option<objc2::rc::Retained<NSData>> = unsafe { // SAFETY: see above.
        // SAFETY: see above.
        objc2::msg_send![&bitmap_rep, representationUsingType: 4_usize, properties: std::ptr::null::<objc2::runtime::AnyObject>()]
    };
    let png_data = png_data.ok_or_else(|| {
        error_with_fix(
            "encode the screenshot as PNG",
            "AppKit returned no PNG data",
            "Retry the screenshot request after the page finishes rendering.",
        )
    })?;

    // SAFETY: `png_data` is a live `NSData` for the duration of this scope.
    let png_len: usize = unsafe { objc2::msg_send![&*png_data, length] }; // SAFETY: see above.
                                                                          // SAFETY: `png_data` is a live `NSData` for the duration of this scope.
    let png_ptr: *const u8 = unsafe { objc2::msg_send![&*png_data, bytes] }; // SAFETY: see above.
    let png_bytes = if png_ptr.is_null() || png_len == 0 {
        return Err(/* Fix: user-facing error formatted below */ error_with_fix(
            "encode the screenshot as PNG",
            "the generated PNG data was empty",
            "Retry the screenshot request after the page finishes rendering.",
        ));
    } else {
        // SAFETY: `png_ptr` points to `png_len` initialized bytes while `png_data` stays retained here.
        unsafe { std::slice::from_raw_parts(png_ptr, png_len) } // SAFETY: see above.
    };
    let out_path_buf = PathBuf::from(out_path);
    if let Some(parent) = out_path_buf
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|e| {
            error_with_fix(
                "create the screenshot output directory",
                format!("{}: {e}", parent.display()),
                "Check that the output path is writable and retry the screenshot request.",
            )
        })?;
    }
    std::fs::write(&out_path_buf, png_bytes).map_err(|e| {
        error_with_fix(
            "write the screenshot PNG",
            format!("{}: {e}", out_path_buf.display()),
            "Check that the output path is writable and retry the screenshot request.",
        )
    })?;

    let response_json = serde_json::json!({
        "path": out_path_buf.display().to_string(),
        "mode": "native-wkwebview",
        "size": png_bytes.len(),
    });
    write_http_response(
        stream,
        200,
        "OK",
        "application/json; charset=utf-8",
        response_json.to_string().as_bytes(),
    )
    .map_err(|e| {
        error_with_fix(
            "write the screenshot response",
            e,
            "Check the local HTTP connection and retry the screenshot request.",
        )
    })
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn native_screenshot(
    _webview: &wry::WebView,
    _out_path: &str,
    stream: &mut TcpStream,
) -> Result<(), String> {
    write_http_response(
        stream,
        501,
        "Not Implemented",
        "text/plain; charset=utf-8",
        error_with_fix(
            "capture a native screenshot",
            "native screenshots are only available on macOS",
            "Run nf-shell on macOS or use a non-native screenshot path.",
        )
        .as_bytes(),
    )
    .map_err(|e| {
        error_with_fix(
            "write the screenshot response",
            e,
            "Check the local HTTP connection and retry the screenshot request.",
        )
    })
}

pub(crate) fn split_path_and_query(path: &str) -> (&str, Option<&str>) {
    match path.split_once('?') {
        Some((base, query)) => (base, Some(query)),
        None => (path, None),
    }
}

pub(crate) fn query_value<'a>(query: Option<&'a str>, key: &str) -> Option<&'a str> {
    query.and_then(|query| {
        query.split('&').find_map(|part| {
            let (name, value) = part.split_once('=').unwrap_or((part, ""));
            if name == key {
                Some(value)
            } else {
                None
            }
        })
    })
}

pub(crate) fn decode_query_component(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                        "decode the screenshot query string",
                        "the query string contained invalid percent-encoding",
                        "Percent-encode the `out` path correctly and retry the request.",
                    ));
                }
                let hi = decode_hex_nibble(bytes[index + 1])?;
                let lo = decode_hex_nibble(bytes[index + 2])?;
                output.push((hi << 4) | lo);
                index += 3;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(output).map_err(|error| {
        error_with_fix(
            "decode the screenshot query string",
            format!("the query string was not valid UTF-8: {error}"),
            "Percent-encode the `out` path as UTF-8 and retry the request.",
        )
    })
}

fn decode_hex_nibble(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(/* Fix: user-facing error formatted below */ error_with_fix(
            "decode the screenshot query string",
            "the query string contained invalid percent-encoding",
            "Percent-encode the `out` path correctly and retry the request.",
        )),
    }
}

pub(crate) fn default_screenshot_path() -> String {
    std::env::temp_dir()
        .join(format!("nf-screenshot-{}.png", now_unix_millis()))
        .display()
        .to_string()
}

pub(crate) fn now_unix_millis() -> u128 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis(),
        Err(_) /* Internal: fallback error branch handled below */ => 0,
    }
}
