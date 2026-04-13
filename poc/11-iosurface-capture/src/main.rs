// POC: IOSurface direct read from WKWebView CALayer
//
// Goal: Compare capture methods on the same WKWebView:
//   1. CALayer.render (current approach — CPU rasterize)
//   2. IOSurface direct read (new — GPU buffer direct copy)
//
// We load a real HTML file, wait for it to render, then benchmark both.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::ffi::c_void;
use std::path::Path;
use std::time::{Duration, Instant};

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::{AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSBitmapImageFileType,
    NSBitmapImageRep, NSWindow, NSWindowStyleMask,
};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGBitmapContextCreateImage, CGColorSpace, CGContext, CGImage,
    CGImageAlphaInfo, CGImageByteOrderInfo,
};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSDictionary, NSPoint, NSRect, NSRunLoop, NSSize, NSString, NSURL,
};
use objc2_quartz_core::CALayer;
use objc2_web_kit::{
    WKAudiovisualMediaTypes, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

// IOSurface C API
#[link(name = "IOSurface", kind = "framework")]
unsafe extern "C" {
    fn IOSurfaceGetWidth(buffer: *const c_void) -> usize;
    fn IOSurfaceGetHeight(buffer: *const c_void) -> usize;
    fn IOSurfaceGetBytesPerRow(buffer: *const c_void) -> usize;
    fn IOSurfaceGetBaseAddress(buffer: *const c_void) -> *mut c_void;
    fn IOSurfaceLock(buffer: *const c_void, options: u32, seed: *mut u32) -> i32;
    fn IOSurfaceUnlock(buffer: *const c_void, options: u32, seed: *mut u32) -> i32;
}

// CoreFoundation type inspection
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFGetTypeID(cf: *const c_void) -> u64;
}

unsafe extern "C" {
    fn IOSurfaceGetTypeID() -> u64;
}

unsafe fn is_cf_iosurface(ptr: *const c_void) -> bool {
    if ptr.is_null() {
        return false;
    }
    let type_id = CFGetTypeID(ptr);
    let ios_type_id = IOSurfaceGetTypeID();
    type_id == ios_type_id
}

const VIEW_WIDTH: f64 = 540.0;
const VIEW_HEIGHT: f64 = 960.0;
const DPR: f64 = 2.0;
const BENCHMARK_ITERATIONS: usize = 50;
const OUTPUT_DIR: &str = "/Users/Zhuanz/bigbang/NextFrame/poc/11-iosurface-capture";

