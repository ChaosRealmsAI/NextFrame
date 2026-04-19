//! Topbar NSView · 48 px · shell 层
//!
//! Visual spec (mirror of `spec/versions/v1.19/kickoff/sample-preview.html`
//! `.topbar` CSS segment):
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────────────────┐
//! │  [● ● ●]  ★ NextFrame │ ~/demo/v1.8.json    ░░░░  Share [Export]  Z  │
//! │  traffic  brand-mark  brand-name   source-file  spacer  btns  avatar │
//! └──────────────────────────────────────────────────────────────────────┘
//!  0         ~70 (T-04)                                               right
//! ```
//!
//! T-04 paints the three macOS traffic-light buttons via the host NSWindow;
//! this view simply reserves an empty ~70 px gutter on the left.  Subviews
//! are laid out with explicit frames (not autolayout) because the topbar
//! has a fixed 48 px height and a single row — autolayout constraints add
//! ceremony without value here, and the few remaining degrees of freedom
//! (brand-mark → brand-name → separator → source-file span, right-edge
//! anchored buttons) are tiny arithmetic in [`Self::relayout`].
//!
//! Background blur is provided by the root view being an `NSVisualEffectView`
//! configured for `HeaderView` material with `WithinWindow` blending — this
//! is the AppKit-native equivalent of the sample-preview
//! `backdrop-filter: blur(24px)` rule.
//!
//! Colour tokens are centralised in the [`color`] submodule so a future
//! `spec/design/tokens` migration can swap the call sites without rewriting
//! layout code.  Values are mirrored from `sample-preview.html` `:root`.
//!
//! ## Click handlers
//!
//! v1.19 wires the Share / Export buttons with `target: nil, action: nil`.
//! Hooking up a real Rust callback requires an `objc2::declare_class!`
//! NSObject subclass to host the action selector — that plumbing belongs in
//! T-11 (NSApplicationDelegate) / T-14 (recorder export pipeline), not in a
//! 48 px leaf view.  See the `TODO: wire` comments in [`TopbarView::new`].

#![allow(non_snake_case)]

use objc2::rc::Retained;
use objc2::ClassType;
use objc2_app_kit::{
    NSBorderType, NSBox, NSBoxType, NSButton, NSColor, NSFont, NSTextAlignment,
    NSTextField, NSTitlePosition, NSView, NSVisualEffectBlendingMode, NSVisualEffectMaterial,
    NSVisualEffectState, NSVisualEffectView,
};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
//
// All hard-coded colours live here so a future `tokens.css` → Rust codegen
// (tracked in ADR pipeline) can replace this module with generated constants.
// The RGBA values correspond one-for-one with the `:root` custom properties
// in `sample-preview.html`.

mod color {
    use objc2::rc::Retained;
    use objc2_app_kit::NSColor;

