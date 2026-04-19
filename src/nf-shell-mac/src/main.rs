//! nf-shell-mac · main integration entry · T-11
//!
//! Wires the ten sibling modules (T-01 ~ T-10) into a real app launch:
//!
//! 1. parse argv → pick source.json (default `demo/v1.8-video-sample.json`)
//! 2. [`source::load_source`] the file (exit code 2 on IO / parse failure)
//! 3. `NSApplication.sharedApplication` + activation policy `.Regular`
//! 4. [`window::MainWindow::new`] builds the 1440×900 titled NSWindow
//! 5. Inside the content view lay out four panels with fixed frame math
//!    (non-resizable window so autolayout is overkill):
//!      * topbar        (0,  852, 1440, 48)
//!      * inspector     (1120, 0, 320, 852)
//!      * timeline      (0,   0, 1120, 240)   // width = 1440-320
//!      * preview       (0, 240, 1120, 612)   // height = 900-48-240
//!      * hud overlay   floated inside preview container, bottom-centre
//! 6. Fan the webview into a 60 Hz [`sync::PlayheadSync`] loop feeding
//!    the timeline (via [`sync::TimelineTarget`]) and HUD (via the
//!    [`HudTarget`] adapter declared below) so the playhead tracks the
//!    runtime's `window.nfHandle.currentTime()`.
//! 7. Enter `NSApplication.run()` — blocks until the user closes the
//!    window, at which point the delegate calls `app.terminate(nil)` and
//!    Rust returns `Ok(())`.
//!
//! ## `resolve_total_ms` strategy
//!
//! `source.duration` is an *expression string* ("`demo.end`",
//! "`212s`", "`212000`"). The runtime engine normally evaluates these at
//! render time, but for T-11 the shell only needs a rough total so the
//! timeline playhead ratio `currentTime / total` is sensible. Strategy:
//!
//! 1. Try to parse `duration` as a plain number → interpret as ms.
//! 2. Strip trailing `ms` / `s` / `m` and re-try as a number → convert.
//! 3. If `duration` references an anchor (e.g. `"demo.end"`), walk
//!    `source.anchors[name].end` and recurse one level (covers the
//!    common `"demo.begin + 212s"` case by scanning for `NNNs`).
//! 4. Walk every `clips[].end` expression across all tracks, try to
//!    extract numeric literals, and pick the max value. This catches
//!    shapes where `source.duration` is an anchor that resolves via clip
//!    ranges without any numeric literal at the top level.
//! 5. Fall back to `60_000` (1 minute) so the playhead at least moves —
//!    T-10 can refine this once the runtime's ADR-057 bridge returns the
//!    resolved duration.
//!
//! ## Clippy
//!
//! Workspace lints deny `unwrap_used` / `expect_used` / `panic`; main
//! uses `?` / `match` / `unwrap_or_else` with default values everywhere.

#![deny(unsafe_op_in_unsafe_fn)]

use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::{Arc, Mutex};

use objc2::rc::Retained;
use objc2::ClassType;
use objc2_app_kit::NSApplication;
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};

use nf_shell_mac::hud::HudView;
use nf_shell_mac::inspector::InspectorView;
use nf_shell_mac::preview::PreviewPanel;
use nf_shell_mac::source::{self, Source};
use nf_shell_mac::sync::{PlayheadSync, PlayheadTarget, SharedTarget, TimelineTarget};
use nf_shell_mac::timeline::TimelineView;
use nf_shell_mac::topbar::TopbarView;
use nf_shell_mac::window::{MainWindow, WINDOW_HEIGHT, WINDOW_WIDTH, TITLE_BAR_HEIGHT};

// ---------------------------------------------------------------------------
// Layout constants (window non-resizable so plain frame math is cleanest)
// ---------------------------------------------------------------------------

