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

use objc2::rc::Retained;
use objc2::ClassType;
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSBorderType, NSBox, NSBoxType, NSColor, NSFont, NSTextAlignment,
    NSTextField, NSTitlePosition, NSView,
};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_web_kit::{WKWebView, WKWebViewConfiguration};

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

        // --- preview-head (v1.19.2 · diff #9) ------------------------------
        //
        // A 22 px strip along the container's top edge carrying:
        //   * a left crumb  — "{source_dir} / source.json"   (12 px, t65)
        //   * right chips   — ratio · W×H · duration · N tracks  (mono 11 px)
        //
        // AppKit's default coordinate space is non-flipped (y grows
        // upward), so the strip lives at `y = frame.h - PREVIEW_HEAD_HEIGHT`
        // and the WKWebView letterbox operates inside
        // `inner = (0, 0, frame.w, frame.h - PREVIEW_HEAD_HEIGHT)`.
        let preview_head = build_preview_head(mtm, frame.size, source, source_dir);
        unsafe {
            container.addSubview(&preview_head);
        }

        // --- Configuration --------------------------------------------------
        //
        // Default WKWebViewConfiguration is sufficient: `loadHTMLString` with
        // baseURL = `file://source_dir/` makes the WKWebView's loading origin
        // `file://`, and same-origin (file→file) loads are permitted without
        // any extra flags (POC-v1.8-file-url-local-load validated this).
        //
        // NOTE: earlier T-06 tried to KVC-set `allowFileAccessFromFileURLs` +
        // `allowUniversalAccessFromFileURLs` on WKPreferences — see
        // spec/bug/2026-04-19-v1.19-wkpreferences-kvc-crash.md — but modern
        // WKPreferences is NOT KVC-compliant for those UIWebView-era keys and
        // raises NSUndefinedKeyException. They're not needed for the same-
        // origin local-file pipeline we use, so we simply omit them.
        let configuration = unsafe { WKWebViewConfiguration::new() };

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
    ///
    /// Letterbox math is applied against the **inner frame**
    /// (`container - PREVIEW_HEAD_HEIGHT` from the top, v1.19.2) so the
    /// preview-head strip stays visible through every resize.
    pub fn resize(&self, new_frame: NSRect) {
        unsafe {
            self.container.setFrame(new_frame);
        }
        let ratio = infer_ratio_from_webview(&self.webview);
        let (inner_w, inner_h) = inner_size(new_frame.size.width, new_frame.size.height);
        let contained = compute_contained_frame(inner_w, inner_h, ratio);
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
    ///
    /// Letterbox operates on the **inner frame** (container minus the
    /// 22 px preview-head strip along the top, v1.19.2 diff #9).
    fn layout_for(&self, source: &Source) {
        let container_frame = self.container.frame();
        let (rw, rh) = parse_ratio(&source.viewport.ratio);
        let (inner_w, inner_h) =
            inner_size(container_frame.size.width, container_frame.size.height);
        let contained = compute_contained_frame(inner_w, inner_h, (rw, rh));
        unsafe {
            self.webview.setFrame(contained);
        }
    }
}

// ---------------------------------------------------------------------------
// preview-head constants (v1.19.2 · diff #9)
// ---------------------------------------------------------------------------

/// Height (px) of the crumb + chips strip that runs along the top of the
/// preview container.  Matches the `.preview-head` treatment in
/// `spec/versions/v1.19/kickoff/sample-preview.html` (10 px v-padding on
/// each side of a single line of 12 px crumb / 11 px chip text ≈ 22 px).
pub(crate) const PREVIEW_HEAD_HEIGHT: f64 = 22.0;

/// Horizontal padding inside the preview-head strip.
const PREVIEW_HEAD_HPAD: f64 = 14.0;

/// Gap between a chip and its right-hand neighbour (chip-vs-chip spacing).
const PREVIEW_HEAD_CHIP_GAP: f64 = 10.0;

/// Single-chip horizontal padding (matches sample `.ph-chip { padding:3px 8px }`).
const PREVIEW_HEAD_CHIP_PAD: f64 = 8.0;

// ---------------------------------------------------------------------------
// Pure-algorithm helpers (unit-testable)
// ---------------------------------------------------------------------------

/// Compute the inner (WKWebView-eligible) size of a container whose top
/// edge is reserved for the [`PREVIEW_HEAD_HEIGHT`] preview-head strip.
///
/// Returns a zero-size tuple if the container is too short to accommodate
/// the strip at all (the caller's [`compute_contained_frame`] is then
/// required to return `NSRect::ZERO`, which it already does).
pub(crate) fn inner_size(container_w: f64, container_h: f64) -> (f64, f64) {
    if container_w <= 0.0 || container_h <= PREVIEW_HEAD_HEIGHT {
        return (0.0, 0.0);
    }
    (container_w, container_h - PREVIEW_HEAD_HEIGHT)
}

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