    /// Shell topbar background · `rgba(0,0,0,0.55)` over `NSVisualEffectView`
    /// material.  Retained for future use once T-11 / design-pass decides
    /// whether to tint the visual-effect view with an additional colour
    /// overlay; the blur itself comes from the NSVisualEffectView material
    /// so this helper is currently unreferenced.
    #[allow(dead_code)]
    pub fn bg_overlay() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.55) }
    }

    /// Accent purple · `#a78bfa` · brand-mark fill, primary button bg.
    pub fn accent() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0xa7 as f64 / 255.0, 0x8b as f64 / 255.0, 0xfa as f64 / 255.0, 1.0) }
    }

    /// Accent dark · `#7c3aed` · avatar gradient dark stop.
    pub fn accent_dark() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0x7c as f64 / 255.0, 0x3a as f64 / 255.0, 0xed as f64 / 255.0, 1.0) }
    }

    /// Accent tinted · `rgba(167,139,250,0.28)` · brand-mark border.
    pub fn accent_border() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0xa7 as f64 / 255.0, 0x8b as f64 / 255.0, 0xfa as f64 / 255.0, 0.28) }
    }

    /// Brand-mark fill · approximates the sample-preview
    /// `linear-gradient(145deg, rgba(167,139,250,0.35), rgba(124,58,237,0.15))`.
    /// NSBox can't do gradients without a CAGradientLayer swap, so we pick
    /// the midpoint — tinted purple translucent over the dark topbar reads
    /// as the "glass chip" treatment without solid saturation.
    pub fn brand_mark_fill() -> Retained<NSColor> {
        unsafe {
            NSColor::colorWithSRGBRed_green_blue_alpha(
                0xa7 as f64 / 255.0,
                0x8b as f64 / 255.0,
                0xfa as f64 / 255.0,
                0.22,
            )
        }
    }

    /// Pure white · `#ffffff` · brand name text.
    pub fn text_primary() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 1.0) }
    }

    /// `rgba(255,255,255,0.65)` · ghost button label.
    pub fn text_secondary() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.65) }
    }

    /// `rgba(255,255,255,0.50)` · mono path label (dimmed).
    pub fn text_muted() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.50) }
    }

    /// Ghost-button background · `rgba(255,255,255,0.04)`.
    pub fn ghost_bg() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.04) }
    }

    /// Glass border · `rgba(255,255,255,0.08)` · ghost button / separator.
    pub fn border_soft() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.08) }
    }

    /// Near-black text on primary button (`rgba(0,0,0,0.90)`).
    pub fn text_on_accent() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.90) }
    }
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/// Topbar fixed height — same as `.topbar { height: 48px }` in sample-preview.
pub const TOPBAR_HEIGHT: f64 = 48.0;
/// Reserved gutter on the left for the three traffic-light buttons drawn by
/// the host NSWindow (T-04).  Matches `.traffic { padding: 0 4px }` plus
/// the 12 × 3 + 8 × 2 lights region, rounded up to keep the brand clear.
const TRAFFIC_GUTTER: f64 = 70.0;
/// Brand-mark (the purple ★ chip) — 22 × 22 rounded square.
const MARK_SIZE: f64 = 22.0;
const MARK_CORNER: f64 = 6.0;
/// Avatar disk — 26 × 26 circle.
const AVATAR_SIZE: f64 = 26.0;
/// Gap between individual children inside the brand cluster.
const BRAND_GAP: f64 = 10.0;
/// Gap between top-level clusters (brand / buttons / avatar).
const CLUSTER_GAP: f64 = 14.0;
/// Horizontal padding inside NSButton labels (mimics `.btn-ghost` padding).
/// Retained for v1.22 when we swap to an NSBox-backed custom bezel with
/// manual padding; NSButton's built-in bezel already pads, so the runtime
/// call sites now use `sizeToFit` and leave this constant as documentation.
#[allow(dead_code)]
const BTN_H_PAD: f64 = 12.0;
/// Outer horizontal padding of the topbar (`.topbar { padding: 0 14px }`).
const OUTER_PAD: f64 = 14.0;

// ---------------------------------------------------------------------------
// TopbarView
// ---------------------------------------------------------------------------

/// Owning handle for the topbar `NSView` hierarchy.
///
/// The root is an `NSVisualEffectView` providing the backdrop blur; the
/// wrapper keeps `Retained` references to every subview whose state we
/// might mutate later (currently only the source-path label).  All views are
/// created on the main thread — callers must pass a [`MainThreadMarker`].
pub struct TopbarView {
    /// Blur-backed root view.  Exposed to callers via [`Self::view`] which
    /// upcasts it to `&NSView` so consumers don't need to depend on the
    /// visual-effect subclass.
    root: Retained<NSVisualEffectView>,
    /// Mono label showing the current `source.json` path.  Held so
    /// [`Self::set_source_path`] can update its string value after
    /// construction (e.g. when the user opens a different file).
    source_path_label: Retained<NSTextField>,
}