/// Right-hand inspector panel width (px) · mirrors sample-preview css.
const INSPECTOR_W: f64 = 320.0;
/// Bottom timeline strip height (px).
const TIMELINE_H: f64 = 240.0;
/// HUD overlay dimensions · the HUD view itself handles its own pill chrome.
const HUD_W: f64 = 520.0;
const HUD_H: f64 = 52.0;
/// Distance from bottom of preview container to the HUD pill's bottom edge.
const HUD_BOTTOM_GAP: f64 = 24.0;

// ---------------------------------------------------------------------------
// Backwards-compatible test-mode shim · T-04 CI uses this
// ---------------------------------------------------------------------------

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();

    // `--test-mode window-only` short-circuit (preserved from T-04 · CI smoke
    // script boots the window without needing a source file).
    let window_only = args.iter().any(|a| a == "window-only")
        && args.iter().any(|a| a == "--test-mode");
    if window_only {
        return match run_window_only() {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("nf-shell-mac: {err}");
                ExitCode::from(1)
            }
        };
    }

    match run_app(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(code) => ExitCode::from(code),
    }
}

/// Launch the full shell with the source.json provided on argv.
///
/// Exit codes:
///   * `2` — IO / parse error loading `source.json`
///   * `1` — any other startup failure (NSWindow build, preview load)
fn run_app(args: &[String]) -> Result<(), u8> {
    // ---- argv --------------------------------------------------------------
    //
    // First positional arg = source path. `unwrap_or_else` keeps the clippy
    // baseline happy (no `unwrap` / `expect`).
    let source_path_str: String = args
        .iter()
        .skip(1)
        .find(|a| !a.starts_with("--"))
        .cloned()
        .unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string());
    let source_path = PathBuf::from(&source_path_str);

    // ---- load source (exit code 2 on failure per interfaces.json) ---------
    let source = match source::load_source(&source_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("nf-shell-mac: failed to load source '{source_path_str}': {e}");
            return Err(2);
        }
    };

    // Directory used as WKWebView `baseURL` so relative asset paths resolve.
    // Falls back to "." (current directory) when the source path has no
    // parent (e.g. the user passed a bare filename from the repo root).
    let source_dir: PathBuf = match source_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };

    // Canonicalise so WKWebView gets an absolute `file://` base — relative
    // paths may trip the sandbox on `cargo run` where cwd is the workspace
    // root but the user could have passed a relative source.
    let source_dir_abs: PathBuf = match source_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => source_dir, // fall back to the as-given path if canonicalise fails
    };

    // ---- resolve playback duration ----------------------------------------
    let total_ms = resolve_total_ms(&source);

    // ---- AppKit main-thread setup -----------------------------------------
    let Some(mtm) = MainThreadMarker::new() else {
        eprintln!("nf-shell-mac: must be launched on the main thread");
        return Err(1);
    };

    if let Err(e) = launch(mtm, &source, &source_dir_abs, &source_path_str, total_ms) {
        eprintln!("nf-shell-mac: startup error: {e}");
        return Err(1);
    }
    Ok(())
}

