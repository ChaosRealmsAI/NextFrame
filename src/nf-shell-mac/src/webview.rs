//! WKWebView creation for NextFrame desktop.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSBitmapImageRep, NSImage};
use objc2_foundation::{NSError, NSPoint, NSRect, NSSize, NSString, NSURL, NSURLRequest};
use objc2_web_kit::{
    WKSnapshotConfiguration, WKURLSchemeHandler, WKWebView, WKWebViewConfiguration,
    WKWebsiteDataStore,
};

use crate::protocol::{NF_SCHEME, NFDATA_SCHEME, SchemeHandlers};

/// Create a WKWebView that loads the home page from disk.
pub fn create(
    mtm: MainThreadMarker,
    size: NSSize,
    scheme_handlers: &SchemeHandlers,
    configure: impl FnOnce(&WKWebViewConfiguration),
) -> Result<Retained<WKWebView>, String> {
    // SAFETY: mtm proves main-thread, required by WKWebViewConfiguration::new.
    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    register_scheme_handler(&config, NF_SCHEME, ProtocolObject::from_ref(&*scheme_handlers.nf));
    register_scheme_handler(
        &config,
        NFDATA_SCHEME,
        ProtocolObject::from_ref(&*scheme_handlers.nfdata),
    );
    configure(&config);

    // SAFETY: mtm proves main-thread, required by nonPersistentDataStore.
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };

    // SAFETY: config and store are live WebKit objects.
    unsafe {
        config.setWebsiteDataStore(&store);
    }

    let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);

    // Enable developer extras for debugging
    // SAFETY: _setDeveloperExtrasEnabled: is valid for WKPreferences.
    unsafe {
        let prefs = config.preferences();
        let _: () = objc2::msg_send![&prefs, _setDeveloperExtrasEnabled: true];
    }

    // SAFETY: mtm, frame, and config satisfy WKWebView designated initializer.
    let web_view =
        unsafe { WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config) };

    // Allow non-opaque background so window dragging works with -webkit-app-region
    // SAFETY: _setDrawsBackground: is a private but widely-used WKWebView method.
    unsafe {
        let _: () = objc2::msg_send![&web_view, _setDrawsBackground: false];
    }

    let start_url = NSURL::URLWithString(&NSString::from_str("nf://localhost/index.html"));
    if let Some(start_url) = start_url {
        let request = NSURLRequest::requestWithURL(&start_url);
        // SAFETY: web_view is a live WKWebView and request is a valid NSURLRequest.
        let navigation = unsafe { web_view.loadRequest(&request) };
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
    // SAFETY: config is a live WKWebViewConfiguration and handler conforms to WKURLSchemeHandler.
    unsafe {
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
            let desc = unsafe { &*error }.localizedDescription().to_string();
            Err(format!("JS error: {desc}"))
        } else if !result.is_null() {
            let s: Retained<NSString> = unsafe {
                objc2::msg_send![result, description]
            };
            Ok(s.to_string())
        } else {
            Ok("null".to_string())
        };
        *slot_clone.borrow_mut() = Some(val);
    });

    unsafe {
        web_view.evaluateJavaScript_completionHandler(&ns_script, Some(&block));
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err("JS eval timed out".to_string());
        }
        pump_run_loop(Duration::from_millis(10));
    }
    let result = slot.borrow_mut().take().ok_or("no result".to_string())?;
    result
}

fn load_fallback(web_view: &WKWebView) {
    let html = NSString::from_str(FALLBACK_HTML);
    unsafe {
        web_view.loadHTMLString_baseURL(&html, None);
    }
}

/// Public version for use from app.rs verify.
pub fn pump_run_loop_pub(duration: Duration) {
    pump_run_loop(duration);
}

/// Pump the main run loop for a given duration (needed for async WebKit ops).
fn pump_run_loop(duration: Duration) {
    // SAFETY: CFRunLoopRunInMode is a safe C function for pumping the run loop.
    unsafe {
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
    let mtm =
        MainThreadMarker::new().ok_or_else(|| "screenshot must run on main thread".to_string())?;

    // Wait for page to render (fonts + animations need time)
    pump_run_loop(Duration::from_secs(4));

    // SAFETY: WKSnapshotConfiguration::new requires main thread.
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };

    let slot: SnapshotSlot = Rc::new(RefCell::new(None));
    let slot_clone = Rc::clone(&slot);

    let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let result = if !image.is_null() {
            // SAFETY: image is a valid NSImage pointer returned by WebKit.
            match unsafe { Retained::retain(image) } {
                Some(img) => Ok(img),
                None => Err("null image".to_string()),
            }
        } else if !error.is_null() {
            // SAFETY: error is a valid NSError pointer.
            let desc = unsafe { &*error }.localizedDescription().to_string();
            Err(format!("snapshot error: {desc}"))
        } else {
            Err("snapshot returned nil".to_string())
        };
        *slot_clone.borrow_mut() = Some(result);
    });

    // SAFETY: web_view, config, and block are live main-thread objects.
    unsafe {
        web_view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
    }

    // Poll until complete
    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(10) {
            return Err("snapshot timed out after 10s".to_string());
        }
        pump_run_loop(Duration::from_millis(10));
    }

    let image = slot.borrow_mut().take().ok_or("no result")??;

    // Convert NSImage → PNG data → write to disk
    // SAFETY: TIFFRepresentation and initWithData are standard AppKit methods.
    unsafe {
        let tiff = image
            .TIFFRepresentation()
            .ok_or_else(|| "failed to get TIFF data".to_string())?;
        let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
            .ok_or_else(|| "failed to create bitmap rep".to_string())?;

        let png_type: objc2_app_kit::NSBitmapImageFileType =
            objc2_app_kit::NSBitmapImageFileType::PNG;
        let png_data: Option<Retained<objc2_foundation::NSData>> = objc2::msg_send![&bitmap, representationUsingType: png_type, properties: std::ptr::null::<AnyObject>()];

        let data = png_data.ok_or_else(|| "failed to create PNG data".to_string())?;
        // Use NSData's bytes/length via CoreFoundation-compatible approach
        let len: usize = objc2::msg_send![&data, length];
        let ptr: *const std::ffi::c_void = objc2::msg_send![&data, bytes];
        let bytes = std::slice::from_raw_parts(ptr as *const u8, len);
        std::fs::write(out_path, bytes).map_err(|e| format!("failed to write {out_path}: {e}"))?;
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