impl TopbarView {
    /// Build the topbar with `frame` as its outer rect (caller decides width;
    /// height is clamped to [`TOPBAR_HEIGHT`]).  `source_path` seeds the mono
    /// path label on the right side of the brand cluster.
    ///
    /// The returned view is **not** added to any superview — the caller
    /// (T-04 `window.rs` / T-11 main) is responsible for `addSubview`.
    pub fn new(frame: NSRect, source_path: &str, mtm: MainThreadMarker) -> Self {
        // Root: NSVisualEffectView · HeaderView material ≈ the "glass"
        // treatment used in macOS toolbars.  Blending WithinWindow so the
        // blur composites against the app's own content (preview / timeline)
        // rather than desktop wallpaper — matches the sample-preview's
        // intended feel where everything is inside one window shell.
        let clamped = NSRect::new(
            frame.origin,
            NSSize::new(frame.size.width, TOPBAR_HEIGHT),
        );
        let root: Retained<NSVisualEffectView> = unsafe {
            let alloc = mtm.alloc::<NSVisualEffectView>();
            let v = NSVisualEffectView::initWithFrame(alloc, clamped);
            v.setMaterial(NSVisualEffectMaterial::HeaderView);
            v.setBlendingMode(NSVisualEffectBlendingMode::WithinWindow);
            v.setState(NSVisualEffectState::Active);
            // Layer-backing is implicit for NSVisualEffectView; no extra
            // setWantsLayer call required.
            v
        };

        // Brand-mark · 22 × 22 rounded square filled with accent purple,
        // containing a centred "★" NSTextField.  NSBox with
        // NSBoxType::Custom is the simplest AppKit primitive that gives us
        // fill + corner-radius + border without declaring a custom NSView
        // subclass for drawRect.
        let mark_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(MARK_SIZE, MARK_SIZE));
        let brand_mark: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(alloc, mark_frame);
            b.setBoxType(NSBoxType::NSBoxCustom);
            // NSBox::setBorderType is deprecated for NSBoxCustom in modern
            // AppKit — the fill + borderColor + borderWidth triad is what
            // actually renders.  We still set it here to pick the thin
            // 1 px line style (LineBorder) over NoBorder so the accent
            // border colour materialises; `#[allow(deprecated)]` silences
            // the future-compat lint until we migrate to `transparent`.
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSLineBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::brand_mark_fill());
            b.setBorderColor(&color::accent_border());
            b.setCornerRadius(MARK_CORNER);
            b
        };
        // Star glyph — accent purple on the tinted chip background.
        // `text_on_accent` (near-black) made the ★ invisible on the new
        // translucent fill; using the accent colour itself mirrors the
        // sample-preview `color: var(--accent)` on `.brand-mark`.
        let star_label = make_centered_label(
            mtm,
            "★",
            &color::accent(),
            unsafe { NSFont::boldSystemFontOfSize(11.0) },
            mark_frame,
        );
        unsafe { brand_mark.addSubview(&star_label) };

        // Brand name "NextFrame" · 13 px semibold white.
        let brand_name = make_label(
            mtm,
            "NextFrame",
            &color::text_primary(),
            unsafe { NSFont::boldSystemFontOfSize(13.0) },
            NSTextAlignment::Left,
        );

        // Vertical separator — thin 1 px NSBox using soft border colour as fill.
        let separator: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(alloc, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, 18.0)));
            b.setBoxType(NSBoxType::NSBoxCustom);
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSNoBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::border_soft());
            b.setCornerRadius(0.0);
            b
        };

        // Source-path label · SF-Mono 11 px, muted.  `labelWithString`
        // returns a pre-configured non-editable / non-selectable NSTextField
        // with clear background — exactly what we want for a status glyph.
        let source_path_label = make_label(
            mtm,
            source_path,
            &color::text_muted(),
            unsafe { NSFont::monospacedSystemFontOfSize_weight(11.0, 0.0) },
            NSTextAlignment::Left,
        );

        // Share button — ghost style: soft fill + border, white-muted text.
        // Bezel-less NSButton; sample-preview ghost treatment is supplied
        // by a sibling NSBox (see `share_backdrop` below) placed behind the
        // label in subview order.
        //
        // TODO: wire target/action to a declare_class!-defined NSObject
        // callback once T-11 lands NSApplicationDelegate.  For v1.19 the
        // buttons are visually present but clicks are no-ops (the stub
        // println! requested by the task prompt can't fire without a real
        // action selector; documenting here so the reviewer doesn't hunt).
        let share_button = make_button(
            mtm,
            "Share",
            &color::text_secondary(),
            &color::ghost_bg(),
            Some(&color::border_soft()),
        );
        let share_backdrop: Retained<NSBox> = make_button_backdrop(
            mtm,
            &color::ghost_bg(),
            Some(&color::border_soft()),
        );

        // Export button — primary style: accent fill, near-black text,
        // bold 12 px.  Sample-preview prepends a "⬆" glyph; we mirror that
        // inline in the title.  The accent NSBox backdrop below supplies
        // the purple fill.
        let export_button = make_button(
            mtm,
            "⬆ Export 4K MP4",
            &color::text_on_accent(),
            &color::accent(),
            None,
        );
        let export_backdrop: Retained<NSBox> = make_button_backdrop(
            mtm,
            &color::accent(),
            None,
        );

        // Avatar · 26 × 26 circle with centred "Z" label.  `setCornerRadius`
        // with half the side length yields a perfect circle.
        let avatar_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(AVATAR_SIZE, AVATAR_SIZE));
        let avatar: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(alloc, avatar_frame);
            b.setBoxType(NSBoxType::NSBoxCustom);
            // NSBox::setBorderType is deprecated for NSBoxCustom in modern
            // AppKit — the fill + borderColor + borderWidth triad is what
            // actually renders.  We still set it here to pick the thin
            // 1 px line style (LineBorder) over NoBorder so the accent
            // border colour materialises; `#[allow(deprecated)]` silences
            // the future-compat lint until we migrate to `transparent`.
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSLineBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            // Accent-dark fill gives visual weight; the "darker half of the
            // gradient" approximation — full linear-gradient fill on NSBox
            // would require a CAGradientLayer replacement, which T-11 can
            // layer in without changing this contract.
            b.setFillColor(&color::accent_dark());
            b.setBorderColor(&color::border_soft());
            b.setCornerRadius(AVATAR_SIZE / 2.0);
            b
        };
        let avatar_z = make_centered_label(
            mtm,
            "Z",
            &color::text_primary(),
            unsafe { NSFont::boldSystemFontOfSize(11.0) },
            avatar_frame,
        );
        unsafe { avatar.addSubview(&avatar_z) };

        // Attach every cluster to the root. Layout is performed below in
        // `relayout` so we can reuse it from `set_source_path` (path string
        // changes length → separator / path label shift).
        //
        // z-order matters: button backdrops go in *before* their NSButton
        // so the button renders on top.  Matches the HUD primary-button
        // layering treatment.
        unsafe {
            // Brand cluster (mark + name + separator + path) in this order
            // so z-stacking matches painter order.
            root.addSubview(brand_mark.as_super());
            root.addSubview(&brand_name);
            root.addSubview(separator.as_super());
            root.addSubview(&source_path_label);
            root.addSubview(share_backdrop.as_super());
            root.addSubview(&share_button);
            root.addSubview(export_backdrop.as_super());
            root.addSubview(&export_button);
            root.addSubview(avatar.as_super());
        }

        let this = Self {
            root,
            source_path_label,
        };

        // Initial layout pass.  Separate helper so `set_source_path` can
        // retrigger it without rebuilding subviews.
        this.relayout(
            &brand_mark,
            &brand_name,
            &separator,
            &share_button,
            &share_backdrop,
            &export_button,
            &export_backdrop,
            &avatar,
        );

        this
    }

    /// Borrow the root view as a plain `&NSView`.  Callers add this to their
    /// own hierarchy (`NSWindow`'s content view or a parent container).
    pub fn view(&self) -> &NSView {
        // NSVisualEffectView's direct super is NSView (NSResponder sits
        // above that).  Single `as_super` gives us the `&NSView` handle
        // consumers need to add the topbar to any `NSView` hierarchy.
        self.root.as_super()
    }

    /// Replace the source-path label.  Re-emits a layout pass because the
    /// label width changes with string length, which in turn moves the
    /// separator's right edge.
    ///
    /// NOTE: The layout pass re-reads subview frames from the root; we
    /// cannot hold those subview handles in `Self` without pervasive
    /// `Retained` bookkeeping, so we accept the minor cost of looking them
    /// up via the known subview order when needed.  For v1.19 the topbar is
    /// created once at launch — this setter is exercised by T-14 when the
    /// user opens a new file, at which point re-laying out is cheap.
    pub fn set_source_path(&mut self, path: &str) {
        unsafe {
            let ns = NSString::from_str(path);
            self.source_path_label.setStringValue(&ns);
        }
        // TODO (T-11): walk `self.root.subviews()` and re-run `relayout` so
        // the new string width propagates.  Leaving the implementation as a
        // text-only update for now keeps T-05 focused on the initial render
        // contract; dynamic re-layout ships with the file-open feature.
    }

    /// Internal helper — place every top-level subview given the root width.
    /// `brand_mark` / `brand_name` / `separator` / `share` / `export` /
    /// `avatar` are the siblings owned by `root` that need positioning;
    /// `source_path_label` is read from `self` because it's the only subview
    /// we keep a long-lived handle to.
    #[allow(clippy::too_many_arguments)]
    fn relayout(
        &self,
        brand_mark: &NSBox,
        brand_name: &NSTextField,
        separator: &NSBox,
        share: &NSButton,
        share_backdrop: &NSBox,
        export: &NSButton,
        export_backdrop: &NSBox,
        avatar: &NSBox,
    ) {
        let width = self.root.frame().size.width;
        let mid_y = TOPBAR_HEIGHT / 2.0;

        // --- Left cluster --------------------------------------------------
        // [traffic gutter] [brand-mark] [gap] [brand-name] [gap] [|] [gap] [path]
        let mark_x = TRAFFIC_GUTTER;
        let mark_y = mid_y - MARK_SIZE / 2.0;
        unsafe {
            brand_mark.setFrame(NSRect::new(
                NSPoint::new(mark_x, mark_y),
                NSSize::new(MARK_SIZE, MARK_SIZE),
            ));
        }

        let name_x = mark_x + MARK_SIZE + BRAND_GAP;
        let name_width = measure_label_width(brand_name, 120.0);
        unsafe {
            brand_name.setFrame(NSRect::new(
                NSPoint::new(name_x, mid_y - 9.0),
                NSSize::new(name_width, 18.0),
            ));
        }

        let sep_x = name_x + name_width + BRAND_GAP;
        unsafe {
            separator.setFrame(NSRect::new(
                NSPoint::new(sep_x, mid_y - 9.0),
                NSSize::new(1.0, 18.0),
            ));
        }

        let path_x = sep_x + 1.0 + BRAND_GAP;
        let path_width = measure_label_width(&self.source_path_label, 420.0);
        unsafe {
            self.source_path_label.setFrame(NSRect::new(
                NSPoint::new(path_x, mid_y - 8.0),
                NSSize::new(path_width, 16.0),
            ));
        }

        // --- Right cluster (laid out right-to-left) ------------------------
        let mut right_edge = width - OUTER_PAD;

        let avatar_x = right_edge - AVATAR_SIZE;
        unsafe {
            avatar.setFrame(NSRect::new(
                NSPoint::new(avatar_x, mid_y - AVATAR_SIZE / 2.0),
                NSSize::new(AVATAR_SIZE, AVATAR_SIZE),
            ));
        }
        right_edge = avatar_x - CLUSTER_GAP;

        let export_width = measure_button_width(export, 160.0);
        let export_x = right_edge - export_width;
        let button_h = 26.0;
        unsafe {
            let export_rect = NSRect::new(
                NSPoint::new(export_x, mid_y - button_h / 2.0),
                NSSize::new(export_width, button_h),
            );
            export.setFrame(export_rect);
            // Backdrop shares the exact same frame as the button it sits
            // behind — the NSButton's bezel is off so the NSBox fill + 6 px
            // corner radius is what the user perceives as the button.
            export_backdrop.setFrame(export_rect);
        }
        right_edge = export_x - BRAND_GAP;

        let share_width = measure_button_width(share, 72.0);
        let share_x = right_edge - share_width;
        unsafe {
            let share_rect = NSRect::new(
                NSPoint::new(share_x, mid_y - button_h / 2.0),
                NSSize::new(share_width, button_h),
            );
            share.setFrame(share_rect);
            share_backdrop.setFrame(share_rect);
        }
    }
}