fn main() {
    if let Err(err) = run() {
        eprintln!("\n  ✗ {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let html_path = "/Users/Zhuanz/NextFrame/projects/show/ep01-scene-types/showcase.html";
    if !Path::new(html_path).exists() {
        return Err(format!("HTML file not found: {html_path}"));
    }

    let mtm = MainThreadMarker::new().ok_or("must run on the main thread")?;

    // Setup NSApplication
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    app.finishLaunching();

    // Create window
    let rect = NSRect::new(
        NSPoint::new(100.0, 100.0),
        NSSize::new(VIEW_WIDTH, VIEW_HEIGHT),
    );
    let window: Retained<NSWindow> = unsafe {
        msg_send![
            NSWindow::alloc(mtm),
            initWithContentRect: rect,
            styleMask: NSWindowStyleMask::Titled | NSWindowStyleMask::Closable,
            backing: NSBackingStoreType::Buffered,
            defer: false
        ]
    };
    window.setTitle(&NSString::from_str("IOSurface POC"));
    window.orderFrontRegardless();

    // Create WKWebView
    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
    unsafe {
        config.setWebsiteDataStore(&store);
        config.setMediaTypesRequiringUserActionForPlayback(WKAudiovisualMediaTypes::All);
    }
    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(
            WKWebView::alloc(mtm),
            NSRect::new(
                NSPoint::new(0.0, 0.0),
                NSSize::new(VIEW_WIDTH, VIEW_HEIGHT),
            ),
            &config,
        )
    };
    web_view.setWantsLayer(true);
    window.setContentView(Some(&web_view));

    // Load HTML
    let file_url = NSURL::fileURLWithPath(&NSString::from_str(html_path));
    let parent = Path::new(html_path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("/");
    let dir_url = NSURL::fileURLWithPath(&NSString::from_str(parent));
    let nav = unsafe { web_view.loadFileURL_allowingReadAccessToURL(&file_url, &dir_url) };
    if nav.is_none() {
        return Err("loadFileURL returned nil".into());
    }

    println!("\n  loading HTML...");
    wait_for_load(&web_view, Duration::from_secs(30))?;
    println!("  ✓ page loaded");

    // Advance to t=5s so we have interesting content
    eval(
        &web_view,
        "window.__onFrame && window.__onFrame({time:5.0, progress:25, cue:2, subtitle:'', segment:0, totalSegments:1, segmentTitles:['showcase'], segmentDurations:[20]})",
    )?;
    pump(Duration::from_millis(500));

    // Sync layout
    web_view.setFrame(NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(VIEW_WIDTH, VIEW_HEIGHT),
    ));
    web_view.layoutSubtreeIfNeeded();
    web_view.displayIfNeeded();
    window.displayIfNeeded();
    pump(Duration::from_millis(200));

    println!("\n  === Capture Method Comparison ===\n");

    // --- Method 1: CALayer.render ---
    let layer = web_view.layer().ok_or("WKWebView has no layer")?;

    let pw = (VIEW_WIDTH * DPR) as usize;
    let ph = (VIEW_HEIGHT * DPR) as usize;

    println!("  Method 1: CALayer.render (current)");
    let mut times_layer = Vec::with_capacity(BENCHMARK_ITERATIONS);
    let mut last_image_layer = None;
    for i in 0..BENCHMARK_ITERATIONS {
        let t = 5.0 + i as f64 * 0.033;
        inject_frame(&web_view, t)?;
        pump(Duration::from_millis(1));

        let start = Instant::now();
        let image = layer_render(&layer, pw, ph)?;
        let elapsed = start.elapsed();
        times_layer.push(elapsed);
        last_image_layer = Some(image);
    }
    let avg_layer = average_duration(&times_layer);
    println!(
        "    {} frames: avg {:.2}ms, min {:.2}ms, max {:.2}ms",
        BENCHMARK_ITERATIONS,
        avg_layer.as_secs_f64() * 1000.0,
        times_layer
            .iter()
            .min()
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0),
        times_layer
            .iter()
            .max()
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0),
    );

    // Save reference image
    if let Some(ref img) = last_image_layer {
        let path = format!("{OUTPUT_DIR}/capture-layer.png");
        save_cgimage_to_png(img, &path)?;
        println!("    saved: capture-layer.png");
    }

    // --- Method 2: IOSurface direct read ---
    println!("\n  Method 2: IOSurface direct read (experimental)");
    println!("    exploring layer tree...");
    explore_layer_tree(&layer, 0);

    // Try to find IOSurface from layer tree
    let surface = walk_for_iosurface(&layer, 0);
    match surface {
        Some(surf) => {
            let surf_w = unsafe { IOSurfaceGetWidth(surf) };
            let surf_h = unsafe { IOSurfaceGetHeight(surf) };
            let surf_bpr = unsafe { IOSurfaceGetBytesPerRow(surf) };
            println!(
                "\n    ✓ found IOSurface: {}x{}, bytesPerRow={}",
                surf_w, surf_h, surf_bpr
            );

            let mut times_ios = Vec::with_capacity(BENCHMARK_ITERATIONS);
            let mut last_data = None;
            for i in 0..BENCHMARK_ITERATIONS {
                let t = 5.0 + i as f64 * 0.033;
                inject_frame(&web_view, t)?;
                pump(Duration::from_millis(1));

                // Re-walk each frame — surface pointer may change
                let start = Instant::now();
                if let Some(s) = walk_for_iosurface(&layer, 0) {
                    let data = read_iosurface(s)?;
                    let elapsed = start.elapsed();
                    times_ios.push(elapsed);
                    last_data = Some((data, s));
                }
            }

            if !times_ios.is_empty() {
                let avg_ios = average_duration(&times_ios);
                println!(
                    "    {} frames: avg {:.2}ms, min {:.2}ms, max {:.2}ms",
                    times_ios.len(),
                    avg_ios.as_secs_f64() * 1000.0,
                    times_ios
                        .iter()
                        .min()
                        .map(|d| d.as_secs_f64() * 1000.0)
                        .unwrap_or(0.0),
                    times_ios
                        .iter()
                        .max()
                        .map(|d| d.as_secs_f64() * 1000.0)
                        .unwrap_or(0.0),
                );

                // Save IOSurface capture
                if let Some((ref data, s)) = last_data {
                    let sw = unsafe { IOSurfaceGetWidth(s) };
                    let sh = unsafe { IOSurfaceGetHeight(s) };
                    let sbpr = unsafe { IOSurfaceGetBytesPerRow(s) };
                    let path = format!("{OUTPUT_DIR}/capture-iosurface.png");
                    save_raw_to_png(data, sw, sh, sbpr, &path)?;
                    println!("    saved: capture-iosurface.png");
                }

                let speedup = avg_layer.as_secs_f64() / avg_ios.as_secs_f64().max(0.0001);
                println!("\n  === Result ===");
                println!(
                    "    CALayer.render:    {:.2}ms/frame ({:.0} fps)",
                    avg_layer.as_secs_f64() * 1000.0,
                    1.0 / avg_layer.as_secs_f64().max(0.0001)
                );
                println!(
                    "    IOSurface direct:  {:.2}ms/frame ({:.0} fps)",
                    avg_ios.as_secs_f64() * 1000.0,
                    1.0 / avg_ios.as_secs_f64().max(0.0001)
                );
                println!("    Speedup:           {:.1}x", speedup);
            }
        }
        None => {
            println!("\n    ✗ no IOSurface found in any layer");
            println!("    conclusion: WKWebView does not expose IOSurface via layer.contents");
            println!("    on this macOS version. The layer tree above shows what's available.");
        }
    }

    // Keep window visible briefly
    pump(Duration::from_secs(1));
    println!("\n  done.\n");
    Ok(())
}

