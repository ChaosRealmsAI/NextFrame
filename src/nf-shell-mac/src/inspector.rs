//! Inspector NSView · 320 px · shell 层 · read-only
//!
//! Visual spec (mirror of `spec/versions/v1.19/kickoff/sample-preview.html`
//! `.inspector` CSS segment):
//!
//! ```text
//! ┌─── 320 px ──────────────┐
//! │ Inspector     read-only │  ← insp-head (12/10 px padding, border-bottom)
//! ├─────────────────────────┤
//! │  viewport    16:9 · 3840×2160
//! │  duration    212.0s
//! │  fps         59
//! │  mode        play
//! │  ─────────────────────
//! │  Tracks（shell 解析）
//! │  bg · gradient    V
//! │  scene · hero     T
//! │  video · PIP      D
//! │  ─────────────────────
//! │  Runtime（画面层）
//! │  host          WKWebView
//! │  runtime.js    embedded
//! │  source        direct inject
//! │
//! │  ● shell skeleton · v1.19
//! │
//! │  ┌─ v1.19 scope ──────┐
//! │  │ shell 4 panel ...  │
//! │  └────────────────────┘
//! └─────────────────────────┘
//! ```
//!
//! ## Layering (ADR-057)
//!
//! Inspector is **pure shell NSView** — it never touches the web view host
//! or its JS evaluation APIs.  It reads the loaded [`Source`] struct
//! (deserialised from `source.json` by T-02 `source.rs`) and renders static
//! NSTextField rows.  The `update_source` method is currently a string-
//! replacement stub kept so that v1.22 (edit-mode) can wire real source
//! mutation without breaking the constructor contract.
//!
//! ## Why frame-based layout (not autolayout)
//!
//! Rows are fixed 20 px tall in a known column order; positions are pure
//! arithmetic on [`ROW_HEIGHT`] and section offsets.  Autolayout would add
//! constraint ceremony with no benefit for a 320 px-wide read-only panel.
//! Mirrors the approach taken in `topbar.rs` (T-05).
//!
//! ## Fonts + colours
//!
//! Colour tokens are duplicated locally (rather than `pub use`-d from
//! `topbar.rs`) because `topbar::color` is a private module.  Values come
//! from the same `sample-preview.html :root` custom properties so the
//! panels read as a cohesive "glass" surface.

#![allow(non_snake_case)]

use objc2::rc::Retained;
use objc2::ClassType;
use objc2_app_kit::{
    NSBox, NSBoxType, NSColor, NSFont, NSTextAlignment, NSTextField, NSTitlePosition, NSView,
    NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView,
};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

use crate::source::{Source, Track};

// ---------------------------------------------------------------------------
// Design tokens (mirror of sample-preview.html :root)
// ---------------------------------------------------------------------------
//
// Kept local rather than shared with `topbar::color` because that module is
// private.  Once a `tokens.css` → Rust codegen lands (ADR pipeline) these
// call sites will swap to generated constants.

mod color {
    use objc2::rc::Retained;
    use objc2_app_kit::NSColor;