// NOTE: kvc_set_bool was removed with the WKPreferences KVC hack. See
// spec/bug/2026-04-19-v1.19-wkpreferences-kvc-crash.md. loadHTMLString
// with a file:// baseURL is sufficient for the same-origin local asset
// load the runtime needs — no extra preference writes required.

// ---------------------------------------------------------------------------
// preview-head build (v1.19.2 · diff #9)
// ---------------------------------------------------------------------------

/// Build the 22 px preview-head strip positioned at the top of the
/// container.  Contents:
///   * left  — a single-line crumb NSTextField `{source_dir} / source.json`
///     (12 px system font, t65 colour).  We don't have the original argv
///     filename at this call site (PreviewPanel::new takes only
///     `source_dir`), so the right-hand segment is a stable literal —
///     future work that threads the source.json filename down can replace
///     it.  The crumb is informative either way (tells the user which
///     directory the source was loaded from).
///   * right — three mono-font chips, right-aligned, pushed against the
///     PREVIEW_HEAD_HPAD from the strip's right edge:
///       1. `{ratio} · {w}×{h}`   (from `source.viewport`)
///       2. `{duration expr}`     (source.duration verbatim — expressions
///          like "demo.end" display as-is, numeric literals survive too)
///       3. `{n} tracks`          (`source.tracks.len()`)
///
/// Frame is positioned with non-flipped AppKit coordinates (y grows up),
/// so the strip sits at `y = container_w.h - PREVIEW_HEAD_HEIGHT` and the
/// WKWebView letterbox lives in the `y: 0..(h - PREVIEW_HEAD_HEIGHT)`
/// region.  Auto-resizing mask pins the strip to the top edge as the
/// container width changes.
fn build_preview_head(
    mtm: MainThreadMarker,
    container_size: NSSize,
    source: &Source,
    source_dir: &Path,
) -> Retained<NSView> {
    let container_w = container_size.width;
    let container_h = container_size.height;
    // AppKit non-flipped coords: y grows up; anchoring to the TOP means
    // origin.y = container.h - PREVIEW_HEAD_HEIGHT (so the strip's own
    // top edge aligns with the container's top).
    let strip_y = (container_h - PREVIEW_HEAD_HEIGHT).max(0.0);
    let strip: Retained<NSView> = unsafe {
        let alloc = mtm.alloc::<NSView>();
        let v = NSView::initWithFrame(
            alloc,
            NSRect::new(
                NSPoint::new(0.0, strip_y),
                NSSize::new(container_w, PREVIEW_HEAD_HEIGHT),
            ),
        );
        // Auto-resize mask:
        //   * WidthSizable  — strip width tracks the container's width
        //   * MinYMargin    — the margin below the strip (distance from
        //     container bottom) is flexible, so the strip stays pinned
        //     to the top as the container grows vertically.
        v.setAutoresizingMask(
            NSAutoresizingMaskOptions::NSViewWidthSizable
                | NSAutoresizingMaskOptions::NSViewMinYMargin,
        );
        v
    };

    // --- crumb (left) ------------------------------------------------------
    //
    // AppKit's default vertical-baseline positioning for a single-line
    // NSTextField centres within the frame when the frame height equals
    // (line height + 2).  A 22 px strip with a 12 px font is comfortable
    // — we size the label to the full strip height and let NSTextField
    // centre vertically on its own.
    let crumb_text = build_crumb_text(source_dir);
    let crumb: Retained<NSTextField> = make_ph_label(
        mtm,
        &crumb_text,
        &ph_color_t65(),
        unsafe { NSFont::systemFontOfSize(12.0) },
        NSTextAlignment::Left,
    );
    unsafe {
        crumb.setFrame(NSRect::new(
            NSPoint::new(PREVIEW_HEAD_HPAD, 0.0),
            NSSize::new(container_w * 0.5, PREVIEW_HEAD_HEIGHT),
        ));
        strip.addSubview(&crumb);
    }

    // --- chips (right) -----------------------------------------------------
    //
    // Laid out right-to-left so the rightmost chip is closest to the
    // container's right edge.  Each chip is an NSBox wrapping a single
    // NSTextField — NSBox gives us rounded-corner + fill treatment
    // matching sample-preview's `.ph-chip { background: rgba(255,255,255,
    // 0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 5 }`.
    let ratio_text = format!(
        "{} · {}×{}",
        source.viewport.ratio.trim(),
        source.viewport.w,
        source.viewport.h
    );
    let duration_text = source.duration.trim().to_string();
    let tracks_text = format!("{} tracks", source.tracks.len());

    // Order matters for the placement loop below which advances
    // `x_right` leftward; rightmost first, leftmost last.  Sample visual
    // order: ratio (neutral) · duration (warm) · tracks (neutral).
    let chip_specs: [(&str, bool); 3] = [
        (&ratio_text, false),
        (&duration_text, true),
        (&tracks_text, false),
    ];

    // We don't know the exact pixel width of each chip until NSTextField
    // sizes itself, so we place chips right-to-left using sizeToFit.
    let mut x_right = container_w - PREVIEW_HEAD_HPAD;
    // Reverse iteration: rightmost first.  The human-natural order of
    // the sample — ratio · duration · tracks — corresponds to leftmost
    // first, so we walk the slice in reverse to put "tracks" against
    // the right edge.
    for &(text, is_warm) in chip_specs.iter().rev() {
        let chip = build_ph_chip(mtm, text, is_warm);
        // sizeToFit on the inner label returns its intrinsic width; chip
        // adds horizontal padding on each side.
        let intrinsic_w = chip_intrinsic_width(text);
        let chip_w = intrinsic_w + 2.0 * PREVIEW_HEAD_CHIP_PAD;
        let chip_h = PREVIEW_HEAD_HEIGHT - 6.0; // leaves 3 px vertical margin top + bottom
        let x = x_right - chip_w;
        let y = (PREVIEW_HEAD_HEIGHT - chip_h) / 2.0;
        unsafe {
            chip.setFrame(NSRect::new(NSPoint::new(x, y), NSSize::new(chip_w, chip_h)));
            strip.addSubview(chip.as_super());
        }
        x_right = x - PREVIEW_HEAD_CHIP_GAP;
    }

    strip
}

