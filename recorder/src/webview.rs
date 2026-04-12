//! `WKWebView` hosting and frame-capture helpers for the recorder.

use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::{Retained, autoreleasepool};
use objc2::runtime::AnyObject;
use objc2::{MainThreadMarker, MainThreadOnly, msg_send};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSFloatingWindowLevel,
    NSImage, NSWindow, NSWindowStyleMask,
};
use objc2_core_graphics::CGImage;
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSError, NSPoint, NSRect, NSRunLoop, NSSize, NSString, NSURL,
    NSURLRequest,
};
use objc2_web_kit::{
    WKAudiovisualMediaTypes, WKSnapshotConfiguration, WKWebView, WKWebViewConfiguration,
    WKWebsiteDataStore,
};

use crate::capture;
use crate::progress::{PROGRESS_CANDIDATE_SELECTORS, ProgressRect};

/// Default recorder viewport width in CSS pixels.
#[allow(dead_code)]
pub(crate) const VIEW_WIDTH: f64 = 1920.0;
/// Default recorder viewport height in CSS pixels.
#[allow(dead_code)]
pub(crate) const VIEW_HEIGHT: f64 = 1080.0;
const OFFSCREEN_ORIGIN_X: f64 = -10000.0;
const OFFSCREEN_ORIGIN_Y: f64 = -10000.0;
type SnapshotResultSlot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
type EvalResultSlot = Rc<RefCell<Option<Result<Option<String>, String>>>>;

/// Hosts a single `WKWebView` inside an offscreen-capable `NSWindow`.
pub struct WebViewHost {
    _app: Retained<NSApplication>,
    window: Retained<NSWindow>,
    web_view: Retained<WKWebView>,
    headed: bool,
    dpr: f64,
    view_width: f64,
    view_height: f64,
    target_size: NSSize,
    offscreen_parked: Cell<bool>,
}

/// Owns multiple `WebViewHost` instances for parallel experiments and benchmarks.
#[allow(dead_code)]
pub(crate) struct ParallelHost {
    hosts: Vec<WebViewHost>,
}

impl WebViewHost {
    /// Creates a recorder window and `WKWebView` sized for the requested DPR.
    pub fn new(
        mtm: MainThreadMarker,
        headed: bool,
        dpr: f64,
        view_width: f64,
        view_height: f64,
    ) -> Result<Self, String> {
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(if headed {
            NSApplicationActivationPolicy::Accessory
        } else {
            NSApplicationActivationPolicy::Prohibited
        });
        app.finishLaunching();

        let initial_origin = if headed {
            NSPoint::new(100.0, 100.0)
        } else {
            offscreen_origin(0)
        };
        let initial_rect = NSRect::new(initial_origin, NSSize::new(view_width, view_height));
        let window: Retained<NSWindow> = unsafe {
            msg_send![
                NSWindow::alloc(mtm),
                initWithContentRect: initial_rect,
                styleMask: NSWindowStyleMask::Borderless,
                backing: NSBackingStoreType::Buffered,
                defer: false
            ]
        };
        window.setTitle(&NSString::from_str("recorder"));
        window.setFrame_display(initial_rect, true);
        unsafe {
            let _: () = msg_send![&window, setIgnoresMouseEvents: true];
        }
        if headed {
            window.setLevel(NSFloatingWindowLevel);
            window.orderFrontRegardless();
            pump_main_run_loop(Duration::from_millis(150));
        } else {
            unsafe {
                let _: () = msg_send![&window, setAlphaValue: 0.0f64];
                let _: () = msg_send![&window, setOpaque: false];
                let _: () = msg_send![&window, setHasShadow: false];
            }
        }

        // CSS viewport uses the configured size regardless of DPR/screen scale.
        // DPR only affects output resolution via takeSnapshot configuration.
        let target_size = NSSize::new(view_width, view_height);
        window.setContentSize(target_size);
        window.setFrameOrigin(if headed {
            let frame = window.frame();
            NSPoint::new(frame.origin.x.max(100.0), frame.origin.y.max(100.0))
        } else {
            initial_origin
        });
        let web_view = Self::create_web_view(target_size)?;
        window.setContentView(Some(&web_view));

        let host = Self {
            _app: app,
            window,
            web_view,
            headed,
            dpr,
            view_width,
            view_height,
            target_size,
            offscreen_parked: Cell::new(!headed),
        };
        host.sync_view_hierarchy();
        Ok(host)
    }

