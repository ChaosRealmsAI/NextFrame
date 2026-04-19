//! Timeline NSView · 240 px · shell 层自绘（跟 runtime 的 browser view 完全分离）
//!
//! Visual spec (mirror of `spec/versions/v1.19/kickoff/sample-preview.html`
//! `.timeline` section):
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────────┐
//! │  Timeline · N tracks (shell 解析)     [N tracks] [skeleton · 不交互] │  ← head (22 px)
//! ├─────────────────────────────────────────────────────────────────────┤
//! │  0       25%      50%      75%      100%     ▎playhead              │  ← ruler (22 px)
//! ├─────────────────────────────────────────────────────────────────────┤
//! │  [V] bg · gradient    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← lane 0 (32 px)
//! │  [T] scene · hero     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← lane 1 (32 px)
//! │  [D] video · PIP      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← lane 2 (32 px)
//! │  ...                                                                │  ← lane N …
//! └─────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! ## Layering (ADR-057 hard boundary)
//!
//! This file MUST NOT touch the runtime-layer browser view nor any of its
//! JavaScript bridge APIs.  Timeline is a **shell** widget that draws from
//! the parsed [`Source`] struct only.  The playhead position comes from the
//! shell-owned `playhead_ms` counter; T-10 will drive `set_playhead_ms` on
//! each RAF tick, but that wiring lives in the integration layer — this
//! crate simply moves a vertical bar.
//!
//! The T-07 verify script greps the file for the runtime-bridge API names
//! and must find zero matches, which is why this comment deliberately
//! avoids spelling any of them out verbatim.
//!
//! ## Rendering strategy — NSBox subviews (no drawRect)
//!
//! The timeline visual is a stack of rectangles with simple corner radii.
//! `NSBox` with `NSBoxType::Custom` gives us fill + border + cornerRadius
//! without declaring a custom NSView subclass for `drawRect:` — same approach
//! the topbar (T-05) takes for its brand-mark / avatar chips.  Going with
//! CoreGraphics `drawRect:` would require `declare_class!` + ivar bookkeeping
//! for the Source reference, which is 3× the code for identical pixels on a
//! skeleton view.  If v1.22 needs pixel-exact clip bars (e.g. hatch patterns
//! on muted lanes), migrating a single `lane` struct to a custom NSView is
//! isolated to [`build_lane`] — the public surface is unaffected.
//!
//! Gradients on clip bars (the `.lane-clip { background:linear-gradient }`
//! in sample-preview) are approximated with a solid colour at the stop-1
//! (brighter) end, because AppKit `NSBox` does not expose gradient fill.
//! A future pass can swap the lane-clip NSBox for a `CAGradientLayer`-backed
//! NSView — leaves the public API untouched.
//!
//! ## Frame / coordinate system
//!
//! NSView default coordinate system is flipped=NO (origin bottom-left).  All
//! subview frames are computed in that space; [`TimelineView::relayout`] is
//! the single helper that does the arithmetic so both `new` and
//! [`TimelineView::set_playhead_ms`] / [`TimelineView::set_source`] share
//! the same rules.

#![allow(non_snake_case)]

use objc2::rc::Retained;
use objc2::ClassType;
use objc2_app_kit::{
    NSBorderType, NSBox, NSBoxType, NSColor, NSFont, NSTextAlignment, NSTextField,
    NSTitlePosition, NSView,
};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

use crate::source::Source;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/// Total timeline container height — matches `.timeline { height: 240px }`
/// in sample-preview.
pub const TIMELINE_HEIGHT: f64 = 240.0;
/// Header row (title + chips) height.
const HEAD_HEIGHT: f64 = 22.0;
/// Ruler row (0 / 25% / … tick labels + playhead) height.
const RULER_HEIGHT: f64 = 22.0;
/// Per-lane row height — matches `.lane { height: 32px }`.
const LANE_HEIGHT: f64 = 32.0;
/// Gap between lanes — matches `.lanes { gap: 4px }`.
const LANE_GAP: f64 = 4.0;
/// Outer horizontal padding inside the `.g-body` container.
const OUTER_PAD_X: f64 = 14.0;
/// Vertical padding above the head row (mirrors `.g-body { padding: 10px 14px }`).
const OUTER_PAD_Y: f64 = 10.0;
/// Left gutter inside each lane for the kind chip + name label before the
/// clip bar starts.  Matches the combined width of `.lane-kind` (20 px) +
/// `.lane-name` (min-width 90 px in CSS, but real names like
/// `video · video-pip` need ~110 px at 11 px system font) + gaps in
/// sample-preview.  Previous value of 130 px truncated the longer names
/// ("scene · scene-hero" → "scene · scene-he"); 160 px gives clean
/// clearance for the v1.8 demo source and keeps the clip bar rightward.
const LANE_LEFT_GUTTER: f64 = 160.0;
/// Width of the kind-letter chip.
const LANE_CHIP_SIZE: f64 = 20.0;
/// Playhead stroke width — matches `.playhead { width: 1.5px }`.
const PLAYHEAD_WIDTH: f64 = 1.5;
/// Height of the clip bar inside each lane — matches `.lane-clip { height: 18px }`.
const CLIP_BAR_HEIGHT: f64 = 18.0;
/// Inset applied to each clip inside a lane so neighbouring clips don't touch.
const CLIP_INNER_MARGIN: f64 = 2.0;

