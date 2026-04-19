//! Preview panel · T-06
//!
//! Hosts a [`WKWebView`] inside a black letterboxed container and feeds it
//! in-memory HTML assembled by [`crate::html_template::assemble_html`]. The
//! webview is sized so its aspect ratio matches `source.viewport.ratio`
//! (contained inside the container rectangle; always letterbox, never crop).
//!
//! ## Architecture (ADR-057)
//!
//! The shell does **not** load any pre-compiled HTML artifact from disk.
//! `html_template` builds the full document string in process and this
//! module calls `loadHTMLString:baseURL:` with that string. The `baseURL`
//! points at the source.json's directory so relative `file://` asset URLs
//! resolve the way they do for the v1.8 bundler pipeline (FM-PATH in
//! `spec/mistakes.json`).
//!
//! ## Clippy baseline
//!
//! Workspace lints deny `unwrap_used` / `expect_used` / `panic`, so every
//! failure path here returns a [`PreviewError`] variant. Errors are
//! hand-written (no `thiserror`) to match the rest of the crate.
//!
//! ## Threading
//!
//! `WKWebView` is `MainThreadOnly`; callers must pass a
//! [`MainThreadMarker`] acquired on the AppKit main thread.
//!
//! ## FM-ASYNC
//!
//! Future HUD / playhead sync tasks (T-09 / T-10) must use
//! `callAsyncJavaScript` when calling into JS. **v1.19 T-06 itself only
//! loads HTML** — no JS bridge, no `evaluateJavaScript`. We still expose
//! [`PreviewPanel::webview`] so those later tasks can attach handlers
//! without routing everything through this module.
//!
//! ## Letterbox math
//!
//! Given a container rectangle and a `ratio` string like `"16:9"`:
//!
//! ```text
//! scale = min(container.w / rw, container.h / rh)
//! webview.w = rw * scale
//! webview.h = rh * scale
//! webview.origin = center inside container
//! ```
//!
//! A zero / negative container dimension collapses to a zero-sized webview
//! (we still keep the webview alive so future resizes can reflate it).

use std::error::Error;
use std::fmt;
use std::path::Path;

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::ClassType;
use objc2_app_kit::{NSAutoresizingMaskOptions, NSBorderType, NSBox, NSBoxType, NSColor, NSTitlePosition, NSView};
use objc2_foundation::{MainThreadMarker, NSNumber, NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_web_kit::{WKPreferences, WKWebView, WKWebViewConfiguration};

use crate::html_template::{assemble_html, AssembleError};
use crate::source::Source;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Everything [`PreviewPanel::new`] / [`PreviewPanel::load`] can return.
///
/// Hand-written to avoid pulling `thiserror` into the shell crate; the
/// sibling `source.rs` / `html_template.rs` take the same approach.
#[derive(Debug)]
pub enum PreviewError {
    /// HTML assembly failed (unknown track kind / serialize error).
    Assemble(AssembleError),
    /// `loadHTMLString:baseURL:` returned nil — extremely rare, signals that
    /// WebKit refused the load (e.g. sandbox restriction on a unit test
    /// harness). Retained so callers can log / retry.
    LoadReturnedNil,
}

impl fmt::Display for PreviewError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Assemble(e) => {
                write!(f, "nf-shell-mac: preview assemble error: {e}")
            }
            Self::LoadReturnedNil => f.write_str(
                "nf-shell-mac: WKWebView.loadHTMLString:baseURL: returned nil (WebKit refused the load)",
            ),
        }
    }
}

impl Error for PreviewError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Assemble(e) => Some(e),
            Self::LoadReturnedNil => None,
        }
    }
}

impl From<AssembleError> for PreviewError {
    fn from(e: AssembleError) -> Self {
        Self::Assemble(e)
    }
}

// ---------------------------------------------------------------------------
// PreviewPanel
// ---------------------------------------------------------------------------