/// Build every subview, compose them into the window, start the 60 Hz sync,
/// then enter the NSApp run loop (blocks).
fn launch(
    mtm: MainThreadMarker,
    source: &Source,
    source_dir: &Path,
    source_path_display: &str,
    total_ms: u64,
) -> Result<(), Box<dyn Error>> {
    // 1 · NSApplication + main window ---------------------------------------
    //
    // `MainWindow::new` internally calls `activateIgnoringOtherApps` +
    // `makeKeyAndOrderFront`, so after this call the window is already on
    // screen. We retain the handle in `main_window` so it's not dropped
    // before the run loop starts.
    let main_window = MainWindow::new(mtm)?;
    let content = main_window.content_view();

    // 2 · Frame math for the four panels ------------------------------------
    //
    // AppKit default coordinate space: origin at lower-left, y grows upward.
    // Content view is `WINDOW_WIDTH × WINDOW_HEIGHT` (1440 × 900). The 48 px
    // traffic-light / titlebar zone sits *inside* `content` because the
    // window uses `FullSizeContentView`.
    let content_h = WINDOW_HEIGHT;
    let content_w = WINDOW_WIDTH;
    let timeline_w = content_w - INSPECTOR_W;
    let preview_h = content_h - TITLE_BAR_HEIGHT - TIMELINE_H;

    let topbar_frame = NSRect::new(
        NSPoint::new(0.0, content_h - TITLE_BAR_HEIGHT),
        NSSize::new(content_w, TITLE_BAR_HEIGHT),
    );
    let inspector_frame = NSRect::new(
        NSPoint::new(content_w - INSPECTOR_W, 0.0),
        NSSize::new(INSPECTOR_W, content_h - TITLE_BAR_HEIGHT),
    );
    let timeline_frame = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(timeline_w, TIMELINE_H),
    );
    let preview_frame = NSRect::new(
        NSPoint::new(0.0, TIMELINE_H),
        NSSize::new(timeline_w, preview_h),
    );

    // 3 · Build each subview ------------------------------------------------
    let topbar = TopbarView::new(topbar_frame, source_path_display, mtm);
    let preview = PreviewPanel::new(preview_frame, source, source_dir, mtm)?;
    let timeline = TimelineView::new(timeline_frame, source, mtm);
    let inspector = InspectorView::new(inspector_frame, source, mtm);

    // HUD sits inside the preview container. Its frame is in the container's
    // own coordinate space (origin at the container's lower-left).
    let hud_frame = NSRect::new(
        NSPoint::new((preview_frame.size.width - HUD_W) / 2.0, HUD_BOTTOM_GAP),
        NSSize::new(HUD_W, HUD_H),
    );
    let webview_retained: Retained<_> = preview.webview().retain();
    let hud = HudView::new(hud_frame, webview_retained.clone(), total_ms, mtm);

    // 4 · Seed timeline total_ms so playhead movement is meaningful ---------
    //
    // `TimelineView::set_total_ms` takes `&mut self`; we wrap the timeline
    // in an `Arc<Mutex<_>>` so [`TimelineTarget::new`] can adopt it and
    // the NSTimer poll block (`PlayheadSync`) can mutate on every tick.
    //
    // clippy::arc_with_non_send_sync: TimelineView owns `Retained<NSView>`
    // which is `!Send + !Sync`. The `Arc<Mutex<TimelineView>>` is only ever
    // read from the main run loop (NSTimer block in `sync.rs` is scheduled
    // on `NSRunLoop::mainRunLoop`), so the bound is never crossed at
    // runtime. Same rationale as the `unsafe impl Send` on `TimelineTarget`
    // in `sync.rs` — see that module's header for the full argument.
    #[allow(clippy::arc_with_non_send_sync)]
    let timeline_shared = Arc::new(Mutex::new(timeline));
    if let Ok(mut guard) = timeline_shared.lock() {
        guard.set_total_ms(total_ms);
    }

    // Wrap HUD behind a mutex + adapter so `PlayheadSync` can fan into it.
    // Same `!Send` rationale as `timeline_shared` above.
    #[allow(clippy::arc_with_non_send_sync)]
    let hud_shared = Arc::new(Mutex::new(hud));

    // 5 · Attach subviews to the content view / preview container -----------
    //
    // Subview order determines z-order; last added is front-most. HUD is the
    // last thing we add on top of the preview container so the pill overlays
    // the webview.
    unsafe {
        content.addSubview(topbar.view());
        content.addSubview(preview.view());
        content.addSubview(inspector.view());
        // Timeline is added last among the main panels so its shadow (if any
        // future CALayer work) lands atop the preview's letterbox bars —
        // visually harmless now but good default z-order for later.
        if let Ok(guard) = timeline_shared.lock() {
            content.addSubview(guard.view());
        }
        // HUD into the preview container (not the window content view) so it
        // moves with the preview on future resize / letterbox adjustments.
        if let Ok(guard) = hud_shared.lock() {
            preview.view().addSubview(guard.view());
        }
    }

    // 6 · Start the 60 Hz playhead sync -------------------------------------
    //
    // One target per visual consumer of the playhead. Both are `SharedTarget`
    // (`Arc<Mutex<dyn PlayheadTarget + Send>>`) so the NSTimer block can
    // hold them across ticks. The sync itself is retained on the stack so
    // its timer isn't dropped prematurely; when `NSApplication.run()`
    // returns the stack unwinds and `sync.stop()` via Drop-style via
    // `PlayheadSync` staying alive until main returns.
    let timeline_target: SharedTarget = Arc::new(Mutex::new(TimelineTarget::new(
        Arc::clone(&timeline_shared),
    )));
    let hud_target: SharedTarget = Arc::new(Mutex::new(HudTarget::new(Arc::clone(&hud_shared))));
    let _sync = PlayheadSync::new(webview_retained, vec![timeline_target, hud_target], mtm);

    // 7 · Show + run --------------------------------------------------------
    main_window.show();
    let app = NSApplication::sharedApplication(mtm);
    // SAFETY: main thread + NSApplication has been configured + at least one
    // window is on screen; calling `run` is the standard launch pattern.
    unsafe { app.run() };

    // Keep ownership alive past `app.run()` so Rust doesn't drop the retained
    // AppKit objects while the run loop is still using them. The run loop
    // only returns when the window delegate calls `app.terminate(nil)`.
    drop(topbar);
    drop(preview);
    drop(inspector);
    drop(timeline_shared);
    drop(hud_shared);

    Ok(())
}