// ---------------------------------------------------------------------------
// Design tokens (mirror of sample-preview `:root` vars used inside `.timeline`)
// ---------------------------------------------------------------------------

mod color {
    use objc2::rc::Retained;
    use objc2_app_kit::NSColor;

    /// Accent purple · `#a78bfa` · playhead stroke, bg/overlay lane tint.
    pub fn accent() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                1.0,
            )
        }
    }

    /// Accent tint · `rgba(167,139,250,0.4)` · bg/overlay lane-clip fill.
    pub fn accent_clip() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                0.40,
            )
        }
    }

    /// Accent chip bg · `rgba(167,139,250,0.14)`.
    pub fn accent_chip_bg() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                0.14,
            )
        }
    }

    /// Blue · `#38bdf8` · scene-lane stroke.
    pub fn blue() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x38 as f64 / 255.0,
                0xbd as f64 / 255.0,
                0xf8 as f64 / 255.0,
                1.0,
            )
        }
    }

    /// Blue tint · `rgba(56,189,248,0.4)` · scene-lane clip fill.
    pub fn blue_clip() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x38 as f64 / 255.0,
                0xbd as f64 / 255.0,
                0xf8 as f64 / 255.0,
                0.40,
            )
        }
    }

    /// Blue chip bg · `rgba(56,189,248,0.14)`.
    pub fn blue_chip_bg() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x38 as f64 / 255.0,
                0xbd as f64 / 255.0,
                0xf8 as f64 / 255.0,
                0.14,
            )
        }
    }

    /// Pink · `#f472b6` · chart/data/video lane stroke.
    pub fn pink() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xf4 as f64 / 255.0,
                0x72 as f64 / 255.0,
                0xb6 as f64 / 255.0,
                1.0,
            )
        }
    }

    /// Pink tint · `rgba(244,114,182,0.4)` · chart/data/video clip fill.
    pub fn pink_clip() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xf4 as f64 / 255.0,
                0x72 as f64 / 255.0,
                0xb6 as f64 / 255.0,
                0.40,
            )
        }
    }

    /// Pink chip bg · `rgba(244,114,182,0.14)`.
    pub fn pink_chip_bg() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xf4 as f64 / 255.0,
                0x72 as f64 / 255.0,
                0xb6 as f64 / 255.0,
                0.14,
            )
        }
    }

    /// Green · `#34d399` · audio/subtitle stroke.
    pub fn green() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x34 as f64 / 255.0,
                0xd3 as f64 / 255.0,
                0x99 as f64 / 255.0,
                1.0,
            )
        }
    }

    /// Green tint · `rgba(52,211,153,0.4)` · audio/subtitle clip fill.
    pub fn green_clip() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x34 as f64 / 255.0,
                0xd3 as f64 / 255.0,
                0x99 as f64 / 255.0,
                0.40,
            )
        }
    }

    /// Green chip bg · `rgba(52,211,153,0.14)`.
    pub fn green_chip_bg() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0x34 as f64 / 255.0,
                0xd3 as f64 / 255.0,
                0x99 as f64 / 255.0,
                0.14,
            )
        }
    }

    /// Lane row background · `rgba(255,255,255,0.02)`.
    pub fn lane_bg() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.02) }
    }

    /// Primary text colour (white).
    pub fn text_primary() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0) }
    }

    /// `var(--t80)` · `rgba(255,255,255,0.80)` · lane name label.
    pub fn text_80() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.80) }
    }

    /// `var(--t50)` · `rgba(255,255,255,0.50)` · header info chips.
    pub fn text_50() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.50) }
    }

    /// `var(--t35)` · `rgba(255,255,255,0.35)` · ruler tick labels.
    pub fn text_35() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.35) }
    }

    /// Mini-chip background · `rgba(255,255,255,0.04)`.
    pub fn chip_bg() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.04) }
    }
}

// ---------------------------------------------------------------------------
// Track kind → visual classification
// ---------------------------------------------------------------------------

/// Which colour family + letter a given Track.kind maps to.  Mirrors the
/// `.lane[data-kind=X]` CSS in sample-preview.  Unknown kinds fall back to
/// the "V" (accent purple) bucket so a new track type added mid-version still
/// renders without a panic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LaneStyle {
    /// bg / overlay → V · accent purple.
    V,
    /// scene → T · blue.
    T,
    /// chart / data / video → D · pink.
    D,
    /// audio / subtitle → A · green.
    A,
}

