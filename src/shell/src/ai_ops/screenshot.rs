use std::net::TcpStream;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::ipc::write_http_response;

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
    use objc2::MainThreadMarker;
    use objc2::rc::{Retained, autoreleasepool};
    use objc2_app_kit::{NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::WKSnapshotConfiguration;

    let mtm = MainThreadMarker::new().ok_or("native_screenshot must run on the main thread")?;

    let wk_webview = webview.webview();
    // SAFETY: `mtm` proves this runs on Cocoa's main thread, which `WKSnapshotConfiguration::new` requires.
    let config = unsafe { WKSnapshotConfiguration::new(mtm) }; // SAFETY: see above.

    type Slot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
    let slot: Slot = Rc::new(RefCell::new(None));
    let slot_clone = slot.clone();

    let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        autoreleasepool(|_| {
            // SAFETY: WebKit passes either null or a valid `NSError *` for the duration of this callback.
            let result = if let Some(error) = unsafe { error.as_ref() } { // SAFETY: see above.
                Err(format!(
                    "WKWebView.takeSnapshot error: {}",
                    error.localizedDescription()
                ))
            // SAFETY: WebKit keeps `image` alive for this callback, and `retain` takes our own ownership.
            } else if let Some(image) = unsafe { Retained::retain(image) } { // SAFETY: see above.
                Ok(image)
            } else {
                Err("WKWebView.takeSnapshot returned nil".into())
            };
            *slot_clone.borrow_mut() = Some(result);
        });
    });

    // SAFETY: `wk_webview`, `config`, and `block` are live Objective-C objects on the main thread.
    unsafe { // SAFETY: see above.
        wk_webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(10) {
            return write_http_response(
                stream,
                500,
                "Internal Server Error",
                "text/plain; charset=utf-8",
                b"timed out waiting for WKWebView.takeSnapshot",
            )
            .map_err(|e| format!("failed to write timeout response: {e}"));
        }
        std::thread::sleep(Duration::from_millis(10));
        // Pump the run loop so the completion handler fires
        #[allow(clippy::undocumented_unsafe_blocks)]
        // SAFETY: `currentRunLoop` and `runUntilDate:` use live Objective-C objects for this thread only.
        unsafe { // SAFETY: see above.
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
        .ok_or("snapshot slot empty")?
        .map_err(|e| format!("snapshot failed: {e}"))?;

    // Convert NSImage → PNG data
    let tiff_data = image
        .TIFFRepresentation()
        .ok_or("failed to get TIFF data from NSImage")?;
    let bitmap_rep = NSBitmapImageRep::imageRepWithData(&tiff_data)
        .ok_or("failed to create NSBitmapImageRep")?;

    // NSBitmapImageFileType.PNG = 4
    // SAFETY: `bitmap_rep` is live, and Cocoa accepts a null properties dictionary for default PNG options.
    let png_data: Option<objc2::rc::Retained<NSData>> = unsafe { // SAFETY: see above.
        objc2::msg_send![&bitmap_rep, representationUsingType: 4_usize, properties: std::ptr::null::<objc2::runtime::AnyObject>()]
    };
    let png_data = png_data.ok_or("failed to generate PNG data")?;

    // SAFETY: `png_data` is a live `NSData` for the duration of this scope.
    let png_len: usize = unsafe { objc2::msg_send![&*png_data, length] }; // SAFETY: see above.
    // SAFETY: `png_data` is a live `NSData` for the duration of this scope.
    let png_ptr: *const u8 = unsafe { objc2::msg_send![&*png_data, bytes] }; // SAFETY: see above.
    let png_bytes = if png_ptr.is_null() || png_len == 0 {
        return Err("PNG data is empty".into());
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
            format!(
                "failed to create screenshot directory {}: {e}",
                parent.display()
            )
        })?;
    }
    std::fs::write(&out_path_buf, png_bytes)
        .map_err(|e| format!("failed to write PNG to {}: {e}", out_path_buf.display()))?;

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
    .map_err(|e| format!("failed to write response: {e}"))
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
        b"native screenshot only available on macOS",
    )
    .map_err(|e| format!("failed to write response: {e}"))
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
            if name == key { Some(value) } else { None }
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
                    return Err("invalid percent-encoding in query string".to_string());
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

    String::from_utf8(output).map_err(|error| format!("invalid UTF-8 in query string: {error}"))
}

fn decode_hex_nibble(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("invalid percent-encoding in query string".to_string()),
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
        Err(_) => 0,
    }
}