/// T-04 `--test-mode window-only` path — boots the window without loading a
/// source / runtime / panels. Kept for CI smoke tests.
fn run_window_only() -> Result<(), Box<dyn Error>> {
    let Some(mtm) = MainThreadMarker::new() else {
        return Err("must be on main thread".into());
    };
    let _window = MainWindow::new(mtm)?;
    let app = NSApplication::sharedApplication(mtm);
    // SAFETY: main thread; window is visible; standard launch path.
    unsafe { app.run() };
    Ok(())
}

// ---------------------------------------------------------------------------
// HUD PlayheadTarget adapter
// ---------------------------------------------------------------------------

/// Forwards [`sync::PlayheadTarget`] calls into a shared [`HudView`].
///
/// Parallels `TimelineTarget` in `sync.rs`: the HUD is main-thread-pinned
/// (its `Retained<NSView>` handles are `!Send`), but the NSTimer block only
/// runs on the main run loop so the `Send` bound demanded by
/// `Arc<Mutex<dyn PlayheadTarget + Send>>` is not actually exercised at
/// runtime. `unsafe impl Send` is the same workaround `sync.rs` uses on
/// `TimelineTarget`.
struct HudTarget {
    inner: Arc<Mutex<HudView>>,
}

impl HudTarget {
    fn new(inner: Arc<Mutex<HudView>>) -> Self {
        Self { inner }
    }
}

// SAFETY: `HudTarget::inner` only wraps main-thread-only AppKit state. The
// `PlayheadSync` NSTimer block fires on `NSRunLoop::mainRunLoop`, so the
// `Send` bound required by `Arc<Mutex<dyn PlayheadTarget + Send>>` is never
// observed on another thread. Same rationale as `TimelineTarget` in sync.rs.
unsafe impl Send for HudTarget {}

impl PlayheadTarget for HudTarget {
    fn set_current_ms(&mut self, ms: u64) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.set_current_ms(ms);
        }
    }

    fn set_playing(&mut self, playing: bool) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.set_playing(playing);
        }
    }
}

// ---------------------------------------------------------------------------
// resolve_total_ms · best-effort duration extraction
// ---------------------------------------------------------------------------