// --- Layer tree walk ---

fn walk_for_iosurface(layer: &CALayer, depth: usize) -> Option<*const c_void> {
    if depth > 30 {
        return None;
    }

    // Check if this layer's contents is an IOSurface.
    // Only safe to call IOSurface APIs if the object actually IS an IOSurface.
    // We check using Objective-C class inspection first.
    let contents: *const c_void = unsafe { msg_send![layer, contents] };
    if !contents.is_null() {
        // Check if it's an IOSurface class
        let is_iosurface = unsafe {
            let obj = contents as *const AnyObject;
            let cls: *const AnyClass = msg_send![obj, class];
            if !cls.is_null() {
                let name: Retained<NSString> = msg_send![cls, description];
                let name_str = name.to_string();
                name_str.contains("IOSurface")
            } else {
                false
            }
        };
        // Also check if it's a CAIOSurface (WebKit's remote surface proxy)
        let is_caiosurface = !is_iosurface && unsafe {
            let obj = contents as *const AnyObject;
            let cls: *const AnyClass = msg_send![obj, class];
            if !cls.is_null() {
                let name: Retained<NSString> = msg_send![cls, description];
                name.to_string().contains("CAIOSurface")
            } else {
                false
            }
        };

        // Try to get underlying IOSurface from CAIOSurface
        if is_caiosurface {
            // CAIOSurface responds to `surface` selector which returns the backing IOSurface
            let responds: bool = unsafe {
                let sel = objc2::sel!(surface);
                msg_send![contents as *const AnyObject, respondsToSelector: sel]
            };
            if responds {
                let surface: *const c_void = unsafe { msg_send![contents as *const AnyObject, surface] };
                if !surface.is_null() {
                    let w = unsafe { IOSurfaceGetWidth(surface) };
                    let h = unsafe { IOSurfaceGetHeight(surface) };
                    if w > 0 && h > 0 {
                        return Some(surface);
                    }
                }
            }
        }

        let is_iosurface = is_iosurface || unsafe { is_cf_iosurface(contents) };
        if is_iosurface {
            let w = unsafe { IOSurfaceGetWidth(contents) };
            let h = unsafe { IOSurfaceGetHeight(contents) };
            if w > 0 && h > 0 {
                return Some(contents);
            }
        }
    }

    let sublayers: Option<Retained<AnyObject>> = unsafe { msg_send![layer, sublayers] };
    if let Some(ref subs) = sublayers {
        let count: usize = unsafe { msg_send![subs, count] };
        for i in 0..count {
            let sub: Retained<CALayer> = unsafe { msg_send![subs, objectAtIndex: i] };
            if let Some(surface) = walk_for_iosurface(&sub, depth + 1) {
                return Some(surface);
            }
        }
    }
    None
}