/// Build the crumb string from `source_dir`.  We surface the last two
/// path components so the crumb reads like the sample-preview example
/// ("demo / source.json") without needing to thread the argv filename
/// through PreviewPanel::new (which would force a main.rs signature
/// change out of scope for this hotfix).
fn build_crumb_text(source_dir: &Path) -> String {
    let dir_label = source_dir
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty() && s != "." && s != "/")
        .unwrap_or_else(|| "source".to_string());
    format!("{dir_label} / source.json")
}

/// Build a styled NSBox chip with a single NSTextField label inside.
/// Mirrors the sample-preview `.ph-chip` style.  `warm` flips the chip
/// into the orange duration-emphasis variant.
fn build_ph_chip(mtm: MainThreadMarker, text: &str, warm: bool) -> Retained<NSBox> {
    unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(alloc, NSRect::ZERO);
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(NSBorderType::NSLineBorder);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        if warm {
            b.setFillColor(&ph_color_warm_fill());
            b.setBorderColor(&ph_color_warm_border());
        } else {
            b.setFillColor(&ph_color_chip_fill());
            b.setBorderColor(&ph_color_chip_border());
        }
        b.setCornerRadius(5.0);

        let color = if warm {
            ph_color_warm_text()
        } else {
            ph_color_t65()
        };
        let label = make_ph_label(
            mtm,
            text,
            &color,
            NSFont::monospacedSystemFontOfSize_weight(11.0, 0.0),
            NSTextAlignment::Center,
        );
        // Label fills chip content; NSBox's own content inset is ~8 px on
        // each axis so we frame the label absolutely.
        label.setFrame(NSRect::new(
            NSPoint::new(0.0, 0.0),
            NSSize::new(999.0, PREVIEW_HEAD_HEIGHT - 6.0),
        ));
        // NSBox's setContentView swaps the retained content; use
        // addSubview instead to keep the NSBox chrome untouched.
        b.addSubview(&label);
        b
    }
}

/// Estimate the intrinsic horizontal pixel width of a chip's text
/// contents at 11 px monospaced weight.  NSTextField.sizeToFit is the
/// AppKit-correct way but requires the NSTextField to be briefly placed
/// on-screen; a constant-per-char estimate is good enough for a static
/// 2-4 word chip and avoids a layout pass at construction.
///
/// 11 px SF Mono advance width ≈ 6.6 px.  Rounded up for safety.
fn chip_intrinsic_width(text: &str) -> f64 {
    // UTF-8 char count, not byte length — multi-byte chars (·, ×) render
    // as one advance-width glyph in SF Mono.
    let char_count = text.chars().count() as f64;
    (char_count * 6.8).max(24.0)
}

/// NSTextField builder shared across crumb + chip labels.
fn make_ph_label(
    mtm: MainThreadMarker,
    text: &str,
    color: &NSColor,
    font: Retained<NSFont>,
    alignment: NSTextAlignment,
) -> Retained<NSTextField> {
    unsafe {
        let ns = NSString::from_str(text);
        let label = NSTextField::labelWithString(&ns, mtm);
        label.setFont(Some(&font));
        label.setTextColor(Some(color));
        label.setAlignment(alignment);
        label.setDrawsBackground(false);
        label.setBordered(false);
        label.setBezeled(false);
        label.setEditable(false);
        label.setSelectable(false);
        label
    }
}