/// Owning handle for the preview NSView hierarchy.
///
/// * `container` — black-filled `NSView` sized to the `frame` the caller
///   supplies; added as a subview to the window's content view by T-11.
/// * `webview`   — child `WKWebView` positioned so its aspect ratio matches
///   `source.viewport.ratio`, centred inside `container` (letterbox).
///
/// Both views are `Retained<_>` so they outlive the caller's current stack
/// frame; dropping [`PreviewPanel`] releases them, which detaches the
/// webview from AppKit and terminates its web process.
pub struct PreviewPanel {
    container: Retained<NSView>,
    webview: Retained<WKWebView>,
}

impl PreviewPanel {
    /// Build a preview panel positioned inside `frame` (in the caller's
    /// coordinate space) and immediately load `source` into the webview.
    ///
    /// `source_dir` is the directory of the source.json file. Assets inside
    /// the source are already absolute `file://` URLs (FM-PATH); we still
    /// pass this directory as the `baseURL` so any relative fragment in the
    /// assembled HTML resolves under it, and so WebKit grants read access to
    /// that location (`allowFileAccessFromFileURLs` / `allowUniversalAccess…`
    /// set below via KVC).
    pub fn new(
        frame: NSRect,
        source: &Source,
        source_dir: &Path,
        mtm: MainThreadMarker,
    ) -> Result<Self, PreviewError> {
        // --- Container -----------------------------------------------------
        //
        // Plain NSView framed at `frame`. The black letterbox fill is a
        // child NSBox painted with `NSBoxCustom` + black fill, sized to
        // track the container via auto-resizing masks. We use NSBox rather
        // than a CALayer background because `NSView::layer()` requires
        // feature `NSView`-deep extras not pulled in by objc2-app-kit 0.2's
        // default surface — the topbar (T-05) uses the same NSBox idiom.
        //
        // Auto-resizing lets the container track its superview if the host
        // window gets resized before T-11 wires up an explicit layout pass.
        let container = unsafe {
            let alloc = mtm.alloc::<NSView>();
            let view = NSView::initWithFrame(alloc, frame);
            view.setAutoresizingMask(
                NSAutoresizingMaskOptions::NSViewWidthSizable
                    | NSAutoresizingMaskOptions::NSViewHeightSizable,
            );
            let backdrop = make_black_backdrop(mtm, frame.size);
            view.addSubview(backdrop.as_super());
            view
        };

        // --- Configuration --------------------------------------------------
        //
        // `preferences.setValue:forKey:` is the AppKit-blessed escape hatch
        // for a pair of WebKit flags that aren't exposed on the typed
        // `WKPreferences` API:
        //   - `allowFileAccessFromFileURLs` — grants `file://` pages access
        //     to other `file://` resources, which is how demo asset clips
        //     resolve.
        //   - `allowUniversalAccessFromFileURLs` — same idea, widened to
        //     cross-origin. Needed because runtime.js may fetch a `file://`
        //     asset from an `about:blank` document when `baseURL` is nil.
        //
        // Both keys are listed in Apple's WebKit OSS headers; `setValue:` on
        // NSObject silently ignores unknown keys, so the call is safe even
        // on macOS versions that drop support.
        let configuration = unsafe {
            let cfg = WKWebViewConfiguration::new();
            let prefs: Retained<WKPreferences> = cfg.preferences();
            // Cast &WKPreferences to &AnyObject so the KVC helper can dispatch
            // setValue:forKey: via msg_send! without requiring the trait to
            // be implemented on the concrete class.
            let prefs_any: &AnyObject = &*prefs as &WKPreferences as &AnyObject;
            kvc_set_bool(prefs_any, "allowFileAccessFromFileURLs", true);
            kvc_set_bool(prefs_any, "allowUniversalAccessFromFileURLs", true);
            cfg
        };

        // --- WKWebView ------------------------------------------------------
        //
        // Build the webview with an initial zero-sized frame — `load_into`
        // recomputes the letterbox frame below based on the viewport ratio.
        // Adding it as a subview now means the first draw after
        // `loadHTMLString` lands inside the hierarchy and doesn't flicker.
        let webview = unsafe {
            let alloc = mtm.alloc::<WKWebView>();
            let wv = WKWebView::initWithFrame_configuration(alloc, NSRect::ZERO, &configuration);
            container.addSubview(&wv);
            wv
        };

        let panel = Self { container, webview };

        // Position the webview inside the container using the source ratio,
        // then load the HTML. `load_into` takes `&self` so we can reuse it
        // from `resize` without unpacking the struct.
        panel.layout_for(source);
        panel.load_into(source, source_dir)?;

        Ok(panel)
    }