fn explore_layer_tree(layer: &CALayer, depth: usize) {
    if depth > 20 {
        return;
    }
    let indent = "    ".to_string() + &"  ".repeat(depth);
    let bounds = layer.bounds();
    let class_name: Retained<NSString> = unsafe {
        let cls: *const AnyClass = msg_send![layer, class];
        let name: *const NSString = msg_send![cls, description];
        Retained::retain(name as *mut NSString).unwrap_or_else(|| NSString::from_str("?"))
    };

    let contents: *const c_void = unsafe { msg_send![layer, contents] };
    let has_contents = !contents.is_null();
    let opaque: Bool = unsafe { msg_send![layer, isOpaque] };

    // Check for private _contentsId (CALayerHost uses this for remote surfaces)
    let responds_to_contents_id: bool = unsafe {
        let sel = objc2::sel!(_contentsId);
        msg_send![layer, respondsToSelector: sel]
    };
    let contents_id_info = if responds_to_contents_id {
        let cid: u64 = unsafe { msg_send![layer, _contentsId] };
        if cid > 0 {
            format!(" contextId={cid}")
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let contents_info = if has_contents {
        // Check class name to avoid calling IOSurface APIs on non-IOSurface objects
        let obj_class: String = unsafe {
            let cls: *const AnyClass = msg_send![contents as *const AnyObject, class];
            if !cls.is_null() {
                let name: Retained<NSString> = msg_send![cls, description];
                name.to_string()
            } else {
                "unknown".to_string()
            }
        };
        if obj_class.contains("IOSurface") {
            let w = unsafe { IOSurfaceGetWidth(contents) };
            let h = unsafe { IOSurfaceGetHeight(contents) };
            format!("IOSurface({}x{}) [{}]", w, h, obj_class)
        } else if obj_class == "__NSCFType" {
            let type_id = unsafe { CFGetTypeID(contents) };
            let ios_type_id = unsafe { IOSurfaceGetTypeID() };
            if type_id == ios_type_id {
                let w = unsafe { IOSurfaceGetWidth(contents) };
                let h = unsafe { IOSurfaceGetHeight(contents) };
                format!("IOSurface({}x{}) [bridged]", w, h)
            } else {
                // Try to get CFType description
                let desc: String = unsafe {
                    let desc_ptr: *const AnyObject = msg_send![contents as *const AnyObject, description];
                    if !desc_ptr.is_null() {
                        let ns: &NSString = &*(desc_ptr as *const NSString);
                        ns.to_string()
                    } else {
                        "?".to_string()
                    }
                };
                // Truncate description
                let short = if desc.len() > 80 { &desc[..80] } else { &desc };
                format!("CFTypeID={} IOSurfaceTypeID={} desc={}", type_id, ios_type_id, short)
            }
        } else {
            format!("{}(ptr)", obj_class)
        }
    } else {
        "nil".to_string()
    };

    println!(
        "{}{} [{:.0}x{:.0}] opaque={} contents={}{}",
        indent,
        class_name,
        bounds.size.width,
        bounds.size.height,
        opaque.as_bool(),
        contents_info,
        contents_id_info
    );

    let sublayers: Option<Retained<AnyObject>> = unsafe { msg_send![layer, sublayers] };
    if let Some(ref subs) = sublayers {
        let count: usize = unsafe { msg_send![subs, count] };
        for i in 0..count {
            let sub: Retained<CALayer> = unsafe { msg_send![subs, objectAtIndex: i] };
            explore_layer_tree(&sub, depth + 1);
        }
    }
}

// --- IOSurface reading ---

fn read_iosurface(surface: *const c_void) -> Result<Vec<u8>, String> {
    let w = unsafe { IOSurfaceGetWidth(surface) };
    let h = unsafe { IOSurfaceGetHeight(surface) };
    let bpr = unsafe { IOSurfaceGetBytesPerRow(surface) };

    if w == 0 || h == 0 {
        return Err("IOSurface has zero dimensions".into());
    }

    // kIOSurfaceLockReadOnly = 1
    let lock_result = unsafe { IOSurfaceLock(surface, 1, std::ptr::null_mut()) };
    if lock_result != 0 {
        return Err(format!("IOSurfaceLock failed: {lock_result}"));
    }

    let base = unsafe { IOSurfaceGetBaseAddress(surface) };
    if base.is_null() {
        unsafe { IOSurfaceUnlock(surface, 1, std::ptr::null_mut()) };
        return Err("IOSurface base address is null".into());
    }

    let total_bytes = bpr * h;
    let mut data = vec![0u8; total_bytes];
    unsafe {
        std::ptr::copy_nonoverlapping(base as *const u8, data.as_mut_ptr(), total_bytes);
    }

    unsafe { IOSurfaceUnlock(surface, 1, std::ptr::null_mut()) };
    Ok(data)
}

// --- CALayer.render (current method) ---

fn layer_render(
    layer: &CALayer,
    width: usize,
    height: usize,
) -> Result<Retained<CGImage>, String> {
    let bytes_per_row = width * 4;
    let mut buffer = vec![0u8; bytes_per_row * height];
    let color_space =
        CGColorSpace::new_device_rgb().ok_or("CGColorSpace::new_device_rgb returned nil")?;
    let bitmap_info =
        CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
    let context = unsafe {
        CGBitmapContextCreate(
            buffer.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            bytes_per_row,
            Some(color_space.as_ref()),
            bitmap_info,
        )
    }
    .ok_or("failed to create CGBitmapContext")?;

    let bounds = layer.bounds();
    let scale_x = if bounds.size.width > 0.0 {
        width as f64 / bounds.size.width
    } else {
        1.0
    };
    let scale_y = if bounds.size.height > 0.0 {
        height as f64 / bounds.size.height
    } else {
        1.0
    };

    CGContext::translate_ctm(Some(context.as_ref()), 0.0, height as f64);
    CGContext::scale_ctm(Some(context.as_ref()), scale_x, -scale_y);

    let _: () = unsafe { msg_send![layer, renderInContext: &*context] };

    CGBitmapContextCreateImage(Some(&context))
        .ok_or_else(|| "CGBitmapContextCreateImage returned nil".to_string())
        .map(|img| img.into())
}

// --- PNG saving ---

fn save_cgimage_to_png(image: &CGImage, path: &str) -> Result<(), String> {
    let rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), image);
    let data = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }
    .ok_or("failed to create PNG data")?;

    // NSData length + bytes
    let len: usize = unsafe { msg_send![&*data, length] };
    let ptr: *const u8 = unsafe { msg_send![&*data, bytes] };
    if ptr.is_null() || len == 0 {
        return Err("PNG data is empty".into());
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::fs::write(path, slice).map_err(|e| format!("failed to write PNG: {e}"))
}