    /// White 1.0 · head "Inspector" title + row values.
    pub fn text_primary() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0) }
    }

    /// `rgba(255,255,255,0.80)` · section h5 title colour.
    pub fn text_section() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.80) }
    }

    /// `rgba(255,255,255,0.65)` · row value colour fallback + note body.
    pub fn text_body() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.65) }
    }

    /// `rgba(255,255,255,0.50)` · row keys (k class in sample).
    pub fn text_key() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.50) }
    }

    /// `rgba(255,255,255,0.35)` · head sub "read-only" uppercase subtitle.
    pub fn text_muted() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.35) }
    }

    /// Green `#34d399` · shell-skeleton insp-tag foreground.
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

    /// Green fill tinted · `rgba(52,211,153,0.10)` · insp-tag background.
    pub fn green_tint() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                52.0 / 255.0,
                211.0 / 255.0,
                153.0 / 255.0,
                0.10,
            )
        }
    }

    /// Green border · `rgba(52,211,153,0.22)` · insp-tag border.
    pub fn green_border() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                52.0 / 255.0,
                211.0 / 255.0,
                153.0 / 255.0,
                0.22,
            )
        }
    }

    /// Accent purple `#a78bfa` · insp-note border / section glyph.
    /// Retained for v1.22 when insp-note adds a glyph accent; not yet
    /// referenced elsewhere in the skeleton.
    #[allow(dead_code)]
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

    /// `rgba(167,139,250,0.06)` · insp-note subtle fill.
    pub fn accent_06() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                0.06,
            )
        }
    }

    /// `rgba(167,139,250,0.20)` · insp-note dashed border.
    pub fn accent_20() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                0.20,
            )
        }
    }

    /// Section divider colour · `rgba(255,255,255,0.05)`.
    pub fn divider() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.05) }
    }

    /// Head bottom border · `rgba(255,255,255,0.04)`.
    pub fn head_divider() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.04) }
    }
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/// Fixed panel width · matches `.inspector { width: 320px }` in sample.
pub const INSPECTOR_WIDTH: f64 = 320.0;

/// Horizontal padding inside the body column (mirrors `.insp-body { padding: 0 14px }`).
const BODY_PAD_X: f64 = 14.0;
/// Vertical padding at the top of the body (below the insp-head).
const BODY_PAD_TOP: f64 = 12.0;

/// Head cluster height · title + bottom divider (mirrors `.insp-head` padding).
const HEAD_HEIGHT: f64 = 40.0;
/// Head horizontal padding.
const HEAD_PAD_X: f64 = 14.0;

/// Standard key/value row height including the dashed separator below it.
const ROW_HEIGHT: f64 = 20.0;
/// Gap before a new section (`.insp-section { margin-top: 12px }`).
const SECTION_GAP: f64 = 12.0;
/// Section title label height.
const SECTION_TITLE_HEIGHT: f64 = 18.0;
/// Gap after a section title before its first row.
const SECTION_TITLE_GAP: f64 = 6.0;

/// Tag pill geometry (`.insp-tag { padding: 3px 8px }`).
const TAG_HEIGHT: f64 = 20.0;
const TAG_GAP_ABOVE: f64 = 10.0;

/// Note box geometry (`.insp-note { padding: 10px 12px; line-height: 1.55 }`).
const NOTE_HEIGHT: f64 = 64.0;
const NOTE_GAP_ABOVE: f64 = 12.0;
const NOTE_PAD_X: f64 = 12.0;
const NOTE_PAD_Y: f64 = 10.0;

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/// Owning handle for the inspector NSView hierarchy.
///
/// Root is an [`NSVisualEffectView`] providing the backdrop blur; all row /
/// section text fields are added directly as subviews laid out from the top
/// of the view downward.  The constructor flips the view's coordinate system
/// (`setFlipped(true)` via an NSBox bounds trick is not possible — NSView
/// does not expose `flipped` in a mutable way on modern AppKit) so we
/// compute y-coordinates from the bottom using the total frame height.
#[allow(dead_code)]
pub struct InspectorView {
    /// Blur-backed root.  Exposed as `&NSView` via [`Self::view`].
    root: Retained<NSVisualEffectView>,
    /// Retained reference to each dynamic value label so `update_source`
    /// can mutate them without rebuilding the view.  Indices correspond to
    /// the "key" rows in the top cluster: 0 viewport, 1 duration, 2 fps,
    /// 3 mode.  Track rows live in [`Self::track_rows`] separately.
    value_labels: Vec<Retained<NSTextField>>,
    /// Track row label pairs (key NSTextField, kind-letter NSTextField).
    /// Cached so v1.22 can refresh on source change.
    track_rows: Vec<(Retained<NSTextField>, Retained<NSTextField>)>,
}