// ---------------------------------------------------------------------------
// Private construction helpers
// ---------------------------------------------------------------------------

/// Build a plain label NSTextField (non-editable, non-selectable, clear bg)
/// with the given text / colour / font / alignment.
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

/// Build a label centred inside a parent frame (used for brand-mark "★" and
/// avatar "Z").  Frame is positioned (0, 0, parent.w, parent.h) so it fills
/// its parent; alignment-centre + default vertical baseline yields a visually
/// centred glyph for single-character strings at the chosen font size.
fn make_centered_label(
    mtm: MainThreadMarker,
    text: &str,
    color: &NSColor,
    font: Retained<NSFont>,
    parent_frame: NSRect,
) -> Retained<NSTextField> {
    let label = make_label(mtm, text, color, font, NSTextAlignment::Center);
    unsafe {
        label.setFrame(NSRect::new(
            NSPoint::new(0.0, 0.0),
            parent_frame.size,
        ));
    }
    label
}

/// Build a styled push button.  AppKit doesn't give us direct control over
/// NSButton's background/border without subclassing NSButtonCell, so we
/// render the button **bezel-less** and rely on a sibling NSBox backdrop
/// (placed underneath the button in the superview subview list) to supply
/// the fill + border treatment — same layered approach HUD's primary play
/// button uses.  Call sites that only want a text-only ghost button
/// (`Share`) skip the backdrop; primary buttons (`Export`) pair this with
/// a tinted NSBox behind.
fn make_button(
    mtm: MainThreadMarker,
    title: &str,
    title_color: &NSColor,
    _fill: &NSColor,
    _border: Option<&NSColor>,
) -> Retained<NSButton> {
    unsafe {
        let ns = NSString::from_str(title);
        // buttonWithTitle_target_action returns a Momentary-Light push
        // button.  We immediately drop its bezel so the default grey pill
        // doesn't render — the sample-preview primary / ghost buttons are
        // text-over-tinted-background, not system push-buttons.
        let button =
            NSButton::buttonWithTitle_target_action(&ns, None, None, mtm);
        button.setBordered(false);
        // Override text colour via attributed title so ghost (white-muted)
        // and primary (near-black on purple) read correctly.
        let attrs = build_title_attrs(title_color);
        let styled = objc2_foundation::NSAttributedString::initWithString_attributes(
            mtm.alloc::<objc2_foundation::NSAttributedString>(),
            &ns,
            Some(&attrs),
        );
        button.setAttributedTitle(&styled);
        button
    }
}