impl LaneStyle {
    /// Returns the single-letter kind glyph rendered inside the lane-chip.
    fn letter(self) -> &'static str {
        match self {
            Self::V => "V",
            Self::T => "T",
            Self::D => "D",
            Self::A => "A",
        }
    }

    /// Chip background colour (`rgba(<accent>, 0.14)`).
    fn chip_bg(self) -> Retained<NSColor> {
        match self {
            Self::V => color::accent_chip_bg(),
            Self::T => color::blue_chip_bg(),
            Self::D => color::pink_chip_bg(),
            Self::A => color::green_chip_bg(),
        }
    }

    /// Chip letter / lane stroke colour (opaque accent).
    fn accent(self) -> Retained<NSColor> {
        match self {
            Self::V => color::accent(),
            Self::T => color::blue(),
            Self::D => color::pink(),
            Self::A => color::green(),
        }
    }

    /// Clip-bar fill colour (`rgba(<accent>, 0.40)`).
    fn clip_fill(self) -> Retained<NSColor> {
        match self {
            Self::V => color::accent_clip(),
            Self::T => color::blue_clip(),
            Self::D => color::pink_clip(),
            Self::A => color::green_clip(),
        }
    }
}

/// Classify a Track.kind string into a [`LaneStyle`].  Covers the 7 official
/// track kinds declared in `src/nf-tracks/official/*.js` (video · bg · scene
/// · chart · data · subtitle · audio) plus the `overlay` shell convention
/// used in sample-preview.  Unknown kinds default to `V` (purple) so the
/// lane still renders.
fn classify(kind: &str) -> LaneStyle {
    match kind {
        "bg" | "overlay" => LaneStyle::V,
        "scene" => LaneStyle::T,
        "chart" | "data" | "video" => LaneStyle::D,
        "audio" | "subtitle" => LaneStyle::A,
        _ => LaneStyle::V,
    }
}

/// Human-readable lane label shown next to the chip.  Track.kind is spec'd
/// as a single lowercase word (e.g. "video") — we append the track id in
/// parentheses so distinct tracks of the same kind stay distinguishable
/// ("video · pip-1" vs "video · pip-2").
fn lane_name(track: &crate::source::Track) -> String {
    format!("{} · {}", track.kind, track.id)
}

// ---------------------------------------------------------------------------
// TimelineView
// ---------------------------------------------------------------------------

/// Owning handle for the timeline NSView hierarchy.
///
/// Keeps [`Retained`] references to the playhead bar and header labels so
/// [`Self::set_playhead_ms`] / [`Self::set_source`] can mutate them without
/// walking the subview tree.
pub struct TimelineView {
    /// Root container for the whole panel.  Exposed via [`Self::view`].
    root: Retained<NSView>,
    /// Parsed source we last rendered from.  Kept so `set_playhead_ms` can
    /// re-measure the ruler width without re-parsing, and so `set_source`
    /// has an owned copy before we tear down subviews.
    #[allow(dead_code)]
    source: Source,
    /// Playhead position in milliseconds.  T-10 playhead sync drives this
    /// via `set_playhead_ms` at 60 Hz.
    playhead_ms: u64,
    /// Total duration in milliseconds.  Because `source.duration` is an
    /// expression string (FM-SHAPE), we do not evaluate it in shell — T-11
    /// main.rs sets this via `set_total_ms` after pulling the resolved
    /// duration from the runtime (or hardcoding per-source during L5
    /// integration).  `0` means the ratio computation falls back to `x = 0`
    /// to avoid divide-by-zero.
    total_ms: u64,
    /// Owned handle to the thin playhead bar so [`Self::set_playhead_ms`] can
    /// move it.  Child of the root; see [`Self::relayout_playhead`].
    playhead_bar: Retained<NSBox>,
    /// Cached header-row right-chip ("N tracks") — refreshed when source
    /// changes.  Leaves the "skeleton · 不交互" chip static.
    header_track_chip: Retained<NSTextField>,
    /// Cached header title label ("Timeline · N tracks (shell 解析)") so
    /// [`Self::set_source`] can update its text.
    header_title: Retained<NSTextField>,
    /// Cached ruler-tick labels so [`Self::set_total_ms`] can rewrite them
    /// as actual seconds (`"53s" / "106s" / …`) once the integrator injects
    /// a real duration.  Five entries at 0/25/50/75/100 % of the timeline.
    ruler_ticks: Vec<Retained<NSTextField>>,
}