impl InspectorView {
    /// Build the inspector with `frame` as its outer rect.  `source` seeds
    /// every visible row; its width is clamped to [`INSPECTOR_WIDTH`] so
    /// callers can pass the panel's slot rect without overflow.
    ///
    /// `mtm` is required because NSView / NSTextField / NSVisualEffectView
    /// all demand main-thread construction.
    ///
    /// The returned view is **not** added to any superview — the caller
    /// (T-11 `main.rs` / `window.rs`) decides where to attach it.
    pub fn new(frame: NSRect, source: &Source, mtm: MainThreadMarker) -> Self {
        let clamped = NSRect::new(
            frame.origin,
            NSSize::new(INSPECTOR_WIDTH, frame.size.height),
        );

        // Root blur.  `Sidebar` material is visually lighter than the
        // topbar's `HeaderView`; for the inspector that gives a subtly
        // different "shade of glass" matching how `.inspector { .glass }`
        // overlaps the preview panel in the mockup (both dark but the
        // inspector reads as a sidepanel rather than a floating header).
        let root: Retained<NSVisualEffectView> = unsafe {
            let alloc = mtm.alloc::<NSVisualEffectView>();
            let v = NSVisualEffectView::initWithFrame(alloc, clamped);
            v.setMaterial(NSVisualEffectMaterial::Sidebar);
            v.setBlendingMode(NSVisualEffectBlendingMode::WithinWindow);
            v.setState(NSVisualEffectState::Active);
            v
        };

        let total_h = clamped.size.height;

        // Track y-cursor; we draw top-to-bottom in screen terms which in
        // NSView's default (non-flipped) coordinates means we start at
        // `total_h` and decrement.
        let mut y_from_top = 0.0;

        // --- Head: "Inspector" + "read-only" ---------------------------------
        let head_y = total_h - HEAD_HEIGHT;
        let head_title = make_label(
            mtm,
            "Inspector",
            &color::text_primary(),
            unsafe { NSFont::boldSystemFontOfSize(13.0) },
            NSTextAlignment::Left,
        );
        let head_sub = make_label(
            mtm,
            "READ-ONLY",
            &color::text_muted(),
            unsafe { NSFont::systemFontOfSize(10.0) },
            NSTextAlignment::Right,
        );
        unsafe {
            head_title.setFrame(NSRect::new(
                NSPoint::new(HEAD_PAD_X, head_y + 10.0),
                NSSize::new(160.0, 18.0),
            ));
            head_sub.setFrame(NSRect::new(
                NSPoint::new(
                    INSPECTOR_WIDTH - HEAD_PAD_X - 80.0,
                    head_y + 12.0,
                ),
                NSSize::new(80.0, 14.0),
            ));
            root.addSubview(&head_title);
            root.addSubview(&head_sub);
        }

        // Thin divider line under the head.
        let head_divider = make_hairline(
            mtm,
            NSRect::new(
                NSPoint::new(0.0, head_y),
                NSSize::new(INSPECTOR_WIDTH, 1.0),
            ),
            &color::head_divider(),
        );
        unsafe { root.addSubview(head_divider.as_super()) };

        y_from_top += HEAD_HEIGHT;

        // --- Top key/value rows ----------------------------------------------
        // Top cluster starts at (total_h - HEAD - BODY_PAD_TOP).
        let mut cursor_y = total_h - y_from_top - BODY_PAD_TOP;

        let viewport_text = format!(
            "{} · {}×{}",
            source.viewport.ratio, source.viewport.w, source.viewport.h
        );
        // Duration is an expression string in the SSoT schema (e.g.
        // "demo.end"). v1.19 does not evaluate — show the raw string.  The
        // sample-preview demo uses "212.0s" which is a literal numeric
        // expression that happens to render the same whether we evaluate
        // or not.
        let duration_text = source.duration.clone();
        // fps is not part of the SourceRaw SSoT (see src/nf-core-engine
        // types.ts). v1.19 hard-codes "59" to match the v1.8 demo which
        // recorded at 59 fps; v1.22 will either lift this from meta.fps
        // or keep showing "—" when unknown.
        let fps_text = "59".to_string();
        let mode_text = "play".to_string();

        let mut value_labels: Vec<Retained<NSTextField>> = Vec::with_capacity(4);
        for (key, value) in [
            ("viewport", viewport_text.as_str()),
            ("duration", duration_text.as_str()),
            ("fps", fps_text.as_str()),
            ("mode", mode_text.as_str()),
        ] {
            let (k_label, v_label) = push_row(&root, mtm, key, value, cursor_y);
            // Only push the value label; keys never change at runtime.
            let _ = k_label;
            value_labels.push(v_label);
            cursor_y -= ROW_HEIGHT;
        }

        // --- Section: Tracks（shell 解析） -----------------------------------
        cursor_y -= SECTION_GAP;

        let section_divider_a = make_hairline(
            mtm,
            NSRect::new(
                NSPoint::new(BODY_PAD_X, cursor_y + SECTION_GAP / 2.0),
                NSSize::new(INSPECTOR_WIDTH - BODY_PAD_X * 2.0, 1.0),
            ),
            &color::divider(),
        );
        unsafe { root.addSubview(section_divider_a.as_super()) };

        let title_tracks = make_label(
            mtm,
            "Tracks（shell 解析）",
            &color::text_section(),
            unsafe { NSFont::boldSystemFontOfSize(12.0) },
            NSTextAlignment::Left,
        );
        unsafe {
            title_tracks.setFrame(NSRect::new(
                NSPoint::new(BODY_PAD_X, cursor_y - SECTION_TITLE_HEIGHT),
                NSSize::new(INSPECTOR_WIDTH - BODY_PAD_X * 2.0, SECTION_TITLE_HEIGHT),
            ));
            root.addSubview(&title_tracks);
        }
        cursor_y -= SECTION_TITLE_HEIGHT + SECTION_TITLE_GAP;

        let mut track_rows: Vec<(Retained<NSTextField>, Retained<NSTextField>)> =
            Vec::with_capacity(source.tracks.len());
        for track in &source.tracks {
            let label_text = format!("{} · {}", track.id, track.kind);
            let kind_letter = kind_to_letter(&track.kind);
            let (k_label, v_label) = push_row(
                &root,
                mtm,
                label_text.as_str(),
                kind_letter,
                cursor_y,
            );
            track_rows.push((k_label, v_label));
            cursor_y -= ROW_HEIGHT;
        }

        // --- Section: Runtime（画面层） --------------------------------------
        cursor_y -= SECTION_GAP;

        let section_divider_b = make_hairline(
            mtm,
            NSRect::new(
                NSPoint::new(BODY_PAD_X, cursor_y + SECTION_GAP / 2.0),
                NSSize::new(INSPECTOR_WIDTH - BODY_PAD_X * 2.0, 1.0),
            ),
            &color::divider(),
        );
        unsafe { root.addSubview(section_divider_b.as_super()) };

        let title_runtime = make_label(
            mtm,
            "Runtime（画面层）",
            &color::text_section(),
            unsafe { NSFont::boldSystemFontOfSize(12.0) },
            NSTextAlignment::Left,
        );
        unsafe {
            title_runtime.setFrame(NSRect::new(
                NSPoint::new(BODY_PAD_X, cursor_y - SECTION_TITLE_HEIGHT),
                NSSize::new(INSPECTOR_WIDTH - BODY_PAD_X * 2.0, SECTION_TITLE_HEIGHT),
            ));
            root.addSubview(&title_runtime);
        }
        cursor_y -= SECTION_TITLE_HEIGHT + SECTION_TITLE_GAP;

        // Runtime section is hard-coded — it reflects the *architecture*
        // (ADR-057) not runtime-queryable state.  If the web-view host is
        // ever swapped for a custom compositor the strings change here,
        // not via source.json.
        for (key, value) in [
            ("host", "WKWebView"),
            ("runtime.js", "embedded"),
            ("source", "direct inject"),
        ] {
            let _ = push_row(&root, mtm, key, value, cursor_y);
            cursor_y -= ROW_HEIGHT;
        }

        // --- Green status tag ------------------------------------------------
        cursor_y -= TAG_GAP_ABOVE;
        let tag_frame = NSRect::new(
            NSPoint::new(BODY_PAD_X, cursor_y - TAG_HEIGHT),
            NSSize::new(190.0, TAG_HEIGHT),
        );
        let tag_box: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(alloc, tag_frame);
            b.setBoxType(NSBoxType::NSBoxCustom);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::green_tint());
            b.setBorderColor(&color::green_border());
            b.setBorderWidth(1.0);
            b.setCornerRadius(4.0);
            b
        };
        let tag_label = make_label(
            mtm,
            "● shell skeleton · v1.19",
            &color::green(),
            unsafe { NSFont::systemFontOfSize(10.0) },
            NSTextAlignment::Left,
        );
        unsafe {
            tag_label.setFrame(NSRect::new(
                NSPoint::new(8.0, 3.0),
                NSSize::new(tag_frame.size.width - 16.0, tag_frame.size.height - 6.0),
            ));
            tag_box.addSubview(&tag_label);
            root.addSubview(tag_box.as_super());
        }
        cursor_y -= TAG_HEIGHT;

        // --- Purple dashed-border note box ----------------------------------
        cursor_y -= NOTE_GAP_ABOVE;
        let note_frame = NSRect::new(
            NSPoint::new(BODY_PAD_X, cursor_y - NOTE_HEIGHT),
            NSSize::new(INSPECTOR_WIDTH - BODY_PAD_X * 2.0, NOTE_HEIGHT),
        );
        // NSBox cannot render a dashed border natively (NSBorderType only
        // has line / bezel / groove).  The approximation: solid thin border
        // tinted with accent_20, plus the accent_06 fill — the eye reads
        // this as the "hint" boxed area even without literal dashes.  If a
        // dashed outline becomes mandatory later, we'll add a CAShapeLayer
        // overlay; that's v1.22 polish, not v1.19 skeleton scope.
        let note_box: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(alloc, note_frame);
            b.setBoxType(NSBoxType::NSBoxCustom);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::accent_06());
            b.setBorderColor(&color::accent_20());
            b.setBorderWidth(1.0);
            b.setCornerRadius(6.0);
            b
        };
        // Two lines of body text — sample shows "<b>v1.19 scope</b>\n shell 4
        // panel · 内嵌 runtime 渲染画面\n Inspector 只读 · 编辑交互 → v1.22/v1.23".
        // We inline the strong prefix as a separate heavier label so the
        // hierarchy reads correctly without pulling NSAttributedString yet.
        let note_title = make_label(
            mtm,
            "v1.19 scope",
            &color::text_primary(),
            unsafe { NSFont::boldSystemFontOfSize(11.0) },
            NSTextAlignment::Left,
        );
        let note_line1 = make_label(
            mtm,
            "shell 4 panel · 内嵌 runtime 渲染画面",
            &color::text_body(),
            unsafe { NSFont::systemFontOfSize(11.0) },
            NSTextAlignment::Left,
        );
        let note_line2 = make_label(
            mtm,
            "Inspector 只读 · 编辑交互 → v1.22/v1.23",
            &color::text_body(),
            unsafe { NSFont::systemFontOfSize(11.0) },
            NSTextAlignment::Left,
        );
        let inner_w = note_frame.size.width - NOTE_PAD_X * 2.0;
        unsafe {
            note_title.setFrame(NSRect::new(
                NSPoint::new(NOTE_PAD_X, NOTE_HEIGHT - NOTE_PAD_Y - 14.0),
                NSSize::new(inner_w, 14.0),
            ));
            note_line1.setFrame(NSRect::new(
                NSPoint::new(NOTE_PAD_X, NOTE_HEIGHT - NOTE_PAD_Y - 14.0 - 16.0),
                NSSize::new(inner_w, 14.0),
            ));
            note_line2.setFrame(NSRect::new(
                NSPoint::new(NOTE_PAD_X, NOTE_HEIGHT - NOTE_PAD_Y - 14.0 - 16.0 * 2.0),
                NSSize::new(inner_w, 14.0),
            ));
            note_box.addSubview(&note_title);
            note_box.addSubview(&note_line1);
            note_box.addSubview(&note_line2);
            root.addSubview(note_box.as_super());
        }

        Self {
            root,
            value_labels,
            track_rows,
        }
    }

    /// Borrow the root view as a plain `&NSView` for caller attachment.
    pub fn view(&self) -> &NSView {
        // `NSVisualEffectView::Super == NSView` (with `NSResponder` above);
        // one `as_super` hop yields the `&NSView` consumers want.
        self.root.as_super()
    }

    /// Re-apply values from a new [`Source`].  v1.19 keeps view hierarchy
    /// intact — only mutates the four top-cluster values and the existing
    /// track rows (same count expected; mismatches are silently truncated
    /// for skeleton behaviour).  v1.22 will rebuild track rows properly
    /// when source shape changes.
    pub fn update_source(&mut self, source: &Source) {
        // Top cluster: viewport / duration / fps / mode.
        let texts = [
            format!(
                "{} · {}×{}",
                source.viewport.ratio, source.viewport.w, source.viewport.h
            ),
            source.duration.clone(),
            "59".to_string(),
            "play".to_string(),
        ];
        for (label, text) in self.value_labels.iter().zip(texts.iter()) {
            unsafe {
                let ns = NSString::from_str(text);
                label.setStringValue(&ns);
            }
        }
        // Track rows · pair-wise update in whatever overlap exists.  If
        // source.tracks.len() differs from the cached row count we only
        // touch the common prefix; v1.22 takes care of dynamic rebuild.
        for ((k_label, v_label), track) in self.track_rows.iter().zip(source.tracks.iter()) {
            let text = format!("{} · {}", track.id, track.kind);
            let letter = kind_to_letter(&track.kind);
            unsafe {
                k_label.setStringValue(&NSString::from_str(&text));
                v_label.setStringValue(&NSString::from_str(letter));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Private construction helpers
// ---------------------------------------------------------------------------

/// Build an NSTextField label configured as a non-editable / non-selectable
/// transparent-background text span with the given text, colour, font, and
/// alignment.  Mirrors the helper in `topbar.rs` — duplicated rather than
/// shared because the topbar module is private and lifting these helpers
/// into a shared `views/` module is a v1.22 cleanup (T-05 + T-08 are the
/// only consumers today).
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

/// Build a 1 px hairline NSBox at the given frame filled with `color` · used
/// for the head divider and per-section separators.
fn make_hairline(
    mtm: MainThreadMarker,
    frame: NSRect,
    color: &NSColor,
) -> Retained<NSBox> {
    unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(alloc, frame);
        b.setBoxType(NSBoxType::NSBoxCustom);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        b.setFillColor(color);
        b.setBorderWidth(0.0);
        b.setCornerRadius(0.0);
        b
    }
}

/// Append a single key/value row to `root` at the given baseline-top y.  The
/// row occupies `[BODY_PAD_X, INSPECTOR_WIDTH - BODY_PAD_X]` horizontally;
/// key is left-aligned in SF-Mono 11 px with [`color::text_key`], value is
/// right-aligned in the same font with [`color::text_primary`].  Returns
/// `(key_label, value_label)` so callers can retain them for later mutation.
fn push_row(
    root: &NSVisualEffectView,
    mtm: MainThreadMarker,
    key: &str,
    value: &str,
    top_y: f64,
) -> (Retained<NSTextField>, Retained<NSTextField>) {
    let mono = unsafe { NSFont::monospacedSystemFontOfSize_weight(11.0, 0.0) };

    let k_label = make_label(
        mtm,
        key,
        &color::text_key(),
        mono.clone(),
        NSTextAlignment::Left,
    );
    let v_label = make_label(
        mtm,
        value,
        &color::text_primary(),
        mono,
        NSTextAlignment::Right,
    );

    let inner_w = INSPECTOR_WIDTH - BODY_PAD_X * 2.0;
    // Split the row 55/45 between key column and value column so longer
    // track names (`bg-gradient · bg`) still fit on one line.
    let key_w = inner_w * 0.55;
    let val_w = inner_w * 0.45;

    let row_bottom = top_y - ROW_HEIGHT + 4.0;
    unsafe {
        k_label.setFrame(NSRect::new(
            NSPoint::new(BODY_PAD_X, row_bottom),
            NSSize::new(key_w, 14.0),
        ));
        v_label.setFrame(NSRect::new(
            NSPoint::new(BODY_PAD_X + key_w, row_bottom),
            NSSize::new(val_w, 14.0),
        ));
        root.addSubview(&k_label);
        root.addSubview(&v_label);
    }
    (k_label, v_label)
}

/// Map a track `kind` string to the single-letter badge shown in the
/// inspector's Tracks section.  Mirrors the `data-kind="V|T|D|A"` mapping
/// in `sample-preview.html` lanes block.
///
/// Unknown kinds render as `"?"` — better than panicking on a future
/// track-kind introduction (e.g. v1.23 `chart` not yet wired).
pub(crate) fn kind_to_letter(kind: &str) -> &'static str {
    match kind {
        "bg" => "V",
        "scene" => "T",
        "video" => "D",
        "audio" => "A",
        // v1.6 chart + v1.8 data tracks — treat as data lane for now; the
        // sample-preview only exercises bg/scene/video, so nothing depends
        // on these two emitting a specific glyph yet.
        "chart" | "data" => "D",
        // v1.13 subtitle track — rendered as text lane.
        "subtitle" => "T",
        _ => "?",
    }
}

#[allow(dead_code)]
fn _ensure_track_used(_t: &Track) {
    // Prevent a false "unused import" warning on `Track` when the code is
    // analysed without descending into `update_source`.  The real use site
    // is there; this stub is a no-op.
}

// ---------------------------------------------------------------------------
// Tests — pure-logic only (NSView / NSTextField need MainThreadMarker)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn width_matches_mockup() {
        assert!((INSPECTOR_WIDTH - 320.0).abs() < f64::EPSILON);
    }

    #[test]
    fn kind_letter_mapping_matches_sample_preview() {
        assert_eq!(kind_to_letter("bg"), "V");
        assert_eq!(kind_to_letter("scene"), "T");
        assert_eq!(kind_to_letter("video"), "D");
        assert_eq!(kind_to_letter("audio"), "A");
    }

    #[test]
    fn kind_letter_unknown_is_question_mark() {
        assert_eq!(kind_to_letter("future-kind"), "?");
        assert_eq!(kind_to_letter(""), "?");
    }

    #[test]
    fn kind_letter_extended_kinds_fallback_sensibly() {
        // chart / data render as D (data lane) per inspector row badge.
        assert_eq!(kind_to_letter("chart"), "D");
        assert_eq!(kind_to_letter("data"), "D");
        assert_eq!(kind_to_letter("subtitle"), "T");
    }

    // Layout constants are validated at compile time via `const { ... }`
    // asserts — clippy flags `assert!(CONST > N)` at runtime as
    // `assertions_on_constants` because the value never changes.  Forcing
    // these into const blocks turns the lint off while still catching a
    // typo on the next `cargo check`.
    const _: () = {
        // Row height must fit at least the mono 11 px line + 4 px padding.
        assert!(ROW_HEIGHT >= 14.0);
        // Section gap ≥ title-gap so visual hierarchy reads correctly.
        assert!(SECTION_GAP > SECTION_TITLE_GAP);
        // Head must hold a 13 px bold title + 12 px padding.
        assert!(HEAD_HEIGHT >= 32.0);
    };
}