    /// Borrow the container `NSView` so callers can `addSubview:` it into
    /// their own hierarchy.
    pub fn view(&self) -> &NSView {
        &self.container
    }

    /// Borrow the underlying `WKWebView`. Exposed for T-09 (HUD overlay
    /// bridge) and T-10 (playhead sync via `callAsyncJavaScript`).
    pub fn webview(&self) -> &WKWebView {
        &self.webview
    }

    /// Resize the container to `new_frame` and re-letterbox the webview.
    ///
    /// Callers wire this into `windowDidResize:` or a split-pane drag
    /// handler. We don't recompute the aspect ratio from scratch — the
    /// viewport is a property of the source, not the container — so this
    /// method reads its ratio from the last-computed webview frame via
    /// dividing width/height. Zero-sized webview falls back to 16:9.
    pub fn resize(&self, new_frame: NSRect) {
        unsafe {
            self.container.setFrame(new_frame);
        }
        let ratio = infer_ratio_from_webview(&self.webview);
        let contained = compute_contained_frame(new_frame.size.width, new_frame.size.height, ratio);
        unsafe {
            self.webview.setFrame(contained);
        }
    }

    // -- private helpers ----------------------------------------------------

    /// Assemble HTML from `source` and feed it to the webview.
    fn load_into(&self, source: &Source, source_dir: &Path) -> Result<(), PreviewError> {
        let html = assemble_html(source)?;
        let ns_html = NSString::from_str(&html);
        // NSURL fileURLWithPath expects an absolute path; if `source_dir` is
        // empty (e.g. tests pass `Path::new("")`) we fall back to `/` so
        // the baseURL is still a valid file URL.
        let path_str = source_dir.to_string_lossy();
        let safe_path: &str = if path_str.is_empty() { "/" } else { &path_str };
        let ns_path = NSString::from_str(safe_path);
        let base_url: Retained<NSURL> = unsafe {
            NSURL::fileURLWithPath_isDirectory(&ns_path, true)
        };
        let nav = unsafe {
            self.webview
                .loadHTMLString_baseURL(&ns_html, Some(&base_url))
        };
        // `loadHTMLString:` returns a WKNavigation handle; nil means WebKit
        // refused the load (sandbox denied / config invalid). We don't keep
        // the navigation object — the navigationDelegate (T-09/T-11) will
        // observe completion if needed.
        if nav.is_none() {
            return Err(PreviewError::LoadReturnedNil);
        }
        Ok(())
    }

    /// Position `self.webview` inside `self.container` using
    /// `source.viewport.ratio`. Called once from `new`; `resize` uses the
    /// cached ratio inferred from the last webview frame so the viewport is
    /// not redundantly re-read.
    fn layout_for(&self, source: &Source) {
        let container_frame = self.container.frame();
        let (rw, rh) = parse_ratio(&source.viewport.ratio);
        let contained =
            compute_contained_frame(container_frame.size.width, container_frame.size.height, (rw, rh));
        unsafe {
            self.webview.setFrame(contained);
        }
    }
}

// ---------------------------------------------------------------------------
// Pure-algorithm helpers (unit-testable)
// ---------------------------------------------------------------------------