/// Default fallback (1 minute) when every heuristic fails — keeps the
/// playhead animated rather than frozen on a broken source.
const FALLBACK_TOTAL_MS: u64 = 60_000;

/// Extract a rough total playback duration in milliseconds from a
/// [`Source`]. Best-effort only; see module docs for the full strategy.
fn resolve_total_ms(source: &Source) -> u64 {
    // 1. direct numeric / "212s" / "212ms" forms on source.duration
    if let Some(ms) = parse_duration_expr(&source.duration) {
        return ms;
    }

    // 2. anchor dereference — "demo.end" → anchors.demo.end string
    if let Some(ms) = resolve_anchor_reference(source, &source.duration) {
        return ms;
    }

    // 3. fall through to clip-end scan
    let mut max_ms: u64 = 0;
    for track in &source.tracks {
        for clip in &track.clips {
            if let Some(ms) = parse_duration_expr(&clip.end) {
                if ms > max_ms {
                    max_ms = ms;
                }
            } else if let Some(ms) = resolve_anchor_reference(source, &clip.end) {
                if ms > max_ms {
                    max_ms = ms;
                }
            }
        }
    }
    if max_ms > 0 {
        return max_ms;
    }

    // 4. give up — still return something non-zero so the timeline moves.
    FALLBACK_TOTAL_MS
}

/// Parse a duration expression like `"212000"`, `"212.0s"`, `"212ms"`,
/// `"2m"`, or `"demo.begin + 212s"` (by scanning for numeric literals with
/// time suffixes). Returns `None` if no recognisable number+unit pair can be
/// found.
fn parse_duration_expr(expr: &str) -> Option<u64> {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Plain number → assume milliseconds.
    if let Ok(n) = trimmed.parse::<f64>() {
        if n.is_finite() && n >= 0.0 {
            return Some(n as u64);
        }
    }
    // `NNN<unit>` where NNN may be float.
    if let Some(ms) = parse_number_with_unit(trimmed) {
        return Some(ms);
    }
    // Walk the expression for any embedded "NNNs" / "NNNms" / "NNNm" literal
    // (covers "demo.begin + 212s" → 212s).
    extract_embedded_time(trimmed)
}

/// Parse `"212s"` / `"212ms"` / `"2.5m"` (case-insensitive unit) into ms.
/// Returns `None` if the whole string isn't number-then-unit.
fn parse_number_with_unit(s: &str) -> Option<u64> {
    let s = s.trim();
    // Order matters: "ms" first so "s" suffix doesn't consume it.
    for (suffix, mul) in [("ms", 1.0_f64), ("s", 1000.0), ("m", 60_000.0)] {
        if let Some(num_str) = s.strip_suffix(suffix) {
            if let Ok(n) = num_str.trim().parse::<f64>() {
                if n.is_finite() && n >= 0.0 {
                    return Some((n * mul) as u64);
                }
            }
        }
    }
    None
}

/// Scan `expr` for an embedded `<number><unit>` token (e.g. `"demo.begin +
/// 212s"`). Picks the *largest* numeric literal found with a time unit so
/// expressions like `"start + 212s"` resolve to 212s.
fn extract_embedded_time(expr: &str) -> Option<u64> {
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    let mut best: Option<u64> = None;
    while i < bytes.len() {
        // Find the start of a numeric run.
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            let num_end = i;
            // Skip whitespace between number and unit (e.g. "212 s").
            while i < bytes.len() && bytes[i] == b' ' {
                i += 1;
            }
            // Read unit letters.
            let unit_start = i;
            while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            let unit = &expr[unit_start..i];
            let num_str = &expr[start..num_end];
            if !unit.is_empty() {
                let combined = format!("{num_str}{unit}");
                if let Some(ms) = parse_number_with_unit(&combined) {
                    best = Some(match best {
                        Some(prev) if prev >= ms => prev,
                        _ => ms,
                    });
                }
            }
        } else {
            i += 1;
        }
    }
    best
}