fn save_raw_to_png(
    data: &[u8],
    width: usize,
    height: usize,
    bytes_per_row: usize,
    path: &str,
) -> Result<(), String> {
    let color_space =
        CGColorSpace::new_device_rgb().ok_or("CGColorSpace::new_device_rgb returned nil")?;
    let bitmap_info =
        CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;

    let mut pixels = data.to_vec();
    let context = unsafe {
        CGBitmapContextCreate(
            pixels.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            bytes_per_row,
            Some(color_space.as_ref()),
            bitmap_info,
        )
    }
    .ok_or("failed to create bitmap context for PNG")?;

    let image = CGBitmapContextCreateImage(Some(&context))
        .ok_or("CGBitmapContextCreateImage returned nil")?;

    save_cgimage_to_png(&image, path)
}

// --- Helpers ---

fn inject_frame(web_view: &WKWebView, t: f64) -> Result<(), String> {
    let progress = t / 20.0 * 100.0;
    eval(
        web_view,
        &format!(
            "window.__onFrame && window.__onFrame({{time:{t:.3}, progress:{progress:.1}, cue:2, subtitle:'', segment:0, totalSegments:1, segmentTitles:['showcase'], segmentDurations:[20]}})"
        ),
    )
}

fn wait_for_load(web_view: &WKWebView, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        let loading = unsafe { web_view.isLoading() };
        let progress = unsafe { web_view.estimatedProgress() };
        if !loading && progress >= 1.0 {
            pump(Duration::from_millis(500));
            return Ok(());
        }
        pump(Duration::from_millis(50));
    }
    Err("timed out waiting for page load".into())
}

fn eval(web_view: &WKWebView, script: &str) -> Result<(), String> {
    use std::cell::RefCell;
    use std::rc::Rc;

    use objc2::rc::autoreleasepool;
    use objc2_foundation::NSError;

    let slot: Rc<RefCell<Option<Result<(), String>>>> = Rc::new(RefCell::new(None));
    let slot_clone = slot.clone();
    let block = block2::RcBlock::new(move |_value: *mut AnyObject, error: *mut NSError| {
        autoreleasepool(|_| {
            let result = if let Some(error) = unsafe { error.as_ref() } {
                Err(format!("JS error: {}", error.localizedDescription()))
            } else {
                Ok(())
            };
            *slot_clone.borrow_mut() = Some(result);
        });
    });
    unsafe {
        web_view.evaluateJavaScript_completionHandler(&NSString::from_str(script), Some(&block));
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err("eval timeout".into());
        }
        pump(Duration::from_millis(5));
    }
    let result = slot.borrow_mut().take().unwrap_or(Ok(()));
    result
}

fn pump(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &date);
}

fn average_duration(durations: &[Duration]) -> Duration {
    if durations.is_empty() {
        return Duration::ZERO;
    }
    let total: Duration = durations.iter().sum();
    total / durations.len() as u32
}