/// Split an aspect-ratio string like `"16:9"` into `(rw, rh)` f64 pair.
///
/// * Missing `:`            → fallback `(16.0, 9.0)`.
/// * Non-numeric either side → fallback `(16.0, 9.0)`.
/// * Zero or negative either side → fallback `(16.0, 9.0)` (avoids
///   division-by-zero in [`compute_contained_frame`]).
/// * Surrounding whitespace tolerated.
///
/// The fallback is the 16:9 viewport used by `demo/v1.8-video-sample.json`
/// — picking it keeps the preview correct for the primary demo even if the
/// source.json is malformed.
pub(crate) fn parse_ratio(s: &str) -> (f64, f64) {
    const DEFAULT: (f64, f64) = (16.0, 9.0);
    let trimmed = s.trim();
    let Some((left, right)) = trimmed.split_once(':') else {
        return DEFAULT;
    };
    let rw: f64 = match left.trim().parse() {
        Ok(v) => v,
        Err(_) => return DEFAULT,
    };
    let rh: f64 = match right.trim().parse() {
        Ok(v) => v,
        Err(_) => return DEFAULT,
    };
    if rw <= 0.0 || rh <= 0.0 || !rw.is_finite() || !rh.is_finite() {
        return DEFAULT;
    }
    (rw, rh)
}

/// Compute the contained (letterbox) NSRect for a webview of ratio
/// `(rw, rh)` centred inside a container of size `(container_w, container_h)`.
///
/// The returned rect's `origin` is relative to the container's own coordinate
/// space (origin at the container's lower-left, per AppKit's default
/// non-flipped convention).  Degenerate containers (≤ 0 on either axis)
/// return a zero rect at origin so AppKit still has a valid frame.
pub(crate) fn compute_contained_frame(
    container_w: f64,
    container_h: f64,
    ratio: (f64, f64),
) -> NSRect {
    let (rw, rh) = ratio;
    if container_w <= 0.0 || container_h <= 0.0 || rw <= 0.0 || rh <= 0.0 {
        return NSRect::ZERO;
    }
    let scale_w = container_w / rw;
    let scale_h = container_h / rh;
    let scale = scale_w.min(scale_h);
    let w = rw * scale;
    let h = rh * scale;
    let x = (container_w - w) / 2.0;
    let y = (container_h - h) / 2.0;
    NSRect::new(
        objc2_foundation::NSPoint::new(x, y),
        objc2_foundation::NSSize::new(w, h),
    )
}

/// Read back the aspect ratio the webview is currently sized to. If the
/// webview has not been laid out yet (zero-sized), return the 16:9 default.
fn infer_ratio_from_webview(webview: &WKWebView) -> (f64, f64) {
    let frame = webview.frame();
    if frame.size.width <= 0.0 || frame.size.height <= 0.0 {
        return (16.0, 9.0);
    }
    (frame.size.width, frame.size.height)
}

// ---------------------------------------------------------------------------
// Small NS helpers
// ---------------------------------------------------------------------------

/// Build an NSBox sized `size`, painted pure black, tracking its superview
/// via `NSViewWidthSizable | NSViewHeightSizable`. Used as the backdrop
/// behind the webview so letterbox bars appear black.
///
/// `NSBoxCustom` + `setFillColor` + `NSNoBorder` is the topbar-proven
/// (T-05) recipe for a solid-colour NSView without needing CALayer. We
/// keep a zero `setCornerRadius` so the backdrop stays a perfect rectangle
/// even if AppKit defaults drift between macOS releases.
fn make_black_backdrop(mtm: MainThreadMarker, size: NSSize) -> Retained<NSBox> {
    let frame = NSRect::new(NSPoint::new(0.0, 0.0), size);
    unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(alloc, frame);
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(NSBorderType::NSNoBorder);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        let black: Retained<NSColor> =
            NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 1.0);
        b.setFillColor(&black);
        b.setCornerRadius(0.0);
        b.setAutoresizingMask(
            NSAutoresizingMaskOptions::NSViewWidthSizable
                | NSAutoresizingMaskOptions::NSViewHeightSizable,
        );
        b
    }
}