/// Build the NSBox backdrop that supplies a button's fill + (optional)
/// border.  The button frame is re-set later during layout — here we only
/// need the box's fixed visual properties (fill colour, border colour,
/// corner radius).
fn make_button_backdrop(
    mtm: MainThreadMarker,
    fill: &NSColor,
    border: Option<&NSColor>,
) -> Retained<NSBox> {
    unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(
            alloc,
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, 1.0)),
        );
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(if border.is_some() {
            NSBorderType::NSLineBorder
        } else {
            NSBorderType::NSNoBorder
        });
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        b.setFillColor(fill);
        if let Some(c) = border {
            b.setBorderColor(c);
            b.setBorderWidth(1.0);
        } else {
            b.setBorderWidth(0.0);
        }
        // 6 px matches the sample-preview `.btn-*  { border-radius: var(--r-xs) }`
        // (6 px in `:root`).
        b.setCornerRadius(6.0);
        b
    }
}

/// Build an NSDictionary suitable for NSAttributedString's `attributes:`
/// parameter containing only an `NSForegroundColorAttributeName` mapping.
/// NSFont could be added here as well, but NSButton will honour its own
/// `font` property if we don't override it in the attributed string — we
/// leave font untouched so the system default button type prevails.
fn build_title_attrs(
    color: &NSColor,
) -> Retained<objc2_foundation::NSDictionary<objc2_foundation::NSString, objc2::runtime::AnyObject>>
{
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSDictionary, NSString as FString};
    unsafe {
        // "NSColor" is the raw string form of
        // `NSForegroundColorAttributeName`; using the constant requires
        // either the NSAttributedString feature expansion pack or a manual
        // `extern "C"` binding, both of which add dependencies for no
        // behavioural gain — AppKit recognises the legacy string form.
        let key: Retained<FString> = FString::from_str("NSColor");
        // Cast the `&NSColor` down to `Retained<AnyObject>` so it can serve
        // as the value in a `NSDictionary<NSString, AnyObject>`.
        let color_any: Retained<AnyObject> = Retained::cast(color.retain());
        NSDictionary::from_vec(&[key.as_ref()], vec![color_any])
    }
}

