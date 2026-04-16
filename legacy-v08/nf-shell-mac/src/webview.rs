//! WKWebView creation for NextFrame desktop.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSBitmapImageRep, NSImage};
use objc2_foundation::{NSError, NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
use objc2_web_kit::{
    WKSnapshotConfiguration, WKURLSchemeHandler, WKWebView, WKWebViewConfiguration,
    WKWebsiteDataStore,
};

use crate::protocol::{SchemeHandlers, NFDATA_SCHEME, NF_SCHEME};

/// Create a WKWebView that loads the home page from disk.
pub fn create(
    mtm: MainThreadMarker,
    size: NSSize,
    scheme_handlers: &SchemeHandlers,
    configure: impl FnOnce(&WKWebViewConfiguration),
) -> Result<Retained<WKWebView>, String> {
    let config = unsafe { WKWebViewConfiguration::new(mtm) }; // SAFETY: mtm proves this WebKit configuration is created on the required main thread.
    register_scheme_handler(
        &config,
        NF_SCHEME,
        ProtocolObject::from_ref(&*scheme_handlers.nf),
    );
    register_scheme_handler(
        &config,
        NFDATA_SCHEME,
        ProtocolObject::from_ref(&*scheme_handlers.nfdata),
    );
    configure(&config);

    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) }; // SAFETY: mtm proves this WebKit data store is created on the required main thread.

    unsafe {
        // SAFETY: config and store are live WebKit objects, and setWebsiteDataStore just attaches the store to this configuration.
        config.setWebsiteDataStore(&store);
    }

    let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);

    // Enable developer extras for debugging
    unsafe {
        // SAFETY: prefs is the live WKPreferences object for this configuration and the selector matches the private API used here.
        let prefs = config.preferences();
        let _: () = objc2::msg_send![&prefs, _setDeveloperExtrasEnabled: true];
    }

    let web_view =
        unsafe { WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config) }; // SAFETY: mtm, rect, and config satisfy WKWebView's designated initializer on the main thread.

    // Allow non-opaque background so window dragging works with -webkit-app-region
    unsafe {
        // SAFETY: web_view is live and this private selector only toggles WebKit background drawing behavior.
        let _: () = objc2::msg_send![&web_view, _setDrawsBackground: false];
    }

    let url_str = std::env::var("NF_START_URL")
        .or_else(|_| {
            std::env::args()
                .find(|a| a.starts_with("--url="))
                .map(|a| a.trim_start_matches("--url=").to_string())
                .ok_or(std::env::VarError::NotPresent)
        })
        .unwrap_or_else(|_| "nf://localhost/index.html".to_string());
    let start_url = NSURL::URLWithString(&NSString::from_str(&url_str));
    if let Some(start_url) = start_url {
        let request = NSURLRequest::requestWithURL(&start_url);
        let navigation = unsafe { web_view.loadRequest(&request) }; // SAFETY: web_view is a live WKWebView and request is a valid NSURLRequest.
        if navigation.is_none() {
            tracing::warn!("WKWebView refused nf:// load, using fallback");
            load_fallback(&web_view);
        }
    } else {
        tracing::warn!("failed to create nf:// start URL, using fallback");
        load_fallback(&web_view);
    }

    tracing::info!("WKWebView created");
    Ok(web_view)
}

fn register_scheme_handler(
    config: &WKWebViewConfiguration,
    scheme: &str,
    handler: &ProtocolObject<dyn WKURLSchemeHandler>,
) {
    let scheme = NSString::from_str(scheme);
    unsafe {
        // SAFETY: config is live and handler is a registered Objective-C object implementing WKURLSchemeHandler.
        config.setURLSchemeHandler_forURLScheme(Some(handler), &scheme);
    }
}