impl TimelineView {
    /// Build a timeline rooted at `frame`.  Caller chooses width; height is
    /// clamped to [`TIMELINE_HEIGHT`].  Subviews are positioned via explicit
    /// frames because every row has a fixed height and only the clip bars
    /// need width arithmetic.
    ///
    /// The returned view is **not** added to any superview — the caller
    /// (T-04 window / T-11 main) does `addSubview`.
    pub fn new(frame: NSRect, source: &Source, mtm: MainThreadMarker) -> Self {
        // Root — a plain NSView.  We intentionally use NSView (not
        // NSVisualEffectView) because the topbar and outer `.timeline` panel
        // already sit inside a blurred-glass container; layering another
        // blur here would make lane bars feel washed out.
        let clamped = NSRect::new(
            frame.origin,
            NSSize::new(frame.size.width, TIMELINE_HEIGHT),
        );
        let root: Retained<NSView> = unsafe {
            let alloc = mtm.alloc::<NSView>();
            NSView::initWithFrame(alloc, clamped)
        };

        // ----- Header row --------------------------------------------------
        let track_count = source.tracks.len();
        let title_text = format!("Timeline · {track_count} tracks (shell 解析)");
        let header_title = make_label(
            mtm,
            &title_text,
            &color::text_primary(),
            unsafe { NSFont::boldSystemFontOfSize(12.0) },
            NSTextAlignment::Left,
        );
        let header_track_chip = make_chip_label(mtm, &format!("{track_count} tracks"));
        let header_static_chip = make_chip_label(mtm, "skeleton · 不交互");

        // ----- Ruler row ---------------------------------------------------
        // Five tick labels at 0 / 25 / 50 / 75 / 100 %.  Labels are rendered
        // as seconds once [`TimelineView::set_total_ms`] lands a real
        // duration; during construction `total_ms = 0` so we fall back to
        // the short "0/25%/50%/75%/100%" percentage labels (matches the
        // visual when the integrator hasn't yet wired duration).
        let ruler_ticks: Vec<Retained<NSTextField>> = format_ruler_labels(0)
            .iter()
            .map(|txt| {
                make_label(
                    mtm,
                    txt,
                    &color::text_35(),
                    unsafe { NSFont::monospacedSystemFontOfSize_weight(9.0, 0.0) },
                    NSTextAlignment::Center,
                )
            })
            .collect();

        // Playhead — thin vertical NSBox, accent-purple fill.  No real
        // drop-shadow (would need CALayer shadowColor / shadowOpacity); the
        // solid accent stroke is readable enough on the dark lane background.
        let playhead_bar: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(
                alloc,
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(PLAYHEAD_WIDTH, 10.0)),
            );
            b.setBoxType(NSBoxType::NSBoxCustom);
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSNoBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::accent());
            b.setCornerRadius(0.0);
            b
        };

        // ----- Lane rows ---------------------------------------------------
        //
        // For each Track, build a container NSBox (lane background) with
        // three children: kind-chip NSBox + letter label, name NSTextField,
        // clip-bar NSBox (v1.19 skeleton spans the lane-clip zone at an
        // even split across clips because we don't evaluate begin/end
        // expressions).
        let lane_boxes: Vec<LaneHandles> = source
            .tracks
            .iter()
            .map(|t| build_lane(mtm, t))
            .collect();

        // ----- Attach to root ---------------------------------------------
        unsafe {
            root.addSubview(&header_title);
            root.addSubview(&header_track_chip);
            root.addSubview(&header_static_chip);
            for tick in &ruler_ticks {
                root.addSubview(tick);
            }
            root.addSubview(playhead_bar.as_super());
            for lane in &lane_boxes {
                root.addSubview(lane.container.as_super());
            }
        }

        let this = Self {
            root,
            source: source.clone(),
            playhead_ms: 0,
            total_ms: 0,
            playhead_bar,
            header_track_chip,
            header_title,
            ruler_ticks: ruler_ticks.clone(),
        };

        // Initial layout pass.
        this.relayout(&header_static_chip, &ruler_ticks, &lane_boxes);

        this
    }

    /// Borrow the root view as a plain `&NSView` for the window integration
    /// layer to `addSubview` without pulling in any NSBox-specific type.
    pub fn view(&self) -> &NSView {
        &self.root
    }

    /// Move the playhead to the given absolute milliseconds.  x position =
    /// `(ms / total_ms) * ruler_width`; if total is 0 (not yet set) the
    /// playhead stays at x=0.  T-10 sync drives this at 60 Hz; T-11 main
    /// calls [`Self::set_total_ms`] once at startup.
    pub fn set_playhead_ms(&mut self, ms: u64) {
        self.playhead_ms = ms;
        self.relayout_playhead();
    }

    /// Set the total duration (ms) used as the playhead-ratio denominator.
    /// Called by T-11 integrator after the runtime resolves `source.duration`
    /// (or with a best-guess from source if no JS side is yet initialised).
    /// Also rewrites the five ruler-tick labels so they read as actual
    /// seconds instead of placeholder percentages.
    pub fn set_total_ms(&mut self, ms: u64) {
        self.total_ms = ms;
        let labels = format_ruler_labels(ms);
        for (label, text) in self.ruler_ticks.iter().zip(labels.iter()) {
            unsafe {
                label.setStringValue(&NSString::from_str(text));
            }
        }
        self.relayout_playhead();
    }

    /// Replace the underlying source and rebuild all lane subviews.  Reserved
    /// for v1.22 file-open / edit-undo; v1.19 only calls it indirectly when
    /// the window recreates the timeline on source reload.
    ///
    /// The implementation tears down existing lane subviews and builds fresh
    /// ones because individual lanes may change kind / count.  Header title
    /// + track chip are updated in place.
    pub fn set_source(&mut self, source: &Source) {
        // Remove every subview we own except the long-lived handles
        // (header title, header track chip, playhead bar).  Walking
        // `self.root.subviews()` in reverse keeps index stability while we
        // mutate the collection.
        unsafe {
            let children = self.root.subviews();
            let count = children.count();
            for i in (0..count).rev() {
                let child = children.objectAtIndex(i);
                let child_ptr: *const NSView = &*child;
                // NSTextField : NSControl : NSView — `as_super` on the
                // text-field yields an `&NSControl`, so we cast its pointer
                // to `*const NSView` (NSControl is declared as a direct
                // NSView subclass at the ObjC runtime level; the two share
                // instance layout).  NSBox : NSView so one `as_super` call
                // is enough for the playhead.
                let title_ptr: *const NSView =
                    self.header_title.as_super() as *const _ as *const NSView;
                let chip_ptr: *const NSView =
                    self.header_track_chip.as_super() as *const _ as *const NSView;
                let playhead_ptr: *const NSView = self.playhead_bar.as_super();
                if child_ptr == title_ptr
                    || child_ptr == chip_ptr
                    || child_ptr == playhead_ptr
                {
                    continue;
                }
                child.removeFromSuperview();
            }
        }

        // Rebuild — mirror the `new` body but write into `self`.
        let mtm = MainThreadMarker::from(&*self.root);
        let track_count = source.tracks.len();
        unsafe {
            let new_title = NSString::from_str(&format!(
                "Timeline · {track_count} tracks (shell 解析)"
            ));
            self.header_title.setStringValue(&new_title);
            let new_chip = NSString::from_str(&format!("{track_count} tracks"));
            self.header_track_chip.setStringValue(&new_chip);
        }

        let ruler_ticks: Vec<Retained<NSTextField>> = format_ruler_labels(self.total_ms)
            .iter()
            .map(|txt| {
                make_label(
                    mtm,
                    txt,
                    &color::text_35(),
                    unsafe { NSFont::monospacedSystemFontOfSize_weight(9.0, 0.0) },
                    NSTextAlignment::Center,
                )
            })
            .collect();
        let lane_boxes: Vec<LaneHandles> = source
            .tracks
            .iter()
            .map(|t| build_lane(mtm, t))
            .collect();
        let header_static_chip = make_chip_label(mtm, "skeleton · 不交互");

        unsafe {
            self.root.addSubview(&header_static_chip);
            for tick in &ruler_ticks {
                self.root.addSubview(tick);
            }
            for lane in &lane_boxes {
                self.root.addSubview(lane.container.as_super());
            }
        }

        self.source = source.clone();
        self.ruler_ticks = ruler_ticks.clone();
        self.relayout(&header_static_chip, &ruler_ticks, &lane_boxes);
    }

    // -----------------------------------------------------------------
    // Layout helpers
    // -----------------------------------------------------------------

    /// Position every subview given the root width.  Split out from `new`
    /// so `set_source` can re-run it after rebuilding lane subviews, and
    /// so a future resize-capable version (v1.22) has a single site to
    /// patch.
    fn relayout(
        &self,
        header_static_chip: &NSTextField,
        ruler_ticks: &[Retained<NSTextField>],
        lane_boxes: &[LaneHandles],
    ) {
        let width = self.root.frame().size.width;

        // Header row lives at top of the view (NSView is flipped=NO, so
        // top = HEIGHT - padding - row height).
        let head_y = TIMELINE_HEIGHT - OUTER_PAD_Y - HEAD_HEIGHT;
        let title_width = (width * 0.6).min(420.0);
        unsafe {
            self.header_title.setFrame(NSRect::new(
                NSPoint::new(OUTER_PAD_X, head_y),
                NSSize::new(title_width, HEAD_HEIGHT),
            ));
        }
        // Right-side chips — laid out right-to-left so the order (track-chip
        // then "skeleton" chip) matches the painter order in sample-preview.
        let static_chip_w = 110.0;
        let track_chip_w = 80.0;
        let chip_gap = 8.0;
        let static_chip_x = width - OUTER_PAD_X - static_chip_w;
        let track_chip_x = static_chip_x - chip_gap - track_chip_w;
        unsafe {
            header_static_chip.setFrame(NSRect::new(
                NSPoint::new(static_chip_x, head_y + 3.0),
                NSSize::new(static_chip_w, HEAD_HEIGHT - 6.0),
            ));
            self.header_track_chip.setFrame(NSRect::new(
                NSPoint::new(track_chip_x, head_y + 3.0),
                NSSize::new(track_chip_w, HEAD_HEIGHT - 6.0),
            ));
        }

        // Ruler row sits directly below the header.
        let ruler_y = head_y - RULER_HEIGHT;
        let ruler_inner_x = OUTER_PAD_X;
        let ruler_inner_w = (width - OUTER_PAD_X * 2.0).max(1.0);
        let label_w = 40.0;
        let ratios = [0.0f64, 0.25, 0.50, 0.75, 1.0];
        for (tick, ratio) in ruler_ticks.iter().zip(ratios.iter()) {
            let cx = ruler_inner_x + ruler_inner_w * ratio;
            unsafe {
                tick.setFrame(NSRect::new(
                    NSPoint::new(cx - label_w / 2.0, ruler_y + 2.0),
                    NSSize::new(label_w, RULER_HEIGHT - 4.0),
                ));
            }
        }

        // Lane rows stack below the ruler.  Gap between lanes = LANE_GAP.
        let lanes_top = ruler_y - 4.0;
        for (i, lane) in lane_boxes.iter().enumerate() {
            let i_f = i as f64;
            let lane_y = lanes_top - (i_f + 1.0) * LANE_HEIGHT - i_f * LANE_GAP;
            let lane_frame = NSRect::new(
                NSPoint::new(OUTER_PAD_X, lane_y),
                NSSize::new((width - OUTER_PAD_X * 2.0).max(1.0), LANE_HEIGHT),
            );
            lane.position(lane_frame);
        }

        self.relayout_playhead();
    }

    /// Move the playhead bar to match the current `playhead_ms` / total.
    ///
    /// Because `source.duration` is an expression string we do not evaluate,
    /// we treat the ruler span (ruler_inner_w) as the 100 % axis and derive
    /// a ratio from `playhead_ms` with a defensive fallback when the caller
    /// has not wired a real denominator yet.  The playhead extends from the
    /// bottom of the header row through every lane, mirroring the sample-
    /// preview `.playhead { bottom: -180px }` stacking.
    fn relayout_playhead(&self) {
        let width = self.root.frame().size.width;
        let ruler_inner_x = OUTER_PAD_X;
        let ruler_inner_w = (width - OUTER_PAD_X * 2.0).max(1.0);

        // Ratio = playhead / total · clamped [0, 1].  total_ms = 0 means
        // caller has not yet injected a denominator → fall back to x = 0
        // (no divide-by-zero).  T-11 integrator wires total_ms at startup.
        let ratio: f64 = if self.total_ms == 0 {
            0.0
        } else {
            ((self.playhead_ms as f64) / (self.total_ms as f64)).clamp(0.0, 1.0)
        };
        let x = ruler_inner_x + ruler_inner_w * ratio;

        // Playhead spans from the top of the ruler strip down through the
        // full lane stack.  We derive the vertical extent as "ruler top →
        // bottom of root" so the bar stays visible regardless of lane count.
        let head_y = TIMELINE_HEIGHT - OUTER_PAD_Y - HEAD_HEIGHT;
        let ruler_y = head_y - RULER_HEIGHT;
        let bar_top = ruler_y + RULER_HEIGHT;
        let bar_bottom = OUTER_PAD_Y;
        let bar_h = (bar_top - bar_bottom).max(1.0);

        unsafe {
            self.playhead_bar.setFrame(NSRect::new(
                NSPoint::new(x, bar_bottom),
                NSSize::new(PLAYHEAD_WIDTH, bar_h),
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Lane construction
// ---------------------------------------------------------------------------

/// Handles owned by a single lane — the outer container, the chip NSBox,
/// the name label, and one clip-bar NSBox per Track.clip.  Held across
/// `new` → `relayout` → lifetime so the positioning pass can place every
/// sub-element without reaching into NSView's subview list.
struct LaneHandles {
    container: Retained<NSBox>,
    chip: Retained<NSBox>,
    name_label: Retained<NSTextField>,
    /// One clip-bar per Track.clip.  For skeletons we split the available
    /// width evenly so multi-clip tracks read distinct.  v1.22 replaces
    /// even-split with begin/end expression evaluation.
    clips: Vec<Retained<NSBox>>,
}

impl LaneHandles {
    /// Position every subview within the given lane frame.  Called from
    /// [`TimelineView::relayout`] — keeps lane-internal arithmetic local so
    /// rows can move as a unit.
    fn position(&self, frame: NSRect) {
        // Container
        unsafe { self.container.setFrame(frame) };

        // Chip — fixed 20×20 on the left with a 6 px gutter.
        let chip_y = (LANE_HEIGHT - LANE_CHIP_SIZE) / 2.0;
        unsafe {
            self.chip.setFrame(NSRect::new(
                NSPoint::new(6.0, chip_y),
                NSSize::new(LANE_CHIP_SIZE, LANE_CHIP_SIZE),
            ));
        }

        // Name label — starts after the chip, ends at the gutter boundary.
        let name_x = 6.0 + LANE_CHIP_SIZE + 10.0;
        let name_w = (LANE_LEFT_GUTTER - name_x).max(40.0);
        unsafe {
            self.name_label.setFrame(NSRect::new(
                NSPoint::new(name_x, (LANE_HEIGHT - 14.0) / 2.0),
                NSSize::new(name_w, 14.0),
            ));
        }

        // Clip bars — even split across remaining width.
        let bar_y = (LANE_HEIGHT - CLIP_BAR_HEIGHT) / 2.0;
        let bar_zone_x = LANE_LEFT_GUTTER;
        let bar_zone_w = (frame.size.width - LANE_LEFT_GUTTER - 10.0).max(10.0);
        let n = self.clips.len().max(1) as f64;
        let per_w = bar_zone_w / n;
        for (i, clip) in self.clips.iter().enumerate() {
            let i_f = i as f64;
            let x = bar_zone_x + i_f * per_w + CLIP_INNER_MARGIN;
            let w = (per_w - CLIP_INNER_MARGIN * 2.0).max(2.0);
            unsafe {
                clip.setFrame(NSRect::new(
                    NSPoint::new(x, bar_y),
                    NSSize::new(w, CLIP_BAR_HEIGHT),
                ));
            }
        }
    }
}

/// Build a single lane's subtree.  Outer NSBox provides the tinted row bg +
/// corner radius; children are a kind-chip NSBox with a centred letter, the
/// name NSTextField, and one clip-bar NSBox per Track.clip.  No clicks are
/// wired — v1.19 timeline is read-only.
fn build_lane(mtm: MainThreadMarker, track: &crate::source::Track) -> LaneHandles {
    let style = classify(&track.kind);

    // Outer container — rounded lane row.
    let container: Retained<NSBox> = unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(
            alloc,
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, LANE_HEIGHT)),
        );
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(NSBorderType::NSNoBorder);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        b.setFillColor(&color::lane_bg());
        b.setCornerRadius(5.0);
        b
    };

    // Kind chip — 20×20 rounded square with accent-tinted bg.
    let chip: Retained<NSBox> = unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(
            alloc,
            NSRect::new(
                NSPoint::new(0.0, 0.0),
                NSSize::new(LANE_CHIP_SIZE, LANE_CHIP_SIZE),
            ),
        );
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(NSBorderType::NSNoBorder);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        b.setFillColor(&style.chip_bg());
        b.setCornerRadius(4.0);
        b
    };
    let chip_letter = make_label(
        mtm,
        style.letter(),
        &style.accent(),
        unsafe { NSFont::boldSystemFontOfSize(10.0) },
        NSTextAlignment::Center,
    );
    unsafe {
        chip_letter.setFrame(NSRect::new(
            NSPoint::new(0.0, 2.0),
            NSSize::new(LANE_CHIP_SIZE, LANE_CHIP_SIZE - 4.0),
        ));
        chip.addSubview(&chip_letter);
    }

    // Name label.
    let name = lane_name(track);
    let name_label = make_label(
        mtm,
        &name,
        &color::text_80(),
        unsafe { NSFont::systemFontOfSize(11.0) },
        NSTextAlignment::Left,
    );

    // Clip bars — at minimum one so an empty-clips Track still shows a row.
    let clip_count = track.clips.len().max(1);
    let clips: Vec<Retained<NSBox>> = (0..clip_count)
        .map(|_| unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(
                alloc,
                NSRect::new(
                    NSPoint::new(0.0, 0.0),
                    NSSize::new(1.0, CLIP_BAR_HEIGHT),
                ),
            );
            b.setBoxType(NSBoxType::NSBoxCustom);
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSLineBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&style.clip_fill());
            b.setBorderColor(&style.accent());
            b.setCornerRadius(3.0);
            b
        })
        .collect();

    // Attach chip + name + clips to the lane container.
    unsafe {
        container.addSubview(chip.as_super());
        container.addSubview(&name_label);
        for clip in &clips {
            container.addSubview(clip.as_super());
        }
    }

    LaneHandles {
        container,
        chip,
        name_label,
        clips,
    }
}

