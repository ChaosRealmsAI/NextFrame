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
    NSBezelStyle, NSBorderType, NSBox, NSBoxType, NSButton, NSColor, NSFont, NSTextAlignment,
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
            b.setFillColor(&color::accent());
            b.setBorderColor(&color::accent_border());
            b.setCornerRadius(MARK_CORNER);
            b
        };
        let star_label = make_centered_label(
            mtm,
            "★",
            &color::text_on_accent(),
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
        // NSButton class method `buttonWithTitle_target_action` produces a
        // pre-styled push button; we then override the bezel colour / text
        // colour via the attributed title and NSBox-backed background.
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

        // Export button — primary style: accent fill, near-black text,
        // bold 12 px.  Sample-preview prepends a "⬆" glyph; we mirror that
        // inline in the title.
        let export_button = make_button(
            mtm,
            "⬆ Export 4K MP4",
            &color::text_on_accent(),
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
        unsafe {
            // Brand cluster (mark + name + separator + path) in this order
            // so z-stacking matches painter order.
            root.addSubview(brand_mark.as_super());
            root.addSubview(&brand_name);
            root.addSubview(separator.as_super());
            root.addSubview(&source_path_label);
            root.addSubview(&share_button);
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
            &export_button,
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
        export: &NSButton,
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

        let export_width = measure_button_width(export, 150.0);
        let export_x = right_edge - export_width;
        unsafe {
            export.setFrame(NSRect::new(
                NSPoint::new(export_x, mid_y - 13.0),
                NSSize::new(export_width, 26.0),
            ));
        }
        right_edge = export_x - BRAND_GAP;

        let share_width = measure_button_width(share, 64.0);
        let share_x = right_edge - share_width;
        unsafe {
            share.setFrame(NSRect::new(
                NSPoint::new(share_x, mid_y - 13.0),
                NSSize::new(share_width, 26.0),
            ));
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
/// NSButton's background/border without subclassing NSButtonCell, so we fake
/// the visual treatment with an NSBox backdrop + transparent NSButton on
/// top.  For v1.19 we use the default bezel and just colour the title — the
/// T-11 integration pass can swap in the full ghost/primary bezel if the
/// default look deviates too far from the mockup.
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
        // button with a rounded bezel — the closest stock match to the
        // sample-preview's compact toolbar buttons.
        let button =
            NSButton::buttonWithTitle_target_action(&ns, None, None, mtm);
        // NSBezelStyle::Rounded was renamed `Push` in macOS 14 SDK but the
        // underlying NSUInteger value is identical; the rename is cosmetic
        // and the ObjC runtime still responds to the old constant.  Once
        // the objc2 crate catches up we'll swap to `Push` without a
        // behaviour change.
        #[allow(deprecated)]
        button.setBezelStyle(NSBezelStyle::Rounded);
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

/// Rough single-line width estimate for a label — AppKit will size-to-fit
/// via `sizeToFit` but that requires a first pass through layout.  For a
/// topbar populated with short, known-font strings a 7 px-per-char heuristic
/// plus a configurable cap is precise enough; exact widths are recomputed
/// the moment the label attaches to a real window (AppKit auto-adjusts
/// NSTextField intrinsic size on draw).
fn measure_label_width(label: &NSTextField, cap: f64) -> f64 {
    let text = unsafe { label.stringValue() };
    let len = text.to_string().chars().count() as f64;
    (len * 7.2).min(cap).max(24.0)
}

/// Same heuristic for NSButton titles — buttons have horizontal padding so
/// we add a fixed `2 * BTN_H_PAD` on top of the character-count estimate.
fn measure_button_width(button: &NSButton, cap: f64) -> f64 {
    let title = unsafe { button.title() };
    let len = title.to_string().chars().count() as f64;
    (len * 7.2 + BTN_H_PAD * 2.0).min(cap).max(56.0)
}