/// Execute JavaScript and return the string result.
pub fn eval_js(web_view: &WKWebView, script: &str) -> Result<String, String> {
    let slot: Rc<RefCell<Option<Result<String, String>>>> = Rc::new(RefCell::new(None));
    let slot_clone = Rc::clone(&slot);

    let ns_script = NSString::from_str(script);
    let block = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        let val = if !error.is_null() {
            let desc = unsafe { &*error }.localizedDescription().to_string(); // SAFETY: error is non-null (checked above), a valid NSError from evaluateJavaScript callback.
            Err(format!(
                "JS error: {desc}. Fix: inspect the evaluated script and browser console output."
            ))
        } else if !result.is_null() {
            let s: Retained<NSString> = unsafe {
                // SAFETY: result was checked for null and description returns an NSString for Objective-C objects.
                objc2::msg_send![result, description]
            };
            Ok(s.to_string())
        } else {
            Ok("null".to_string())
        };
        *slot_clone.borrow_mut() = Some(val);
    });

    unsafe {
        // SAFETY: web_view is live on the main thread and WebKit accepts this completion block for JavaScript evaluation.
        web_view.evaluateJavaScript_completionHandler(&ns_script, Some(&block));
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err(
                "JS eval timed out. Fix: ensure the page is responsive and the script completes within 5 seconds."
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

fn load_fallback(web_view: &WKWebView) {
    let html = NSString::from_str(FALLBACK_HTML);
    unsafe {
        // SAFETY: web_view is live and html is a valid NSString passed to WebKit's fallback HTML loader.
        web_view.loadHTMLString_baseURL(&html, None);
    }
}

/// Public version for use from app.rs verify.
pub fn pump_run_loop_pub(duration: Duration) {
    pump_run_loop(duration);
}

/// Pump the main run loop for a given duration (needed for async WebKit ops).
fn pump_run_loop(duration: Duration) {
    unsafe {
        // SAFETY: the imported CoreFoundation symbols are process-global and this just pumps the current run loop in default mode.
        let deadline = Instant::now() + duration;
        while Instant::now() < deadline {
            extern "C" {
                fn CFRunLoopRunInMode(
                    mode: *const std::ffi::c_void,
                    seconds: f64,
                    return_after_source_handled: u8,
                ) -> i32;
                #[link_name = "kCFRunLoopDefaultMode"]
                static CF_RUN_LOOP_DEFAULT_MODE: *const std::ffi::c_void;
            }
            CFRunLoopRunInMode(CF_RUN_LOOP_DEFAULT_MODE, 0.01, 1);
        }
    }
}

type SnapshotSlot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;

/// Take a screenshot of the WKWebView and save as PNG to the given path.
pub fn screenshot(web_view: &WKWebView, out_path: &str) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or_else(|| {
        "screenshot must run on main thread. Fix: call screenshot from the AppKit main thread."
            .to_string()
    })?;

    // Wait for page to render (fonts + animations need time)
    pump_run_loop(Duration::from_secs(4));

    let config = unsafe { WKSnapshotConfiguration::new(mtm) }; // SAFETY: mtm proves snapshot configuration is created on WebKit's required main thread.

    let slot: SnapshotSlot = Rc::new(RefCell::new(None));
    let slot_clone = Rc::clone(&slot);

    let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let result = if !image.is_null() {
            match unsafe { Retained::retain(image) } { // SAFETY: image is a valid NSImage pointer returned by WebKit.
                Some(img) => Ok(img),
                None => Err(
                    "Internal: snapshot callback returned a null image pointer. Fix: inspect the WebKit snapshot callback contract."
                        .to_string(),
                ),
            }
        } else if !error.is_null() {
            let desc = unsafe { &*error }.localizedDescription().to_string(); // SAFETY: error is non-null (checked above), a valid NSError from the snapshot callback.
            Err(format!(
                "snapshot error: {desc}. Fix: ensure the web view is loaded before taking a snapshot."
            ))
        } else {
            Err(
                "Internal: snapshot returned nil without an NSError. Fix: inspect the WebKit snapshot completion path."
                    .to_string(),
            )
        };
        *slot_clone.borrow_mut() = Some(result);
    });

    unsafe {
        // SAFETY: web_view, config, and block are live main-thread objects accepted by takeSnapshotWithConfiguration.
        web_view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
    }

    // Poll until complete
    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(10) {
            return Err(
                "snapshot timed out after 10s. Fix: wait for the page to finish rendering before capturing."
                    .to_string(),
            );
        }
        pump_run_loop(Duration::from_millis(10));
    }

    let image = slot.borrow_mut().take().ok_or(
        "Internal: snapshot completed without storing a result. Fix: inspect the snapshot completion handler."
            .to_string(),
    )??;

    // Convert NSImage → PNG data → write to disk
    unsafe {
        // SAFETY: image is live, AppKit TIFF/bitmap APIs are called on the main thread, and NSData bytes stay valid for the slice below.
        let tiff = image
            .TIFFRepresentation()
            .ok_or_else(|| {
                "Internal: failed to get TIFF data. Fix: verify the snapshot image contains bitmap data."
                    .to_string()
            })?;
        let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
            .ok_or_else(|| {
                "Internal: failed to create bitmap rep. Fix: verify the TIFF snapshot data is valid."
                    .to_string()
            })?;

        let png_type: objc2_app_kit::NSBitmapImageFileType =
            objc2_app_kit::NSBitmapImageFileType::PNG;
        let png_data: Option<Retained<objc2_foundation::NSData>> = objc2::msg_send![&bitmap, representationUsingType: png_type, properties: std::ptr::null::<AnyObject>()];

        let data = png_data.ok_or_else(|| {
            "Internal: failed to create PNG data. Fix: verify the bitmap representation supports PNG export."
                .to_string()
        })?;
        // Use NSData's bytes/length via CoreFoundation-compatible approach
        let len: usize = objc2::msg_send![&data, length];
        let ptr: *const std::ffi::c_void = objc2::msg_send![&data, bytes];
        let bytes = std::slice::from_raw_parts(ptr as *const u8, len);
        std::fs::write(out_path, bytes).map_err(|e| {
            format!(
                "failed to write {out_path}: {e}. Fix: verify the output path exists and is writable."
            )
        })?;
    }

    tracing::info!("screenshot saved to {out_path}");
    Ok(())
}

const FALLBACK_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
html, body { height: 100%; background: #050507; color: white;
  font-family: -apple-system, system-ui, sans-serif;
  display: flex; align-items: center; justify-content: center;
  -webkit-font-smoothing: antialiased; }
</style></head>
<body><h1>NextFrame v0.5</h1></body>
</html>"#;