/// Dereference `"demo.end"` / `"demo.begin"` to the string stored in
/// `source.anchors[demo].end` and attempt to parse that as a duration.
///
/// Returns `None` if anchors are missing / wrong shape / expression still
/// unresolvable.
fn resolve_anchor_reference(source: &Source, expr: &str) -> Option<u64> {
    let trimmed = expr.trim();
    // Expect shape "<name>.<field>".
    let (name, field) = trimmed.split_once('.')?;
    let anchors = source.anchors.as_ref()?;
    let anchor_obj = anchors.get(name)?;
    let field_value = anchor_obj.get(field)?;
    let s = field_value.as_str()?;
    // Recurse one level (anchor string might itself reference other
    // anchors, but v1.19 demo only goes one deep). Guard against self-cycle
    // by comparing against the original expr.
    if s == expr {
        return None;
    }
    parse_duration_expr(s)
}

// ---------------------------------------------------------------------------
// Tests (pure functions only — AppKit launch path requires main thread)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]
    #![allow(clippy::panic)]

    use super::*;
    use nf_shell_mac::source::parse_source;

    #[test]
    fn parse_plain_number_is_ms() {
        assert_eq!(parse_duration_expr("212000"), Some(212_000));
    }

    #[test]
    fn parse_seconds_suffix() {
        assert_eq!(parse_duration_expr("212s"), Some(212_000));
    }

    #[test]
    fn parse_float_seconds() {
        assert_eq!(parse_duration_expr("2.5s"), Some(2_500));
    }

    #[test]
    fn parse_ms_suffix() {
        assert_eq!(parse_duration_expr("500ms"), Some(500));
    }

    #[test]
    fn parse_minutes_suffix() {
        assert_eq!(parse_duration_expr("2m"), Some(120_000));
    }

    #[test]
    fn parse_embedded_seconds_in_expression() {
        assert_eq!(parse_duration_expr("demo.begin + 212s"), Some(212_000));
    }

    #[test]
    fn parse_anchor_name_alone_is_not_duration() {
        assert_eq!(parse_duration_expr("demo.end"), None);
    }

    #[test]
    fn parse_empty_is_none() {
        assert_eq!(parse_duration_expr(""), None);
    }

    #[test]
    fn resolve_demo_v18_source() {
        let raw = r#"{
            "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },
            "duration": "demo.end",
            "anchors": { "demo": { "begin": "0", "end": "demo.begin + 212s" } },
            "tracks": []
        }"#;
        let src = parse_source(raw).unwrap();
        // duration "demo.end" → anchors.demo.end "demo.begin + 212s" → 212s.
        assert_eq!(resolve_total_ms(&src), 212_000);
    }

    #[test]
    fn resolve_falls_back_when_everything_fails() {
        let raw = r#"{
            "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },
            "duration": "mystery",
            "tracks": []
        }"#;
        let src = parse_source(raw).unwrap();
        assert_eq!(resolve_total_ms(&src), FALLBACK_TOTAL_MS);
    }

    #[test]
    fn resolve_numeric_direct() {
        let raw = r#"{
            "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },
            "duration": "90000",
            "tracks": []
        }"#;
        let src = parse_source(raw).unwrap();
        assert_eq!(resolve_total_ms(&src), 90_000);
    }

    #[test]
    fn resolve_scans_clip_ends() {
        // duration unresolvable, but clip.end has a numeric literal with unit.
        let raw = r#"{
            "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },
            "duration": "unresolvable",
            "tracks": [
                { "id": "t1", "kind": "scene", "src": "scene.js",
                  "clips": [{ "begin": "0", "end": "60s", "params": {} }] }
            ]
        }"#;
        let src = parse_source(raw).unwrap();
        assert_eq!(resolve_total_ms(&src), 60_000);
    }
}