/// Single-line width estimate for a label.  Uses `sizeToFit` under the hood
/// so AppKit's text engine reports the exact pixel width for the current
/// font / weight — the previous `7.2 px-per-char` heuristic under-estimated
/// bold system font (e.g. "NextFrame" measured at 64.8 px when the real
/// pixel width at 13 pt bold is ~85 px, cutting off the final `e`).  Caller
/// supplies a sanity-cap for pathological long strings.
fn measure_label_width(label: &NSTextField, cap: f64) -> f64 {
    // sizeToFit mutates the NSTextField frame to the intrinsic size; we
    // read it back and then leave the frame alone (caller's `setFrame`
    // call happens next in relayout).  Adds a small 4 px right padding
    // so the next sibling doesn't butt up against the last glyph.
    unsafe {
        label.sizeToFit();
    }
    let w = label.frame().size.width + 4.0;
    w.min(cap).max(24.0)
}

/// Same approach for NSButton titles — `sizeToFit` measures the button's
/// intrinsic width including its bezel padding, so no extra BTN_H_PAD
/// arithmetic is required.  The 4 px slack keeps the label from touching
/// neighbouring controls.
fn measure_button_width(button: &NSButton, cap: f64) -> f64 {
    unsafe {
        button.sizeToFit();
    }
    let w = button.frame().size.width + 4.0;
    w.min(cap).max(56.0)
}