// ---------------------------------------------------------------------------
// Small construction helpers (mirror those in topbar.rs)
// ---------------------------------------------------------------------------

/// Build a non-editable NSTextField label with the given text / colour /
/// font.
fn make_label(
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

/// Build a mini-chip NSTextField — used for the header right-side info
/// bits ("3 tracks", "skeleton · 不交互").  Chips are NSTextField
/// instances whose background is painted via the field's own
/// `drawsBackground` flag; we fake the CSS chip appearance with the
/// `rgba(255,255,255,0.04)` fill and let the default label bezel handle
/// the soft inset border.
fn make_chip_label(mtm: MainThreadMarker, text: &str) -> Retained<NSTextField> {
    unsafe {
        let ns = NSString::from_str(text);
        let label = NSTextField::labelWithString(&ns, mtm);
        let font = NSFont::monospacedSystemFontOfSize_weight(10.0, 0.0);
        label.setFont(Some(&font));
        label.setTextColor(Some(&color::text_50()));
        label.setAlignment(NSTextAlignment::Center);
        label.setBackgroundColor(Some(&color::chip_bg()));
        label.setDrawsBackground(true);
        label.setBordered(false);
        label.setBezeled(false);
        label.setEditable(false);
        label.setSelectable(false);
        label
    }
}

/// Format the five ruler-tick labels (0 / 25 / 50 / 75 / 100 %) given a
/// total duration in milliseconds.  When `total_ms == 0` we emit short
/// percentage placeholders because the integrator hasn't yet wired a
/// resolved duration — the visual still shows five evenly-spaced ticks
/// which is the important part.  Non-zero totals render as whole-second
/// labels (`"53s" / "106s" / "159s" / "212s"`), matching the
/// sample-preview ruler.
fn format_ruler_labels(total_ms: u64) -> [String; 5] {
    if total_ms == 0 {
        return [
            "0".to_string(),
            "25%".to_string(),
            "50%".to_string(),
            "75%".to_string(),
            "100%".to_string(),
        ];
    }
    let total_s = total_ms as f64 / 1000.0;
    let mk = |r: f64| -> String {
        let s = (total_s * r).round() as u64;
        format!("{s}s")
    };
    [
        "0s".to_string(),
        mk(0.25),
        mk(0.50),
        mk(0.75),
        mk(1.00),
    ]
}

// ---------------------------------------------------------------------------
// Unit tests — pure logic only (NSView construction requires main thread +
// AppKit, so structural tests live here and visual tests are covered by the
// T-07 verify script that launches the real window).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_track(kind: &str, id: &str, clip_count: usize) -> crate::source::Track {
        crate::source::Track {
            id: id.to_string(),
            kind: kind.to_string(),
            src: "inline".to_string(),
            clips: (0..clip_count)
                .map(|i| crate::source::Clip {
                    id: Some(format!("c{i}")),
                    begin: "0s".to_string(),
                    end: "1s".to_string(),
                    params: serde_json::Value::Null,
                })
                .collect(),
        }
    }

    #[test]
    fn classify_covers_every_official_kind() {
        // Seven official track kinds from `src/nf-tracks/official/*.js`
        // plus the `overlay` shell convention.  Each must resolve to a
        // known LaneStyle; an exhaustive match prevents silent drift if
        // the classifier later drops a kind.
        assert_eq!(classify("bg"), LaneStyle::V);
        assert_eq!(classify("overlay"), LaneStyle::V);
        assert_eq!(classify("scene"), LaneStyle::T);
        assert_eq!(classify("chart"), LaneStyle::D);
        assert_eq!(classify("data"), LaneStyle::D);
        assert_eq!(classify("video"), LaneStyle::D);
        assert_eq!(classify("audio"), LaneStyle::A);
        assert_eq!(classify("subtitle"), LaneStyle::A);
    }

    #[test]
    fn classify_unknown_falls_back_to_v() {
        // Unknown kinds should not panic — they render as a purple lane so
        // a new track type added mid-version still shows up instead of
        // erroring out.  This matters because `source.json` is
        // user-authored and may contain experimental kinds the shell
        // hasn't been taught yet.
        assert_eq!(classify(""), LaneStyle::V);
        assert_eq!(classify("future-kind"), LaneStyle::V);
    }

    #[test]
    fn lane_style_letters_are_single_char() {
        // Each style letter must be exactly one character — the chip is
        // 20×20 and larger strings would overflow the rounded square.
        for style in [LaneStyle::V, LaneStyle::T, LaneStyle::D, LaneStyle::A] {
            assert_eq!(style.letter().chars().count(), 1);
        }
    }

    #[test]
    fn lane_name_includes_kind_and_id() {
        let t = make_track("video", "pip-1", 1);
        let name = lane_name(&t);
        assert!(name.contains("video"));
        assert!(name.contains("pip-1"));
    }

    #[test]
    fn constants_match_sample_preview_css() {
        // Guard against accidental drift between the Rust constants and
        // the `.timeline` CSS in
        // `spec/versions/v1.19/kickoff/sample-preview.html`.  If
        // sample-preview changes, this test must be updated in the same
        // commit as the CSS so the visual contract stays explicit.
        assert!((TIMELINE_HEIGHT - 240.0).abs() < f64::EPSILON);
        assert!((LANE_HEIGHT - 32.0).abs() < f64::EPSILON);
        assert!((CLIP_BAR_HEIGHT - 18.0).abs() < f64::EPSILON);
        assert!((PLAYHEAD_WIDTH - 1.5).abs() < f64::EPSILON);
    }
}