    /// Returns the current capture size in backing pixels.
    pub fn target_pixel_size(&self) -> (usize, usize) {
        let backing = self.window.convertRectToBacking(self.web_view.bounds());
        (
            backing.size.width.round().max(1.0) as usize,
            backing.size.height.round().max(1.0) as usize,
        )
    }

    /// Moves the host window to the requested screen position.
    #[allow(dead_code)]
    pub(crate) fn set_window_origin(&self, x: f64, y: f64) {
        self.window.setFrameOrigin(NSPoint::new(x, y));
        self.sync_view_hierarchy();
    }

    /// Updates the host window title.
    #[allow(dead_code)]
    pub(crate) fn set_window_title(&self, title: &str) {
        self.window.setTitle(&NSString::from_str(title));
    }

    /// Recreates the underlying `WKWebView` and window.
    pub fn reset_webview(&mut self) -> Result<(), String> {
        let mtm = MainThreadMarker::new().ok_or("WKWebView reset must run on the main thread")?;
        self.window.orderOut(None);
        self.window.close();
        *self = Self::new(
            mtm,
            self.headed,
            self.dpr,
            self.view_width,
            self.view_height,
        )?;
        Ok(())
    }

    /// Loads an HTTP URL into the hosted `WKWebView`.
    pub fn load_url(&self, url: &str) -> Result<(), String> {
        let url = NSURL::URLWithString(&NSString::from_str(url))
            .ok_or_else(|| format!("failed to construct NSURL from {url:?}"))?;
        let request = NSURLRequest::requestWithURL(&url);
        let navigation = unsafe { self.web_view.loadRequest(&request) };
        if navigation.is_none() {
            return Err(format!(
                "WKWebView refused loadRequest for {}",
                url.absoluteString()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "<invalid-url>".into())
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Loads a local file URL with the supplied read-access root.
    pub fn load_file_url(&self, file_path: &Path, read_access_root: &Path) -> Result<(), String> {
        let file_url = NSURL::fileURLWithPath(&NSString::from_str(&file_path.to_string_lossy()));
        let read_access_url =
            NSURL::fileURLWithPath(&NSString::from_str(&read_access_root.to_string_lossy()));
        let navigation = unsafe {
            self.web_view
                .loadFileURL_allowingReadAccessToURL(&file_url, &read_access_url)
        };
        if navigation.is_none() {
            return Err(format!(
                "WKWebView refused loadFileURL for {} with read access {}",
                file_path.display(),
                read_access_root.display()
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Waits until the page has reached a stable ready state for capture.
    pub fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let started = Instant::now();
        let mut last_ready_state = None;
        let mut last_progress = 0.0;
        let mut last_loading = true;
        let mut last_url = None;
        let mut saw_navigation = false;
        while started.elapsed() < timeout {
            self.sync_view_hierarchy();
            last_loading = unsafe { self.web_view.isLoading() };
            last_progress = unsafe { self.web_view.estimatedProgress() };
            last_url = self.current_url();
            saw_navigation |= last_loading
                || last_progress > 0.0
                || last_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty() && url != "about:blank");
            last_ready_state = self
                .eval_string("document.readyState ? String(document.readyState) : null")
                .ok()
                .flatten();

            if !last_loading
                && last_progress >= 1.0
                && matches!(last_ready_state.as_deref(), Some("complete"))
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if saw_navigation
                && !last_loading
                && matches!(last_ready_state.as_deref(), Some("complete"))
                && started.elapsed() >= Duration::from_secs(1)
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if !last_loading
                && last_progress == 0.0
                && last_url.is_none()
                && last_ready_state.is_none()
                && started.elapsed() >= Duration::from_millis(1500)
            {
                self.flush_render(Duration::from_millis(1500))?;
                let _ = self.wait_for_animation_frame(Duration::from_millis(500));
                self.park_offscreen();
                return Ok(());
            }
            pump_main_run_loop(Duration::from_millis(25));
        }
        Err(format!(
            "timed out waiting for page load (readyState={last_ready_state:?}, estimatedProgress={last_progress:.3}, isLoading={last_loading}, url={last_url:?})"
        ))
    }

    /// Applies recorder-specific DOM adjustments before capture begins.
    pub fn prepare_page(&self) -> Result<(), String> {
        let script = r#"
        (() => {
          document.documentElement.style.overflow = 'hidden';
          if (document.body) {
            document.body.style.overflow = 'hidden';
            document.body.style.margin = '0';
          }
          const help = document.querySelector('.help');
          if (help) help.style.display = 'none';
          document.querySelectorAll('audio, video').forEach(el => {
            try { el.pause(); el.currentTime = 0; el.muted = true; } catch (_) {}
          });
          return 'ok';
        })()
        "#;
        let started = Instant::now();
        let mut last_error = None;
        while started.elapsed() < Duration::from_secs(5) {
            match self.eval_ignoring_result(script) {
                Ok(()) => {
                    let on_frame_check = self.eval_string(
                        r#"
                        (() => {
                          return typeof window.__onFrame === 'function' ? 'ok' : 'missing';
                        })()
                        "#,
                    )?;
                    if on_frame_check.as_deref() == Some("missing") {
                        eprintln!(
                            "warning: page is missing window.__onFrame after load; \
                             recorder output may stay static until the page defines it"
                        );
                    }
                    return self.flush_render(Duration::from_millis(120));
                }
                Err(error) => {
                    last_error = Some(error);
                    self.flush_render(Duration::from_millis(100))?;
                }
            }
        }
        Err(format!(
            "failed to prepare page after load: {}",
            last_error.unwrap_or_else(|| "unknown JS error".into())
        ))
    }

    /// Sends frame data to the page via `window.__onFrame(data)`.
    ///
    /// The recorder only passes data — all rendering (subtitles, cue animations,
    /// progress bars) is the HTML template's responsibility via its `__onFrame`
    /// implementation.
    #[allow(clippy::too_many_arguments)]
    pub fn inject_state(
        &self,
        cue_index: i32,
        subtitle_text: &str,
        progress_pct: f64,
        segment_index: usize,
        total_segments: usize,
        segment_titles: &[String],
        segment_durations: &[f64],
        video_time_sec: f64,
    ) -> Result<(), String> {
        let subtitle_json = serde_json::to_string(subtitle_text)
            .map_err(|err| format!("failed to encode subtitle text for JS: {err}"))?;
        let titles_json = serde_json::to_string(segment_titles).unwrap_or_else(|_| "[]".to_owned());
        let durations_json =
            serde_json::to_string(segment_durations).unwrap_or_else(|_| "[]".to_owned());
        let script = format!(
            r#"
            (() => {{
              if (typeof window.__onFrame === 'function') {{
                window.__onFrame({{
                  time: {video_time_sec:.6},
                  progress: {progress_pct:.6},
                  cue: {cue_index},
                  subtitle: {subtitle_json},
                  segment: {segment_index},
                  totalSegments: {total_segments},
                  segmentTitles: {titles_json},
                  segmentDurations: {durations_json}
                }});
                return 'ok';
              }}
              return 'no __onFrame';
            }})()
            "#
        );
        let result = self.eval_string(&script)?;
        if result.as_deref() == Some("no __onFrame") {
            return Err(
                "page does not implement window.__onFrame — see recorder README for the template protocol"
                    .into(),
            );
        }
        self.flush_render(Duration::from_millis(1))
    }

    /// Sends multiple frames of data to the page in a single JS evaluation.
    ///
    /// Each tuple contains `(cue_index, subtitle_text, progress_pct, segment_index,
    /// total_segments, segment_titles, segment_durations, video_time_sec)`.
    /// Only the last `__onFrame` call matters visually.
    #[allow(clippy::type_complexity)]
    pub fn inject_states_batch(
        &self,
        frames: &[(i32, &str, f64, usize, usize, &[String], &[f64], f64)],
    ) -> Result<(), String> {
        let mut script = String::with_capacity(frames.len() * 300);
        for (
            cue_index,
            subtitle_text,
            progress_pct,
            segment_index,
            total_segments,
            segment_titles,
            segment_durations,
            video_time_sec,
        ) in frames
        {
            let subtitle_json = serde_json::to_string(subtitle_text)
                .map_err(|err| format!("failed to encode subtitle text for JS: {err}"))?;
            let titles_json =
                serde_json::to_string(segment_titles).unwrap_or_else(|_| "[]".to_owned());
            let durations_json =
                serde_json::to_string(segment_durations).unwrap_or_else(|_| "[]".to_owned());
            script.push_str(&format!(
                "window.__onFrame && window.__onFrame({{time:{video_time_sec:.6},progress:{progress_pct:.6},cue:{cue_index},subtitle:{subtitle_json},segment:{segment_index},totalSegments:{total_segments},segmentTitles:{titles_json},segmentDurations:{durations_json}}});\n"
            ));
        }
        self.eval_ignoring_result(&script)?;
        self.flush_render(Duration::from_millis(1))
    }

    /// Pumps layout and the main run loop so WebKit can flush pending updates.
    pub fn flush_render(&self, duration: Duration) -> Result<(), String> {
        self.sync_view_hierarchy();
        pump_main_run_loop(duration);
        Ok(())
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
        unreachable!()
    }

    /// Captures a `CGImage` by rendering the `WKWebView` layer tree into a bitmap context.
    pub fn snapshot_via_layer(&self) -> Result<Retained<CGImage>, String> {
        self.sync_view_hierarchy();
        let layer = self.web_view.layer().ok_or("WKWebView has no layer")?;
        let (width, height) = self.target_pixel_size();
        capture::layer_render_cgimage(&layer, width, height)
    }

    fn create_web_view(target_size: NSSize) -> Result<Retained<WKWebView>, String> {
        let mtm = MainThreadMarker::new().ok_or("snapshot capture must run on the main thread")?;
        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
        unsafe {
            config.setWebsiteDataStore(&store);
            config.setMediaTypesRequiringUserActionForPlayback(WKAudiovisualMediaTypes::All);
        }
        let web_view = unsafe {
            WKWebView::initWithFrame_configuration(
                WKWebView::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), target_size),
                &config,
            )
        };
        web_view.setWantsLayer(true);
        unsafe {
            let _: () = msg_send![&web_view, _setPageMuted: 0x3u64];
        }
        Ok(web_view)
    }

    fn sync_view_hierarchy(&self) {
        // Keep the view sized and laid out before any capture attempt.
        self.web_view
            .setFrame(NSRect::new(NSPoint::new(0.0, 0.0), self.target_size));
        self.web_view.layoutSubtreeIfNeeded();
        self.web_view.displayIfNeeded();
        self.window.displayIfNeeded();
    }

    fn park_offscreen(&self) {
        if self.offscreen_parked.replace(true) {
            return;
        }
        self.window
            .setFrameOrigin(NSPoint::new(OFFSCREEN_ORIGIN_X, OFFSCREEN_ORIGIN_Y));
        self.window.displayIfNeeded();
        self.web_view.displayIfNeeded();
    }

    fn wait_for_animation_frame(&self, _timeout: Duration) -> Result<(), String> {
        // A short compositor settle time is more reliable here than polling rAF.
        std::thread::sleep(Duration::from_millis(200));
        self.sync_view_hierarchy();
        self.flush_render(Duration::from_millis(100))?;
        Ok(())
    }

    fn take_snapshot_image(&self) -> Result<Retained<NSImage>, String> {
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

    fn current_url(&self) -> Option<String> {
        unsafe { self.web_view.URL() }
            .and_then(|url| url.absoluteString().map(|value| value.to_string()))
    }

    /// Queries the pixel-space rect of the slide progress slot and hides the DOM bar so the
    /// recorder can paint it directly into the output frames.
    pub fn query_progress_rect(&self, dpr: f64) -> Option<ProgressRect> {
        self.query_element_rect(PROGRESS_CANDIDATE_SELECTORS, dpr, true)
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

    fn eval_ignoring_result(&self, script: &str) -> Result<(), String> {
        self.eval_string(script).map(|_| ())
    }

    fn eval_string(&self, script: &str) -> Result<Option<String>, String> {
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

#[allow(dead_code)]
impl ParallelHost {
    /// Creates a set of hosts with staggered window placement.
    pub(crate) fn new(count: usize, headed: bool, dpr: f64) -> Result<Self, String> {
        Self::with_size(count, headed, dpr, VIEW_WIDTH, VIEW_HEIGHT)
    }

    /// Creates a set of hosts with custom viewport size.
    pub(crate) fn with_size(
        count: usize,
        headed: bool,
        dpr: f64,
        view_width: f64,
        view_height: f64,
    ) -> Result<Self, String> {
        if count == 0 {
            return Err("parallel host count must be greater than 0".into());
        }

        let mtm = MainThreadMarker::new().ok_or("recorder must start on the main thread")?;
        let mut hosts = Vec::with_capacity(count);
        for index in 0..count {
            let host = WebViewHost::new(mtm, headed, dpr, view_width, view_height)?;
            host.set_window_title(&format!("recorder-{}", index + 1));
            // Keep hidden hosts offscreen while still varying their coordinates so the
            // compositor does not treat every surface as an identical layer.
            let origin = if headed {
                NSPoint::new(100.0 + index as f64 * 48.0, 100.0 + index as f64 * 36.0)
            } else {
                offscreen_origin(index)
            };
            host.set_window_origin(origin.x, origin.y);
            hosts.push(host);
        }
        Ok(Self { hosts })
    }

    /// Returns the number of managed hosts.
    pub(crate) fn len(&self) -> usize {
        self.hosts.len()
    }

    /// Reports whether there are no managed hosts.
    pub(crate) fn is_empty(&self) -> bool {
        self.hosts.is_empty()
    }

    /// Returns a host by index.
    pub(crate) fn host(&self, index: usize) -> Option<&WebViewHost> {
        self.hosts.get(index)
    }

    /// Returns all managed hosts.
    pub(crate) fn hosts(&self) -> &[WebViewHost] {
        &self.hosts
    }
}

fn offscreen_origin(index: usize) -> NSPoint {
    NSPoint::new(
        OFFSCREEN_ORIGIN_X - index as f64 * 64.0,
        OFFSCREEN_ORIGIN_Y - index as f64 * 48.0,
    )
}

/// Converts a file path under the server root into a percent-encoded HTTP URL.
pub fn relative_http_url(base_url: &str, root: &Path, file_path: &Path) -> Result<String, String> {
    let relative = file_path.strip_prefix(root).map_err(|_| {
        format!(
            "{} is not under server root {}",
            file_path.display(),
            root.display()
        )
    })?;
    let mut encoded = String::new();
    for (index, component) in relative.components().enumerate() {
        if index > 0 {
            encoded.push('/');
        }
        let text = component.as_os_str().to_string_lossy();
        encode_path_component(&mut encoded, &text);
    }
    Ok(format!("{base_url}/{encoded}"))
}

fn encode_path_component(output: &mut String, text: &str) {
    for byte in text.bytes() {
        let allowed = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if allowed {
            output.push(byte as char);
        } else {
            output.push('%');
            output.push_str(&format!("{byte:02X}"));
        }
    }
}

fn pump_main_run_loop(duration: Duration) {
    let run_loop = NSRunLoop::currentRunLoop();
    let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
    let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &date);
}

fn is_unsupported_js_result(error: &NSError) -> bool {
    error.code() == 5
        || error
            .localizedDescription()
            .to_string()
            .contains("unsupported type")
}
