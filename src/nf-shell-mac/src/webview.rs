//! WKWebView creation for NextFrame desktop.

use std::path::PathBuf;

use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSBitmapImageRep, NSImage};
use objc2_foundation::{NSError, NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_web_kit::{
    WKSnapshotConfiguration, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

/// Resolve the web-v2 directory relative to the executable.
fn web_dir() -> PathBuf {
    // In dev: executable is at target/debug/nextframe
    // web-v2 is at src/nf-runtime/web-v2/
    let exe = std::env::current_exe().unwrap_or_default();
    let project_root = exe
        .ancestors()
        .find(|p| p.join("Cargo.toml").exists())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    project_root.join("src/nf-runtime/web-v2")
}

/// Create a WKWebView that loads the home page from disk.
pub fn create(
    mtm: MainThreadMarker,
    size: NSSize,
) -> Result<Retained<WKWebView>, String> {
    // SAFETY: mtm proves main-thread, required by WKWebViewConfiguration::new.
    let config = unsafe { WKWebViewConfiguration::new(mtm) };

    // SAFETY: mtm proves main-thread, required by nonPersistentDataStore.
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };

    // SAFETY: config and store are live WebKit objects.
    unsafe {
        config.setWebsiteDataStore(&store);
    }

    let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);

    // SAFETY: mtm, frame, and config satisfy WKWebView designated initializer.
    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config)
    };

    // Load from local file
    let dir = web_dir();
    let index_path = dir.join("index.html");

    if index_path.exists() {
        let file_url = NSURL::URLWithString(&NSString::from_str(
            &format!("file://{}", index_path.display()),
        ));
        let dir_url = NSURL::URLWithString(&NSString::from_str(
            &format!("file://{}/", dir.display()),
        ));

        if let (Some(file), Some(dir)) = (file_url, dir_url) {
            // SAFETY: loadFileURL:allowingReadAccessToURL: is a standard WKWebView method.
            unsafe {
                web_view.loadFileURL_allowingReadAccessToURL(&file, &dir);
            }
            tracing::info!("loading {}", index_path.display());
        } else {
            tracing::warn!("failed to create NSURLs, falling back to inline HTML");
            load_fallback(&web_view);
        }
    } else {
        tracing::warn!("index.html not found at {}, using fallback", index_path.display());
        load_fallback(&web_view);
    }

    tracing::info!("WKWebView created");
    Ok(web_view)
}

fn load_fallback(web_view: &WKWebView) {
    let html = NSString::from_str(FALLBACK_HTML);
    unsafe {
        web_view.loadHTMLString_baseURL(&html, None);
    }
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
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| "screenshot must run on main thread".to_string())?;

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
        let tiff = image.TIFFRepresentation()
            .ok_or_else(|| "failed to get TIFF data".to_string())?;
        let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
            .ok_or_else(|| "failed to create bitmap rep".to_string())?;

        let png_type: objc2_app_kit::NSBitmapImageFileType =
            objc2_app_kit::NSBitmapImageFileType::PNG;
        let png_data: Option<Retained<objc2_foundation::NSData>> =
            objc2::msg_send![&bitmap, representationUsingType: png_type, properties: std::ptr::null::<AnyObject>()];

        let data = png_data.ok_or_else(|| "failed to create PNG data".to_string())?;
        // Use NSData's bytes/length via CoreFoundation-compatible approach
        let len: usize = objc2::msg_send![&data, length];
        let ptr: *const std::ffi::c_void = objc2::msg_send![&data, bytes];
        let bytes = std::slice::from_raw_parts(ptr as *const u8, len);
        std::fs::write(out_path, bytes)
            .map_err(|e| format!("failed to write {out_path}: {e}"))?;
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
