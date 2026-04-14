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
use objc2_foundation::{NSError, NSNumber, NSString};
use objc2_web_kit::WKSnapshotConfiguration;
use crate::capture;
use crate::plan::VideoLayerInfo;
use crate::progress::{PROGRESS_CANDIDATE_SELECTORS, ProgressRect};
use super::frame::{EvalResultSlot, SnapshotResultSlot, pump_main_run_loop};
use super::WebViewHost;

impl WebViewHost {
    /// Queries `window.__hasFrameChanged(prevT, curT)` when available.
    pub fn has_frame_changed(
        &self,
        prev_time_sec: f64,
        current_time_sec: f64,
    ) -> Result<Option<bool>, String> {
        let script = format!(
            r#"
            (() => {{
              if (typeof window.__hasFrameChanged !== 'function') {{
                return 'missing';
              }}
              return window.__hasFrameChanged({prev_time_sec:.6}, {current_time_sec:.6})
                ? 'true'
                : 'false';
            }})()
            "#
        );
        match self.eval_string(&script)?.as_deref() {
            Some("true") => Ok(Some(true)),
            Some("false") => Ok(Some(false)),
            Some("missing") | None => Ok(None),
            Some(other) => Err(format!(
                "unexpected __hasFrameChanged result from page: {other}"
            )),
        }
    }

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
        Err("snapshot_nsimage: exhausted all retry attempts without result".into())
    }

    /// Captures a `CGImage` by rendering the `WKWebView` layer tree into a bitmap context.
    pub fn snapshot_via_layer(&self) -> Result<Retained<CGImage>, String> {
        self.sync_view_hierarchy();
        let layer = self.web_view.layer().ok_or("WKWebView has no layer")?;
        let (width, height) = self.target_pixel_size();
        capture::layer_render_cgimage(&layer, width, height)
    }

    /// Captures at a scaled-down resolution for faster rendering.
    /// The returned CGImage is smaller than the output — caller must upscale.
    pub fn snapshot_via_layer_scaled(
        &self,
        render_scale: f64,
    ) -> Result<Retained<CGImage>, String> {
        if render_scale >= 1.0 {
            return self.snapshot_via_layer();
        }
        self.sync_view_hierarchy();
        let layer = self.web_view.layer().ok_or("WKWebView has no layer")?;
        let (full_w, full_h) = self.target_pixel_size();
        // Round to even numbers (H.264 requirement)
        let scaled_w = ((full_w as f64 * render_scale).round() as usize).max(2) & !1;
        let scaled_h = ((full_h as f64 * render_scale).round() as usize).max(2) & !1;
        capture::layer_render_cgimage(&layer, scaled_w, scaled_h)
    }

    /// Queries the page-declared video duration from the v0.3 engine.
    ///
    /// Checks `window.__duration`, `engine.duration`, and the timeline JSON's
    /// `duration` field. Returns `None` if the page does not expose a duration.
    pub fn query_page_duration(&self) -> Option<f64> {
        let script = r#"
        (() => {
          if (typeof window.__duration === 'number') return String(window.__duration);
          if (typeof engine !== 'undefined' && typeof engine.duration === 'number') return String(engine.duration);
          if (typeof TIMELINE !== 'undefined' && typeof TIMELINE.duration === 'number') return String(TIMELINE.duration);
          return null;
        })()
        "#;
        let result = self.eval_string(script).ok()??;
        result
            .parse::<f64>()
            .ok()
            .filter(|d| *d > 0.0 && d.is_finite())
    }

    /// Queries the page for an audio source URL set by the audioTrack component.
    pub fn query_page_audio_src(&self) -> Option<String> {
        let script = r#"
        (() => {
          const resolve = (src) => {
            if (typeof src !== 'string' || !src) return null;
            try {
              return new URL(src, document.baseURI).href;
            } catch (_) {
              return src;
            }
          };
          if (typeof window.__audioSrc === 'string' && window.__audioSrc) {
            return resolve(window.__audioSrc);
          }
          var audio = document.querySelector('audio');
          if (audio && (audio.currentSrc || audio.src)) {
            return resolve(audio.currentSrc || audio.src);
          }
          return null;
        })()
        "#;
        self.eval_string(script).ok()?.filter(|s| !s.is_empty())
    }

    /// Queries the page timeline for `videoClip` layers so recorder can
    /// composite them after the layer-tree capture pass.
    pub fn query_video_layers(&self) -> Vec<VideoLayerInfo> {
        let script = r#"
        (() => {
          const timeline = typeof TIMELINE === 'object' && TIMELINE ? TIMELINE : null;
          const totalDuration = timeline && typeof timeline.duration === 'number' ? timeline.duration : 0;
          const resolve = (src) => {
            if (typeof src !== 'string' || !src) return null;
            try {
              return new URL(src, document.baseURI).href;
            } catch (_) {
              return src;
            }
          };
          const stringify = (value, fallback) => {
            if (value == null || value === '') return fallback;
            return String(value);
          };
          const layers = timeline && Array.isArray(timeline.layers) ? timeline.layers : [];
          return JSON.stringify(
            layers
              .filter((layer) => layer && layer.scene === 'videoClip' && layer.params && layer.params.src)
              .map((layer) => ({
                src: resolve(layer.params.src) || String(layer.params.src),
                x: stringify(layer.x, '0'),
                y: stringify(layer.y, '0'),
                w: stringify(layer.w, '100%'),
                h: stringify(layer.h, '100%'),
                start: Number.isFinite(layer.start) ? layer.start : 0,
                dur: Number.isFinite(layer.dur) ? layer.dur : totalDuration,
              }))
          );
        })()
        "#;
        self.eval_string(script)
            .ok()
            .flatten()
            .and_then(|result| serde_json::from_str::<Vec<VideoLayerInfo>>(&result).ok())
            .unwrap_or_default()
    }

    /// Queries the pixel-space rect of the slide progress slot and hides the DOM bar.
    pub fn query_progress_rect(&self, dpr: f64) -> Option<ProgressRect> {
        self.query_element_rect(PROGRESS_CANDIDATE_SELECTORS, dpr, true)
    }

    pub(super) fn take_snapshot_image(&self) -> Result<Retained<NSImage>, String> {
        let mtm = MainThreadMarker::new().ok_or("snapshot capture must run on the main thread")?;
        // SAFETY: `mtm` proves this runs on Cocoa's main thread, which `WKSnapshotConfiguration::new` requires.
        let config = unsafe { WKSnapshotConfiguration::new(mtm) }; // SAFETY: see above.
        let backing = self.window.convertRectToBacking(self.web_view.bounds());
        let backing_scale = if self.view_width > 0.0 {
            backing.size.width / self.view_width
        } else {
            1.0
        }
        .max(1.0);
        let snapshot_width = NSNumber::numberWithUnsignedInteger(
            ((self.target_pixel_size().0 as f64) / backing_scale)
                .round()
                .max(1.0) as usize,
        );
        // SAFETY: `config` is live, and WebKit accepts this width setter on the main thread.
        unsafe {
            // SAFETY: see above.
            config.setSnapshotWidth(Some(&snapshot_width));
        }
        let slot: SnapshotResultSlot = Rc::new(RefCell::new(None));
        let slot_clone = slot.clone();
        let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            autoreleasepool(|_| {
                // SAFETY: WebKit passes either null or a valid `NSError *` for the callback duration.
                let result = if let Some(error) = unsafe { error.as_ref() } {
                    // SAFETY: see above.
                    Err(format!(
                        "{} (domain={}, code={})",
                        error.localizedDescription(),
                        error.domain(),
                        error.code()
                    ))
                // SAFETY: WebKit keeps `image` alive for this callback, and `retain` takes ownership.
                } else if let Some(image) = unsafe { Retained::retain(image) } {
                    // SAFETY: see above.
                    Ok(image)
                } else {
                    Err("WKWebView.takeSnapshot returned nil without an error".into())
                };
                *slot_clone.borrow_mut() = Some(result);
            });
        });

        // SAFETY: `self.web_view`, `config`, and `block` are live main-thread Objective-C objects.
        unsafe {
            // SAFETY: see above.
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
                // SAFETY: WebKit passes either null or a valid `NSError *` for the callback duration.
                let result = if let Some(error) = unsafe { error.as_ref() } {
                    // SAFETY: see above.
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
                    // SAFETY: a non-null success value is a live Objective-C object that responds to `description`.
                    let description: Retained<NSString> = unsafe { msg_send![value, description] }; // SAFETY: see above.
                    Ok(Some(description.to_string()))
                };
                *slot_clone.borrow_mut() = Some(result);
            });
        });

        // SAFETY: `self.web_view` is live, and WebKit accepts this script and completion handler on the main thread.
        unsafe {
            // SAFETY: see above.
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