// -- colour tokens · preview-head ---------------------------------------

/// Preview-head secondary ink · `rgba(255,255,255,0.65)`.
fn ph_color_t65() -> Retained<NSColor> {
    unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.65) }
}

/// Chip fill · `rgba(255,255,255,0.03)`.
fn ph_color_chip_fill() -> Retained<NSColor> {
    unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.03) }
}

/// Chip border · `rgba(255,255,255,0.06)`.
fn ph_color_chip_border() -> Retained<NSColor> {
    unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.06) }
}

/// Warm chip fill · `var(--warm-12) = rgba(249,115,22,0.12)`.
fn ph_color_warm_fill() -> Retained<NSColor> {
    unsafe {
        NSColor::colorWithSRGBRed_green_blue_alpha(
            0xf9 as f64 / 255.0,
            0x73 as f64 / 255.0,
            0x16 as f64 / 255.0,
            0.12,
        )
    }
}

/// Warm chip border · `rgba(249,115,22,0.20)`.
fn ph_color_warm_border() -> Retained<NSColor> {
    unsafe {
        NSColor::colorWithSRGBRed_green_blue_alpha(
            0xf9 as f64 / 255.0,
            0x73 as f64 / 255.0,
            0x16 as f64 / 255.0,
            0.20,
        )
    }
}

/// Warm chip text · full-intensity warm `#f97316`.
fn ph_color_warm_text() -> Retained<NSColor> {
    unsafe {
        NSColor::colorWithSRGBRed_green_blue_alpha(
            0xf9 as f64 / 255.0,
            0x73 as f64 / 255.0,
            0x16 as f64 / 255.0,
            1.0,
        )
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

    // -- preview-head inner-size math · v1.19.2 diff #9 ---------------------

    #[test]
    fn inner_size_reserves_22px_for_preview_head() {
        // Standard 1120×612 preview container ⇒ inner 1120×590.
        let (w, h) = inner_size(1120.0, 612.0);
        assert!((w - 1120.0).abs() < 1e-9);
        assert!((h - 590.0).abs() < 1e-9);
    }

    #[test]
    fn inner_size_respects_preview_head_constant() {
        // Any height h > PREVIEW_HEAD_HEIGHT should subtract exactly 22.
        let (_w, h) = inner_size(800.0, 500.0);
        assert!((h - (500.0 - PREVIEW_HEAD_HEIGHT)).abs() < 1e-9);
    }

    #[test]
    fn inner_size_degenerate_short_container_collapses_to_zero() {
        // Container shorter than the strip → zero-area inner region.
        let (w, h) = inner_size(1120.0, 20.0);
        assert!(w.abs() < 1e-9);
        assert!(h.abs() < 1e-9);
    }

    #[test]
    fn inner_size_zero_width_collapses_to_zero() {
        let (w, h) = inner_size(0.0, 600.0);
        assert!(w.abs() < 1e-9);
        assert!(h.abs() < 1e-9);
    }

    #[test]
    fn inner_size_end_to_end_letterbox_still_16x9_preserving() {
        // After reserving preview-head, contained frame still respects
        // 16:9 ratio inside the reduced area.
        let (w, h) = inner_size(1600.0, 922.0); // inner = 1600×900 exactly
        let rect = compute_contained_frame(w, h, (16.0, 9.0));
        assert!((rect.size.width - 1600.0).abs() < 1e-9);
        assert!((rect.size.height - 900.0).abs() < 1e-9);
    }

    #[test]
    fn preview_head_height_is_22() {
        // Cross-module contract: PREVIEW_HEAD_HEIGHT is surfaced as
        // pub(crate) so tests / future callers can reference the same
        // constant.  Drift would silently break letterbox math.
        assert!((PREVIEW_HEAD_HEIGHT - 22.0).abs() < 1e-9);
    }

    // -- crumb text --------------------------------------------------------

    #[test]
    fn crumb_text_uses_source_dir_basename() {
        let text = build_crumb_text(Path::new("/Users/someone/project/demo"));
        assert!(text.contains("demo"), "crumb should include dir basename: {text}");
        assert!(
            text.contains("source.json"),
            "crumb should include source.json placeholder: {text}"
        );
    }

    #[test]
    fn crumb_text_falls_back_when_dir_is_root() {
        // Path::new("/") has no file_name; crumb should still be
        // informative.
        let text = build_crumb_text(Path::new("/"));
        assert!(!text.is_empty());
        assert!(text.contains("source.json"));
    }

    #[test]
    fn crumb_text_falls_back_on_empty() {
        let text = build_crumb_text(Path::new(""));
        assert!(!text.is_empty());
    }
}