/// KVC helper: send `[obj setValue:NSNumber(value) forKey:key]` via
/// `msg_send!`. Used for WebKit's undocumented-but-stable preference keys
/// that aren't exposed on the typed `WKPreferences` API.
///
/// `setValue:forKey:` is defined on NSObject; every Objective-C object
/// responds to it, but objc2's `NSObjectNSKeyValueCoding` trait is only
/// implemented for `NSObject` itself — so we go through `msg_send!` and
/// cast the target to `&AnyObject`. Unknown keys are silently ignored by
/// AppKit, which is the fallback behaviour we want if a future macOS
/// renames either WebKit preference.
fn kvc_set_bool(obj: &AnyObject, key: &str, value: bool) {
    unsafe {
        let ns_key = NSString::from_str(key);
        let number: Retained<NSNumber> = NSNumber::numberWithBool(value);
        let () = msg_send![obj, setValue: &*number, forKey: &*ns_key];
    }
}

// ---------------------------------------------------------------------------
// Tests — pure algorithmic, no AppKit main-thread dependency.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]
    #![allow(clippy::panic)]
    use super::*;

    #[test]
    fn parse_ratio_16_9() {
        assert_eq!(parse_ratio("16:9"), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_with_whitespace() {
        assert_eq!(parse_ratio("  16 : 9  "), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_square() {
        assert_eq!(parse_ratio("1:1"), (1.0, 1.0));
    }

    #[test]
    fn parse_ratio_vertical_9_16() {
        assert_eq!(parse_ratio("9:16"), (9.0, 16.0));
    }

    #[test]
    fn parse_ratio_float_values() {
        assert_eq!(parse_ratio("2.35:1"), (2.35, 1.0));
    }

    #[test]
    fn parse_ratio_missing_colon_falls_back() {
        assert_eq!(parse_ratio("16x9"), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_empty_falls_back() {
        assert_eq!(parse_ratio(""), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_garbage_left_falls_back() {
        assert_eq!(parse_ratio("foo:9"), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_garbage_right_falls_back() {
        assert_eq!(parse_ratio("16:bar"), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_zero_left_falls_back() {
        // Guards downstream division-by-zero in compute_contained_frame.
        assert_eq!(parse_ratio("0:9"), (16.0, 9.0));
    }

    #[test]
    fn parse_ratio_negative_falls_back() {
        assert_eq!(parse_ratio("-16:9"), (16.0, 9.0));
    }

    // -- compute_contained_frame --------------------------------------------

    /// Container wider than 16:9 → letterbox left+right pillars.
    #[test]
    fn contained_16_9_in_square_1000x1000() {
        // Container 1000×1000, ratio 16:9.
        // scale = min(1000/16, 1000/9) = min(62.5, 111.11) = 62.5
        // w = 16 * 62.5 = 1000, h = 9 * 62.5 = 562.5
        // x = 0, y = (1000 - 562.5) / 2 = 218.75
        let rect = compute_contained_frame(1000.0, 1000.0, (16.0, 9.0));
        assert!((rect.size.width - 1000.0).abs() < 1e-9);
        assert!((rect.size.height - 562.5).abs() < 1e-9);
        assert!((rect.origin.x - 0.0).abs() < 1e-9);
        assert!((rect.origin.y - 218.75).abs() < 1e-9);
    }

    /// Container matching 16:9 perfectly → webview exactly fills, origin (0,0).
    #[test]
    fn contained_16_9_exact_1600x900() {
        let rect = compute_contained_frame(1600.0, 900.0, (16.0, 9.0));
        assert!((rect.size.width - 1600.0).abs() < 1e-9);
        assert!((rect.size.height - 900.0).abs() < 1e-9);
        assert!(rect.origin.x.abs() < 1e-9);
        assert!(rect.origin.y.abs() < 1e-9);
    }

    /// Container too wide for 16:9 (ultrawide 21:9-ish) → letterbox pillars.
    #[test]
    fn contained_16_9_in_2100x900() {
        // scale = min(2100/16, 900/9) = min(131.25, 100) = 100
        // w = 1600, h = 900; x = 250, y = 0
        let rect = compute_contained_frame(2100.0, 900.0, (16.0, 9.0));
        assert!((rect.size.width - 1600.0).abs() < 1e-9);
        assert!((rect.size.height - 900.0).abs() < 1e-9);
        assert!((rect.origin.x - 250.0).abs() < 1e-9);
        assert!(rect.origin.y.abs() < 1e-9);
    }

    /// Container too tall for 16:9 → letterbox top/bottom bars.
    #[test]
    fn contained_16_9_in_1600x1200() {
        // scale = min(1600/16, 1200/9) = min(100, 133.3) = 100
        // w = 1600, h = 900; x = 0, y = 150
        let rect = compute_contained_frame(1600.0, 1200.0, (16.0, 9.0));
        assert!((rect.size.width - 1600.0).abs() < 1e-9);
        assert!((rect.size.height - 900.0).abs() < 1e-9);
        assert!(rect.origin.x.abs() < 1e-9);
        assert!((rect.origin.y - 150.0).abs() < 1e-9);
    }

    /// Vertical 9:16 inside a 1920x1080 container → narrow band, pillars.
    #[test]
    fn contained_9_16_in_1920x1080() {
        // scale = min(1920/9, 1080/16) = min(213.3, 67.5) = 67.5
        // w = 9 * 67.5 = 607.5, h = 16 * 67.5 = 1080
        // x = (1920 - 607.5) / 2 = 656.25, y = 0
        let rect = compute_contained_frame(1920.0, 1080.0, (9.0, 16.0));
        assert!((rect.size.width - 607.5).abs() < 1e-9);
        assert!((rect.size.height - 1080.0).abs() < 1e-9);
        assert!((rect.origin.x - 656.25).abs() < 1e-9);
        assert!(rect.origin.y.abs() < 1e-9);
    }

    /// Degenerate (zero) container → zero rect without NaN / division issues.
    #[test]
    fn contained_zero_container_yields_zero_rect() {
        let rect = compute_contained_frame(0.0, 900.0, (16.0, 9.0));
        assert!(rect.size.width.abs() < 1e-9);
        assert!(rect.size.height.abs() < 1e-9);
    }

    /// Degenerate ratio → zero rect (defensive; parse_ratio normally guards).
    #[test]
    fn contained_zero_ratio_yields_zero_rect() {
        let rect = compute_contained_frame(1600.0, 900.0, (0.0, 9.0));
        assert!(rect.size.width.abs() < 1e-9);
        assert!(rect.size.height.abs() < 1e-9);
    }

    /// `parse_ratio → compute_contained_frame` end-to-end sanity.
    #[test]
    fn end_to_end_default_fallback_renders() {
        let (rw, rh) = parse_ratio("garbage");
        let rect = compute_contained_frame(1600.0, 900.0, (rw, rh));
        // Should render at 16:9 which matches 1600x900 exactly.
        assert!((rect.size.width - 1600.0).abs() < 1e-9);
        assert!((rect.size.height - 900.0).abs() < 1e-9);
    }

    // -- PreviewError display & source -------------------------------------

    #[test]
    fn preview_error_display_nonempty() {
        let e = PreviewError::LoadReturnedNil;
        assert!(!format!("{e}").is_empty());
    }

    #[test]
    fn preview_error_from_assemble() {
        let ae = AssembleError::UnknownKind("ghost".to_string());
        let pe: PreviewError = ae.into();
        match pe {
            PreviewError::Assemble(_) => {}
            _ => panic!("expected Assemble variant"),
        }
    }
}
