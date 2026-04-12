//! Snapshot, JavaScript evaluation, and progress rect query methods for `WebViewHost`.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::msg_send;
use objc2::rc::{Retained, autoreleasepool};
use objc2::runtime::AnyObject;
use objc2_app_kit::NSImage;
use objc2_core_graphics::CGImage;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::WKSnapshotConfiguration;

use crate::capture;
use crate::progress::{PROGRESS_CANDIDATE_SELECTORS, ProgressRect};

use super::{EvalResultSlot, SnapshotResultSlot, WebViewHost, pump_main_run_loop};

impl WebViewHost {
    /// Captures an `NSImage` using `WKWebView.takeSnapshot` as the fallback path.
    pub fn snapshot_nsimage(&self) -> Result<Retained<NSImage>, String> {
        // Minimal flush — just pump run loop so WebKit can process the JS changes
        pump_main_run_loop(Duration::from_millis(1));
        for attempt in 0..3 {
            match self.take_snapshot_image() {
                Ok(image) => return Ok(image),
                Err(_) if attempt < 2 => {
                    // WebKit may need more time between rapid snapshots
                    pump_main_run_loop(Duration::from_millis(50));
                }
                Err(err) => return Err(err),
            }
        }
        unreachable!()
    }

    /// Captures a `CGImage` by rendering the `WKWebView` layer tree into a bitmap context.
    pub fn snapshot_via_layer(&self) -> Result<Retained<CGImage>, String> {
        self.sync_view_hierarchy();
        let layer = self.web_view.layer().ok_or("WKWebView has no layer")?;
        let (width, height) = self.target_pixel_size();
        capture::layer_render_cgimage(&layer, width, height)
    }

    /// Queries the pixel-space rect of the slide progress slot and hides the DOM bar so the
    /// recorder can paint it directly into the output frames.
    pub fn query_progress_rect(&self, dpr: f64) -> Option<ProgressRect> {
        self.query_element_rect(PROGRESS_CANDIDATE_SELECTORS, dpr, true)
    }

    pub(super) fn take_snapshot_image(&self) -> Result<Retained<NSImage>, String> {
        let mtm = MainThreadMarker::new().ok_or("snapshot capture must run on the main thread")?;
        let config = unsafe { WKSnapshotConfiguration::new(mtm) };
        let slot: SnapshotResultSlot = Rc::new(RefCell::new(None));
        let slot_clone = slot.clone();
        let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            autoreleasepool(|_| {
                let result = if let Some(error) = unsafe { error.as_ref() } {
                    Err(format!(
                        "{} (domain={}, code={})",
                        error.localizedDescription(),
                        error.domain(),
                        error.code()
                    ))
                } else if let Some(image) = unsafe { Retained::retain(image) } {
                    Ok(image)
                } else {
                    Err("WKWebView.takeSnapshot returned nil without an error".into())
                };
                *slot_clone.borrow_mut() = Some(result);
            });
        });

        unsafe {
            self.web_view
                .takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
        }

        let started = Instant::now();
        while slot.borrow().is_none() {
            if started.elapsed() > Duration::from_secs(10) {
                return Err("timed out waiting for WKWebView.takeSnapshot".into());
            }
            pump_main_run_loop(Duration::from_millis(10));
        }
        slot.borrow_mut()
            .take()
            .ok_or_else(|| "snapshot completion did not return an image".to_string())?
    }

    fn query_element_rect(&self, selectors: &[&str], dpr: f64, hide: bool) -> Option<ProgressRect> {
        let selectors_json = serde_json::to_string(selectors).ok()?;
        let visibility = if hide {
            "el.style.setProperty('visibility', 'hidden', 'important');"
        } else {
            ""
        };
        let script = format!(
            r#"(() => {{
                var selectors = {selectors_json};
                function findIn(root, selector) {{
                    if (!root || typeof root.querySelector !== 'function') return null;
                    var match = root.querySelector(selector);
                    if (match) return match;
                    if (typeof root.querySelectorAll !== 'function') return null;
                    var all = root.querySelectorAll('*');
                    for (var j = 0; j < all.length; j++) {{
                        var node = all[j];
                        if (node && node.shadowRoot) {{
                            var shadowMatch = findIn(node.shadowRoot, selector);
                            if (shadowMatch) return shadowMatch;
                        }}
                    }}
                    return null;
                }}
                var el = null;
                for (var i = 0; i < selectors.length; i++) {{
                    el = findIn(document, selectors[i]);
                    if (el) break;
                }}
                if (!el) return null;
                var r = el.getBoundingClientRect();
                {visibility}
                return JSON.stringify({{x: r.x, y: r.y, w: r.width, h: r.height}});
            }})()"#
        );
        let result = self.eval_string(&script).ok()??;
        let v: serde_json::Value = serde_json::from_str(&result).ok()?;
        let x = (v["x"].as_f64()? * dpr) as usize;
        let y = (v["y"].as_f64()? * dpr) as usize;
        let w = (v["w"].as_f64()? * dpr) as usize;
        let h = (v["h"].as_f64()? * dpr) as usize;
        if w > 0 && h > 0 {
            Some(ProgressRect::new(x, y, w, h))
        } else {
            None
        }
    }

    pub(super) fn eval_ignoring_result(&self, script: &str) -> Result<(), String> {
        self.eval_string(script).map(|_| ())
    }

    pub(super) fn eval_string(&self, script: &str) -> Result<Option<String>, String> {
        let slot: EvalResultSlot = Rc::new(RefCell::new(None));
        let slot_clone = slot.clone();
        let block = RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
            autoreleasepool(|_| {
                let result = if let Some(error) = unsafe { error.as_ref() } {
                    if is_unsupported_js_result(error) {
                        Ok(None)
                    } else {
                        Err(format!(
                            "{} (domain={}, code={})",
                            error.localizedDescription(),
                            error.domain(),
                            error.code()
                        ))
                    }
                } else if value.is_null() {
                    Ok(None)
                } else {
                    let description: Retained<NSString> = unsafe { msg_send![value, description] };
                    Ok(Some(description.to_string()))
                };
                *slot_clone.borrow_mut() = Some(result);
            });
        });

        unsafe {
            self.web_view
                .evaluateJavaScript_completionHandler(&NSString::from_str(script), Some(&block));
        }

        let started = Instant::now();
        while slot.borrow().is_none() {
            if started.elapsed() > Duration::from_secs(10) {
                return Err("timed out waiting for evaluateJavaScript".into());
            }
            pump_main_run_loop(Duration::from_millis(10));
        }
        slot.borrow_mut()
            .take()
            .ok_or_else(|| "evaluateJavaScript completed without result".to_string())?
    }
}

fn is_unsupported_js_result(error: &NSError) -> bool {
    error.code() == 5
        || error
            .localizedDescription()
            .to_string()
            .contains("unsupported type")
}
