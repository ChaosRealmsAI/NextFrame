//! HUD overlay · T-09
//!
//! A floating play-toolbar anchored to the **center-bottom** of the preview
//! panel.  Gives the user manual transport control over the runtime that lives
//! inside the [`WKWebView`] created by T-06:
//!
//! ```text
//!    ┌────────────────────────────────────────────────────────────────┐
//!    │  ◀◀   ◀   [ ▶ ]   ▶   ▶▶   │   00:00 / 03:32   │   ⟲   ⛶       │
//!    └────────────────────────────────────────────────────────────────┘
//!          jump prev  play/pause next jump    timecode    loop  fit
//! ```
//!
//! ## Architecture
//!
//! The HUD is a plain [`NSView`] container holding child [`NSButton`]s, two
//! 1 px [`NSBox`] separators, and a mono [`NSTextField`] timecode label.  All
//! subviews share a single **controller** ([`HudController`]) — an Objective-C
//! subclass declared with [`declare_class!`] that hosts every Cocoa
//! `target: / action:` selector the buttons need.  A single controller
//! ensures interior-mutable state (`is_playing`, `current_ms`) stays
//! synchronised across clicks without any `RefCell` juggling on the Rust side.
//!
//! ## FM-AUTOPLAY-POLICY (six iron-clad rules · v1.8 BUG-20260419-01)
//!
//! The single biggest trap when integrating a `<video>` or `<audio>`-bearing
//! runtime into a WKWebView shell is the browser's **autoplay policy**.  The
//! spec (Chromium's MediaEngagementIndex + Safari's user-activation model) is:
//!
//!   - Unmuted `v.play()` succeeds only inside a **synchronous** callback
//!     frame spawned from a real user gesture (NSButton click, keyboard,
//!     touch).  Anything stacked on a `Promise.then` / `setTimeout` / `RAF`
//!     callback is considered *async* → unmute is denied → `play()` rejects.
//!   - Toggling `<video>.muted` per tick is treated as "policy-sensitive";
//!     WebKit re-evaluates gesture freshness every mutation and **pauses** the
//!     element if the attribution window has elapsed.
//!   - Each *document* carries one user-activation bit; once granted it
//!     persists for the page's lifetime, but WebKit still audits the stack
//!     each time `play()` lands on an unmuted element.
//!
//! Mapping that onto this module:
//!
//! | # | Rule                                       | Where we implement it                                                        |
//! |---|--------------------------------------------|-------------------------------------------------------------------------------|
//! | 1 | boot-paused                                | shell boots runtime with `autoplay:false` (see `html_template::TEMPLATE`) — HUD **never** writes autoplay flags. |
//! | 2 | gesture-in-click-callback                  | Each button's action selector calls [`HudController::dispatch`] *synchronously*; `callAsyncJavaScript` fires before the selector returns, preserving user activation. |
//! | 3 | no unmute from RAF / Promise / setTimeout  | We never schedule `play()` from a deferred queue; every dispatch originates in an AppKit action path. |
//! | 4 | no per-frame `video.muted` churn           | Shell never touches `video.muted` — runtime owns gesture-unmute; see `src/nf-runtime/src/runtime.js::_syncMediaFromGesture`. |
//! | 5 | icon reflects composite `effectivelyPlaying` | We update the icon *optimistically* on click ([`HudController::set_playing`]); T-10 playhead-sync will poll runtime state and call [`HudView::set_playing`] to correct drift. |
//! | 6 | first gesture combines unmute + play       | Click handler issues `nfHandle.play()` — runtime's own play() calls `_syncMediaFromGesture(true)` which unmutes + plays *inside the same microtask*. |
//!
//! ## FM-ASYNC
//!
//! Every JS dispatch uses
//! `callAsyncJavaScript:arguments:inFrame:inContentWorld:completionHandler:`
//! (macOS 11+).  The legacy evaluateJavaScript WKWebView API is **banned**
//! in this file — the v0.x ISSUE-001 post-mortem recorded it as the source
//! of a 10+ frame shell↔runtime drift because its completion handler
//! receives the Promise *object*, not its resolved value.
//! `callAsyncJavaScript` awaits the Promise on our behalf.
//!
//! ## Clippy baseline
//!
//! `unwrap_used` / `expect_used` / `panic` are workspace-deny; every failure
//! path returns a [`HudError`] variant.  The `unsafe` blocks are all FFI
//! into AppKit/WebKit with `SAFETY:` comments above them.

#![allow(non_snake_case)]

use std::cell::Cell;
use std::error::Error;
use std::fmt;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, Sel};
use objc2::{declare_class, msg_send_id, mutability, sel, ClassType, DeclaredClass};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSBorderType, NSBox, NSBoxType, NSButton, NSControl,
    NSFont, NSTextAlignment, NSTextField, NSTitlePosition, NSView,
};
use objc2_foundation::{
    MainThreadMarker, NSAttributedString, NSDictionary, NSError, NSObjectProtocol, NSPoint, NSRect,
    NSSize, NSString,
};
use objc2_web_kit::{WKContentWorld, WKWebView};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors surfaced while constructing or driving the HUD.
///
/// Hand-written (no `thiserror`) to match the sibling modules in this crate.
#[derive(Debug)]
pub enum HudError {
    /// Retained for future negative-path APIs (e.g. "controller alloc
    /// returned nil"); currently constructing the HUD succeeds under the
    /// normal AppKit contract, so this variant is dead code for v1.19.
    /// Kept so callers can write `match` expressions today and have them
    /// stay exhaustive when failure paths are added.
    #[allow(dead_code)]
    Internal(&'static str),
}

impl fmt::Display for HudError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Internal(msg) => write!(f, "nf-shell-mac: hud internal error: {msg}"),
        }
    }
}

impl Error for HudError {}

// ---------------------------------------------------------------------------
// Public owning handle
// ---------------------------------------------------------------------------

/// Owning handle for the HUD `NSView` hierarchy.
///
/// * `view` — the floating `NSView` (rounded, tinted backdrop).  T-11 attaches
///   this to the preview panel's superview and positions it at
///   center-bottom.
/// * `webview` — strong reference to the runtime's `WKWebView`.  We pair the
///   HUD's lifetime to the webview's on purpose: while the shell is running,
///   both live together, and the HUD never outlives the preview — so the
///   "strong cycle" concern from the task prompt doesn't apply.  Holding a
///   strong ref lets the button callbacks invoke `callAsyncJavaScript`
///   without chasing a `Weak` that must be upgraded in the gesture-critical
///   sync path (any deferred upgrade could itself jeopardise rule #2).
/// * `controller` — the declare_class! instance whose ivars hold every piece
///   of mutable state (`is_playing`, `current_ms`, `total_ms`, the timecode
///   label, the play/pause button).  Keeping a retained ref here means the
///   controller outlives the buttons that reference it as their `target:`.
pub struct HudView {
    view: Retained<NSView>,
    #[allow(dead_code)] // field kept so future `set_*` methods can dispatch JS directly.
    webview: Retained<WKWebView>,
    controller: Retained<HudController>,
}

impl HudView {
    /// Build a HUD positioned inside `frame` (caller-space coordinates).
    ///
    /// * `frame` is the HUD's bounding rect; the caller is responsible for
    ///   placing this below the preview.  T-11 anchors it at
    ///   `(x: (preview.w - HUD_WIDTH) / 2, y: HUD_BOTTOM_MARGIN)`.
    /// * `webview` is the runtime's `WKWebView` (cloned from
    ///   [`crate::preview::PreviewPanel::webview`]).  The HUD takes a strong
    ///   reference.
    /// * `total_ms` seeds the timecode label's right-hand value
    ///   (`source.duration_ms`).
    pub fn new(
        frame: NSRect,
        webview: Retained<WKWebView>,
        total_ms: u64,
        mtm: MainThreadMarker,
    ) -> Self {
        // --- Root container + backdrop ------------------------------------
        //
        // Root is a plain NSView so [`HudView::view`] can hand out an
        // `&NSView` (callers shouldn't have to know about the NSBox
        // chrome).  The visual pill is a child NSBox sized to fill the
        // root via auto-resizing masks — same idiom as preview.rs's black
        // letterbox backdrop.
        let root: Retained<NSView> = unsafe {
            let alloc = mtm.alloc::<NSView>();
            let v = NSView::initWithFrame(alloc, frame);
            v.setAutoresizingMask(
                NSAutoresizingMaskOptions::NSViewMinXMargin
                    | NSAutoresizingMaskOptions::NSViewMaxXMargin,
            );
            v
        };
        let backdrop = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(
                alloc,
                NSRect::new(NSPoint::new(0.0, 0.0), frame.size),
            );
            b.setBoxType(NSBoxType::NSBoxCustom);
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSLineBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::backdrop());
            b.setBorderColor(&color::border_soft());
            b.setCornerRadius(HUD_CORNER);
            b.setAutoresizingMask(
                NSAutoresizingMaskOptions::NSViewWidthSizable
                    | NSAutoresizingMaskOptions::NSViewHeightSizable,
            );
            root.addSubview(b.as_super());
            b
        };
        // Subviews live directly on the root (above the backdrop in z order).
        // NSBox's own contentView path is usable but pulls NSBox-specific
        // layout quirks in; flat children on the root view keep frame math
        // trivial (same coordinate space as the layout helpers use).
        let content_view: &NSView = &root;
        // Backdrop is unused past this point — Retained keeps it alive via
        // root's subview list.
        let _ = backdrop;

        // --- Mutable state owner ------------------------------------------
        //
        // `HudController` hosts every action selector plus the
        // `is_playing` / `current_ms` / `total_ms` state.  We build it
        // before the buttons so we can assign it as each NSButton's
        // `target:` at construction time.
        let controller = HudController::new(webview.clone(), total_ms, mtm);

        // --- Buttons (left→right: jump-prev · prev · play/pause · next · jump-next)
        let jump_prev = make_icon_button(mtm, "⏮", &controller, sel!(onJumpStart:));
        let prev_frame_btn = make_icon_button(mtm, "◀", &controller, sel!(onPrevFrame:));
        let play_pause = make_primary_button(mtm, PLAY_GLYPH, &controller, sel!(onPlayPause:));
        let next_frame_btn = make_icon_button(mtm, "▶", &controller, sel!(onNextFrame:));
        let jump_next = make_icon_button(mtm, "⏭", &controller, sel!(onJumpEnd:));

        // Primary-button backdrop — accent purple NSBox beneath the
        // play/pause NSButton so the sample-preview "purple filled primary"
        // treatment renders without a full NSButtonCell subclass.  AppKit
        // doesn't expose bezel-fill on NSButton directly; a layered NSBox
        // is the shortest path to the same visual.
        let play_backdrop: Retained<NSBox> = unsafe {
            let alloc = mtm.alloc::<NSBox>();
            let b = NSBox::initWithFrame(
                alloc,
                NSRect::new(
                    NSPoint::new(0.0, 0.0),
                    NSSize::new(PLAY_BUTTON_WIDTH, BUTTON_HEIGHT),
                ),
            );
            b.setBoxType(NSBoxType::NSBoxCustom);
            #[allow(deprecated)]
            b.setBorderType(NSBorderType::NSNoBorder);
            b.setTitlePosition(NSTitlePosition::NSNoTitle);
            b.setFillColor(&color::accent());
            b.setCornerRadius(6.0);
            b
        };

        // --- Separator + timecode -----------------------------------------
        let sep1 = make_separator(mtm);
        let timecode = make_timecode_label(mtm, total_ms);
        let sep2 = make_separator(mtm);

        // --- Right cluster (loop · fit) -----------------------------------
        let loop_btn = make_icon_button(mtm, "⟲", &controller, sel!(onLoopToggle:));
        let fit_btn = make_icon_button(mtm, "⛶", &controller, sel!(onFitToggle:));

        // --- Layout --------------------------------------------------------
        //
        // A flex-row style packing from left→right.  Start at `H_PAD` and
        // walk rightwards adding each subview's width + inter-item gap.
        let mid_y = frame.size.height / 2.0;
        let mut x = H_PAD;

        place(&jump_prev, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, ITEM_GAP);
        place(&prev_frame_btn, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, ITEM_GAP);
        // Set the accent-purple backdrop frame manually at the same rect
        // as the play_pause button (which is placed next).  We don't want
        // `place_box` to advance `x` here — the backdrop is a sibling that
        // shares the button's slot, not its own flex-row entry.
        unsafe {
            play_backdrop.setFrame(NSRect::new(
                NSPoint::new(x, mid_y - BUTTON_HEIGHT / 2.0),
                NSSize::new(PLAY_BUTTON_WIDTH, BUTTON_HEIGHT),
            ));
        }
        place(&play_pause, mid_y, &mut x, PLAY_BUTTON_WIDTH, BUTTON_HEIGHT, ITEM_GAP);
        place(&next_frame_btn, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, ITEM_GAP);
        place(&jump_next, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, CLUSTER_GAP);

        place_box(&sep1, mid_y, &mut x, 1.0, SEPARATOR_H, CLUSTER_GAP);

        place_label(&timecode, mid_y, &mut x, TIMECODE_WIDTH, 16.0, CLUSTER_GAP);

        place_box(&sep2, mid_y, &mut x, 1.0, SEPARATOR_H, CLUSTER_GAP);

        place(&loop_btn, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, ITEM_GAP);
        place(&fit_btn, mid_y, &mut x, ICON_BUTTON_WIDTH, BUTTON_HEIGHT, H_PAD);

        // --- Attach subviews + stash handles on controller ----------------
        //
        // Order matters for z-stacking — the play-button backdrop goes on
        // first so `play_pause` draws on top of it.  AppKit renders in
        // subview order (back-to-front).
        unsafe {
            content_view.addSubview(&jump_prev);
            content_view.addSubview(&prev_frame_btn);
            content_view.addSubview(play_backdrop.as_super());
            content_view.addSubview(&play_pause);
            content_view.addSubview(&next_frame_btn);
            content_view.addSubview(&jump_next);
            content_view.addSubview(sep1.as_super());
            content_view.addSubview(&timecode);
            content_view.addSubview(sep2.as_super());
            content_view.addSubview(&loop_btn);
            content_view.addSubview(&fit_btn);
        }

        // Hand the controller the handles it'll mutate on dispatch:
        //   - play/pause button so `onPlayPause:` can swap glyph ▶ ⇄ ⏸
        //   - timecode label so `set_current_ms` can rewrite `mm:ss / mm:ss`
        controller.bind_outlets(play_pause, timecode);

        Self {
            view: root,
            webview,
            controller,
        }
    }

    /// Borrow the outer `NSView` so T-11 can `addSubview:` it into the
    /// preview's superview hierarchy.
    pub fn view(&self) -> &NSView {
        &self.view
    }

    /// Update the playhead timecode (mm:ss).  Driven by T-10
    /// playhead-sync — called from its polling callback once per animation
    /// tick.  Also the authoritative hook for correcting the
    /// optimistically-updated play/pause glyph (rule #5 of
    /// FM-AUTOPLAY-POLICY) when paired with [`Self::set_playing`].
    pub fn set_current_ms(&mut self, ms: u64) {
        self.controller.set_current_ms(ms);
    }

    /// Mirror the runtime's composite `effectivelyPlaying` state onto the
    /// HUD.  T-10 will call this after it reads `nfHandle._paused` + each
    /// persist-media's `.paused` and derives the boolean.
    pub fn set_playing(&mut self, playing: bool) {
        self.controller.set_playing(playing);
    }
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/// Rounded-corner radius of the floating pill.
const HUD_CORNER: f64 = 10.0;
/// Outer horizontal padding inside the HUD.
const H_PAD: f64 = 14.0;
/// Gap between items inside a cluster (e.g. the 5 transport buttons).
const ITEM_GAP: f64 = 4.0;
/// Gap between clusters (buttons ↔ separator ↔ timecode).
const CLUSTER_GAP: f64 = 12.0;
/// Icon-sized button side length (◀◀ ◀ ▶ ▶▶ etc.).
const ICON_BUTTON_WIDTH: f64 = 28.0;
/// Primary play/pause button width.
const PLAY_BUTTON_WIDTH: f64 = 40.0;
/// Shared button height.
const BUTTON_HEIGHT: f64 = 26.0;
/// Separator height (matches topbar visual treatment).
const SEPARATOR_H: f64 = 18.0;
/// Width reserved for timecode label (`mm:ss  /  mm:ss` = 15 chars of mono
/// at 11 px ≈ 105 px · we allow 120 px so `h:mm:ss / h:mm:ss` also fits
/// without clipping).  The previous 96 px truncated `03:32` → `03:`.
const TIMECODE_WIDTH: f64 = 120.0;

/// Glyph used for the play/pause button while paused.
const PLAY_GLYPH: &str = "▶";
/// Glyph used for the play/pause button while playing.
const PAUSE_GLYPH: &str = "⏸";

/// One-frame seek at 30 fps — 1000 / 30 ≈ 33 ms.  Kept as an integer so we
/// can cast to `i64` without rounding surprises.  When the shell grows
/// per-source fps awareness this constant moves onto `HudController`.
const FRAME_STEP_MS: i64 = 33;

// ---------------------------------------------------------------------------
// Colour palette (mirrors topbar.rs tokens)
// ---------------------------------------------------------------------------

mod color {
    use objc2::rc::Retained;
    use objc2_app_kit::NSColor;

    /// Floating pill background · `rgba(0,0,0,0.55)`.  AppKit doesn't
    /// composite a real blur the way `backdrop-filter: blur(…)` does in
    /// CSS, but a solid alpha gives the same perceptual result over the
    /// black preview below and keeps us off the NSVisualEffectView path
    /// (which would require declaring the HUD as a layer-backed view to
    /// mask to the rounded corners; overkill for a transport toolbar).
    pub fn backdrop() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.55) }
    }
    /// Glass border · `rgba(255,255,255,0.08)`.
    pub fn border_soft() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.08) }
    }
    /// Accent purple · `#a78bfa` · primary button fill + timecode ink.
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
    /// Near-black text on primary button.
    pub fn text_on_accent() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(0.0, 0.0, 0.0, 0.90) }
    }
    /// Secondary ink · `rgba(255,255,255,0.75)` · icon buttons.
    pub fn text_secondary() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.75) }
    }
    /// Muted ink · `rgba(255,255,255,0.45)` · timecode "/" divider when we
    /// grow the label into a 3-segment attributed string (current / divider
    /// / total).  Currently the single-colour monospaced label uses the
    /// accent tone so this helper is documented + reserved but inert.
    #[allow(dead_code)]
    pub fn text_muted() -> Retained<NSColor> {
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(1.0, 1.0, 1.0, 0.45) }
    }
}

// ---------------------------------------------------------------------------
// Declared class · HudController
// ---------------------------------------------------------------------------
//
// Everything mutable lives here.  `declare_class!` requires a `#[derive]`-able
// ivars struct; interior mutability is layered on via `Cell` for the scalar
// state and `OnceCell`-style initialisation through setters for the Retained
// handles (NSButton / NSTextField).  Using `Cell` rather than `RefCell` is
// deliberate: (a) every access is main-thread only so no `Sync` worry, and
// (b) the values are all `Copy` primitives or `Retained` (which is not `Copy`
// but is swapped atomically by `replace`).

struct HudIvars {
    /// Strong ref to the runtime's webview.  Drives every JS dispatch.
    webview: Retained<WKWebView>,
    /// `source.duration_ms` — used by `onJumpEnd:` + timecode formatting.
    total_ms: u64,
    /// Current playhead (ms) — updated by T-10 playhead-sync.
    current_ms: Cell<u64>,
    /// Optimistic "is user expecting playback?" bit.  Set true on ▶ click,
    /// false on ⏸ click; T-10 can call [`HudController::set_playing`] to
    /// overwrite when the runtime reports a mismatch.
    is_playing: Cell<bool>,
    /// Play/pause NSButton — retained so `onPlayPause:` can swap its title
    /// glyph.  Filled in via `bind_outlets` after the buttons exist.
    play_button: std::cell::OnceCell<Retained<NSButton>>,
    /// Timecode NSTextField — retained so `set_current_ms` can rewrite the
    /// "mm:ss / mm:ss" string.  Filled in via `bind_outlets`.
    timecode_label: std::cell::OnceCell<Retained<NSTextField>>,
}

declare_class!(
    /// Objective-C class that hosts every button's `target: / action:` pair
    /// for the HUD.  Declared with `MainThreadOnly` mutability because every
    /// AppKit interaction happens on the main thread — forbidding other
    /// threads from even grabbing a reference means we never need `Sync`.
    struct HudController;

    // SAFETY:
    // - Super is NSObject; no restrictive subclass contracts.
    // - MainThreadOnly mirrors the rest of this crate (topbar, window).
    // - NAME uniquely scoped to nf-shell-mac to avoid runtime name clashes.
    unsafe impl ClassType for HudController {
        type Super = NSObject;
        type Mutability = mutability::MainThreadOnly;
        const NAME: &'static str = "NfShellHudController";
    }

    impl DeclaredClass for HudController {
        type Ivars = HudIvars;
    }

    unsafe impl NSObjectProtocol for HudController {}

    unsafe impl HudController {
        /// ⏮ jump-to-start — runtime resets the clock to 0 ms.  `_sender` is
        /// the NSButton that fired the selector; unused.
        #[method(onJumpStart:)]
        fn on_jump_start(&self, _sender: Option<&AnyObject>) {
            self.dispatch("window.nfHandle.seek(0)");
        }

        /// ◀ prev-frame — subtract one frame of playhead time.  We clamp to
        /// zero on the Rust side so the seek string can't go negative; some
        /// runtimes accept negatives, but clamping keeps the contract
        /// explicit.
        #[method(onPrevFrame:)]
        fn on_prev_frame(&self, _sender: Option<&AnyObject>) {
            let cur = self.ivars().current_ms.get() as i64;
            let target = (cur - FRAME_STEP_MS).max(0) as u64;
            self.dispatch(&format!("window.nfHandle.seek({target})"));
        }

        /// ▶/⏸ main button.  The entire play-gesture policy hangs on this
        /// selector running synchronously inside an AppKit action dispatch
        /// — see FM-AUTOPLAY-POLICY rule #2.
        #[method(onPlayPause:)]
        fn on_play_pause(&self, _sender: Option<&AnyObject>) {
            let ivars = self.ivars();
            let was_playing = ivars.is_playing.get();
            let cmd = if was_playing {
                "window.nfHandle.pause()"
            } else {
                // First gesture combines unmute + play inside the runtime's
                // own .play() implementation (rule #6).  Shell only hits the
                // outer API surface — no per-frame muted writes, no
                // RAF-deferred scheduling.
                "window.nfHandle.play()"
            };
            self.dispatch(cmd);
            // Optimistic flip — T-10 will reconcile via set_playing().
            ivars.is_playing.set(!was_playing);
            self.refresh_play_glyph();
        }

        /// ▶ next-frame — same symmetry as prev-frame; clamp to `total_ms`.
        #[method(onNextFrame:)]
        fn on_next_frame(&self, _sender: Option<&AnyObject>) {
            let cur = self.ivars().current_ms.get() as i64;
            let total = self.ivars().total_ms as i64;
            let target = (cur + FRAME_STEP_MS).min(total).max(0) as u64;
            self.dispatch(&format!("window.nfHandle.seek({target})"));
        }

        /// ⏭ jump-to-end.
        #[method(onJumpEnd:)]
        fn on_jump_end(&self, _sender: Option<&AnyObject>) {
            let total = self.ivars().total_ms;
            self.dispatch(&format!("window.nfHandle.seek({total})"));
        }

        /// ⟲ loop toggle — stub for v1.19.  Real behaviour lands once the
        /// runtime exposes a `setLoop(bool)` verb; until then we log to
        /// stderr so manual QA can confirm the gesture reached the shell.
        #[method(onLoopToggle:)]
        fn on_loop_toggle(&self, _sender: Option<&AnyObject>) {
            eprintln!("nf-shell-mac: HUD loop toggle (stub · v1.19)");
        }

        /// ⛶ fit-to-window toggle — stub.  The preview's aspect-fit math is
        /// already driven by `preview::PreviewPanel::resize`; a dedicated
        /// "fit" vs "fill" verb arrives with the T-14 recorder export
        /// pipeline which cares about 1:1 pixel pipelines.
        #[method(onFitToggle:)]
        fn on_fit_toggle(&self, _sender: Option<&AnyObject>) {
            eprintln!("nf-shell-mac: HUD fit-to-window toggle (stub · v1.19)");
        }
    }
);

impl HudController {
    /// Allocate + init the controller on the main thread.
    fn new(
        webview: Retained<WKWebView>,
        total_ms: u64,
        mtm: MainThreadMarker,
    ) -> Retained<Self> {
        let this = mtm.alloc().set_ivars(HudIvars {
            webview,
            total_ms,
            current_ms: Cell::new(0),
            is_playing: Cell::new(false),
            play_button: std::cell::OnceCell::new(),
            timecode_label: std::cell::OnceCell::new(),
        });
        // SAFETY: `super(this), init` is the canonical declared-class
        // initialiser chain; matches the pattern used by `window.rs`.
        unsafe { msg_send_id![super(this), init] }
    }

    /// Store the NSButton + NSTextField outlets after they exist.  We use
    /// `OnceCell` rather than bare `Cell` so subsequent calls are a no-op
    /// instead of silently replacing the UI (defensive; the HUD never
    /// re-runs `bind_outlets`).
    fn bind_outlets(&self, play: Retained<NSButton>, tc: Retained<NSTextField>) {
        let _ = self.ivars().play_button.set(play);
        let _ = self.ivars().timecode_label.set(tc);
    }

    /// Update the playhead timecode label.  Synchronously rewrites
    /// `<current> / <total>` on the NSTextField; AppKit schedules a redraw
    /// on the next run-loop pass.
    fn set_current_ms(&self, ms: u64) {
        self.ivars().current_ms.set(ms);
        self.refresh_timecode();
    }

    /// Overwrite the play/pause optimistic state from T-10 playhead-sync.
    fn set_playing(&self, playing: bool) {
        self.ivars().is_playing.set(playing);
        self.refresh_play_glyph();
    }

    /// Fire a JS expression at the runtime using `callAsyncJavaScript`.
    ///
    /// **Critical**: this method is called from inside an AppKit action
    /// selector, which is itself synchronously invoked by
    /// `-[NSApplication sendAction:to:from:]` as part of the user-gesture
    /// event dispatch.  By the time Rust control flow returns out of the
    /// selector, the Objective-C call stack still carries the "user
    /// activation" flag that WebKit audits, so unmute + play inside the JS
    /// payload will succeed.  Any deferred execution (Promise.then,
    /// setTimeout, RAF) would lose that flag → FM-AUTOPLAY-POLICY rule #2
    /// violation.
    fn dispatch(&self, js: &str) {
        let ivars = self.ivars();
        let ns_js = NSString::from_str(js);
        // No arguments dictionary (we inline any number/string literals
        // directly into the body — the bodies here are tiny like
        // "window.nfHandle.seek(1234)").  An empty dict is semantically
        // equivalent but would allocate every click for no gain.
        let args: Option<&NSDictionary<NSString, AnyObject>> = None;
        // `defaultClientWorld` isolates our script from the runtime's own
        // globals the way a normal inline <script> wouldn't — but we
        // *want* to see `window.nfHandle`, which runtime.js publishes on
        // the page world.  `pageWorld()` returns the main world where
        // nf-runtime boots, so the lookup chain resolves.
        let world = unsafe { WKContentWorld::pageWorld() };
        // Completion handler is a no-op for v1.19: we don't need the
        // return value (the verbs don't resolve with data) and FM-ASYNC
        // documents that the Promise resolution is handled by WebKit
        // internally.  The handler is still supplied so WebKit can surface
        // NSErrors through the transcript in debug builds.  Wrapping in
        // `RcBlock::new` moves the closure onto a heap block whose
        // retain/release is managed by the ObjC runtime.
        //
        // The eprintln! on `!err.is_null()` is a thin belt-and-suspenders
        // guard: during development a typo in the JS body (e.g.
        // `nfHandle.playy()`) silently no-ops without it.  Production
        // verbosity is opt-in via `NF_SHELL_DEBUG=1` once T-11 wires up
        // env-var logging.
        let handler = RcBlock::new(move |result: *mut AnyObject, err: *mut NSError| {
            if !err.is_null() {
                // SAFETY: WebKit guarantees `err` is a valid, +0-retained
                // NSError when non-null.  We read its `localizedDescription`
                // purely for logging.
                unsafe {
                    if let Some(e) = err.as_ref() {
                        let desc = e.localizedDescription();
                        eprintln!("nf-shell-mac HUD dispatch error: {desc}");
                    }
                }
            }
            // `result` is a Promise resolution value; the current verbs
            // resolve with `undefined` (`nfHandle.play()` etc.) so the
            // pointer is null most of the time.  We explicitly ignore it
            // here.
            let _ = result;
        });

        // SAFETY: main-thread AppKit dispatch; `ns_js` / `args` / `world` /
        // `handler` live for the duration of this call; WebKit retains
        // whatever it needs internally.  `callAsyncJavaScript` is the
        // FM-ASYNC-approved bridge (macOS 11+).
        unsafe {
            ivars
                .webview
                .callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler(
                    &ns_js,
                    args,
                    None, // main frame
                    &world,
                    Some(&handler),
                );
        }
    }

    /// Swap the play/pause glyph to match `is_playing`.
    fn refresh_play_glyph(&self) {
        let ivars = self.ivars();
        let glyph = if ivars.is_playing.get() {
            PAUSE_GLYPH
        } else {
            PLAY_GLYPH
        };
        if let Some(button) = ivars.play_button.get() {
            // Attributed title preserves the near-black text colour we set
            // during construction; a plain `setTitle:` would revert to the
            // system tint.
            let ns = NSString::from_str(glyph);
            // SAFETY: main-thread AppKit.
            let mtm = MainThreadMarker::from(self);
            let attrs = primary_button_attrs(mtm);
            let styled = unsafe {
                NSAttributedString::initWithString_attributes(
                    mtm.alloc::<NSAttributedString>(),
                    &ns,
                    Some(&attrs),
                )
            };
            unsafe { button.setAttributedTitle(&styled) };
        }
    }

    /// Rewrite the `<current> / <total>` timecode label.
    fn refresh_timecode(&self) {
        let ivars = self.ivars();
        let cur = format_mmss(ivars.current_ms.get());
        let total = format_mmss(ivars.total_ms);
        let joined = format!("{cur}  /  {total}");
        if let Some(label) = ivars.timecode_label.get() {
            // SAFETY: main-thread AppKit.
            unsafe {
                let ns = NSString::from_str(&joined);
                label.setStringValue(&ns);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers — subview construction
// ---------------------------------------------------------------------------

/// Build a small icon-style NSButton (transparent-ish bezel, secondary ink).
///
/// Wired with `target: controller, action: selector`.  Cocoa keeps a weak
/// reference to the target so the controller must outlive the button — the
/// caller stashes the controller in [`HudView::controller`] which dominates
/// the hierarchy's lifetime.
fn make_icon_button(
    mtm: MainThreadMarker,
    title: &str,
    controller: &HudController,
    action: Sel,
) -> Retained<NSButton> {
    let ns_title = NSString::from_str(title);
    // SAFETY: all calls are main-thread AppKit dispatch. `target` is an
    // AnyObject cast of the controller, which is guaranteed to outlive the
    // button (see module docs).
    unsafe {
        let button = NSButton::buttonWithTitle_target_action(
            &ns_title,
            Some(controller.as_ref() as &AnyObject),
            Some(action),
            mtm,
        );
        // Bezel-less icon buttons — ghost style matching sample-preview's
        // `.btn-ghost` with clear-ish fill + secondary-white text.  The
        // default NSButton bezel renders a grey pill that fights against
        // the dark HUD backdrop; turning the border off leaves just the
        // glyph on the translucent backdrop, which reads as "transport
        // control" rather than "system button".
        button.setBordered(false);
        // Secondary white-ish title.
        let attrs = icon_button_attrs(mtm);
        let styled = NSAttributedString::initWithString_attributes(
            mtm.alloc::<NSAttributedString>(),
            &ns_title,
            Some(&attrs),
        );
        button.setAttributedTitle(&styled);
        button
    }
}

/// Build the primary play/pause button — the accent-purple fill is
/// supplied by an NSBox backdrop behind the button (see [`HudView::new`]);
/// here we render the button itself bezel-less with a near-black glyph so
/// the backdrop colour shows through.  Matches the sample-preview
/// `.btn-primary { background: var(--accent); color: rgba(0,0,0,0.90) }`.
fn make_primary_button(
    mtm: MainThreadMarker,
    title: &str,
    controller: &HudController,
    action: Sel,
) -> Retained<NSButton> {
    let ns_title = NSString::from_str(title);
    // SAFETY: main-thread AppKit.
    unsafe {
        let button = NSButton::buttonWithTitle_target_action(
            &ns_title,
            Some(controller.as_ref() as &AnyObject),
            Some(action),
            mtm,
        );
        // Drop the system bezel so the NSBox backdrop behind us provides
        // the visual fill.  NSButton still lays out + hit-tests its full
        // frame; only the chrome is hidden.
        button.setBordered(false);
        let attrs = primary_button_attrs(mtm);
        let styled = NSAttributedString::initWithString_attributes(
            mtm.alloc::<NSAttributedString>(),
            &ns_title,
            Some(&attrs),
        );
        button.setAttributedTitle(&styled);
        button
    }
}

/// Build a 1 px vertical NSBox separator.
fn make_separator(mtm: MainThreadMarker) -> Retained<NSBox> {
    // SAFETY: main-thread AppKit.
    unsafe {
        let alloc = mtm.alloc::<NSBox>();
        let b = NSBox::initWithFrame(alloc, NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, SEPARATOR_H)));
        b.setBoxType(NSBoxType::NSBoxCustom);
        #[allow(deprecated)]
        b.setBorderType(NSBorderType::NSNoBorder);
        b.setTitlePosition(NSTitlePosition::NSNoTitle);
        b.setFillColor(&color::border_soft());
        b.setCornerRadius(0.0);
        b
    }
}

/// Build the monospaced timecode label seeded with `0 / total_ms`.
fn make_timecode_label(mtm: MainThreadMarker, total_ms: u64) -> Retained<NSTextField> {
    let seed = format!("{}  /  {}", format_mmss(0), format_mmss(total_ms));
    // SAFETY: main-thread AppKit.
    unsafe {
        let ns = NSString::from_str(&seed);
        let label = NSTextField::labelWithString(&ns, mtm);
        label.setFont(Some(&NSFont::monospacedSystemFontOfSize_weight(11.0, 0.0)));
        label.setTextColor(Some(&color::accent()));
        label.setAlignment(NSTextAlignment::Center);
        label.setDrawsBackground(false);
        label.setBordered(false);
        label.setBezeled(false);
        label.setEditable(false);
        label.setSelectable(false);
        label
    }
}

/// Build the attribute dictionary for icon-style buttons (secondary white
/// ink).  Mirrors the topbar recipe so NSButton's default bezel cooperates.
fn icon_button_attrs(
    _mtm: MainThreadMarker,
) -> Retained<NSDictionary<NSString, AnyObject>> {
    // SAFETY: `NSColor` retention is tied to the Retained -> AnyObject cast
    // below; the dictionary takes ownership via `from_vec`.
    unsafe {
        let key: Retained<NSString> = NSString::from_str("NSColor");
        let color_any: Retained<AnyObject> = Retained::cast(color::text_secondary());
        NSDictionary::from_vec(&[key.as_ref()], vec![color_any])
    }
}

/// Build the attribute dictionary for the primary play/pause button (near
/// black text on accent-purple bezel).
fn primary_button_attrs(
    _mtm: MainThreadMarker,
) -> Retained<NSDictionary<NSString, AnyObject>> {
    // SAFETY: see icon_button_attrs.
    unsafe {
        let key: Retained<NSString> = NSString::from_str("NSColor");
        let color_any: Retained<AnyObject> = Retained::cast(color::text_on_accent());
        NSDictionary::from_vec(&[key.as_ref()], vec![color_any])
    }
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/// Place an NSControl (NSButton) at `(x, mid_y - h/2)` with dimensions
/// `(w, h)`, then advance `x` by `w + gap`.  All subviews use absolute
/// frames — autolayout would pull in `NSLayoutConstraint` features without
/// any real gain for a static toolbar.
fn place(view: &NSControl, mid_y: f64, x: &mut f64, w: f64, h: f64, gap: f64) {
    // SAFETY: main-thread AppKit.
    unsafe {
        view.setFrame(NSRect::new(NSPoint::new(*x, mid_y - h / 2.0), NSSize::new(w, h)));
    }
    *x += w + gap;
}

/// `place` variant for NSBox (separators) — the trait bound on setFrame
/// differs between NSControl + NSView hierarchies so we avoid a generic
/// trait import.
fn place_box(view: &NSBox, mid_y: f64, x: &mut f64, w: f64, h: f64, gap: f64) {
    // SAFETY: main-thread AppKit.
    unsafe {
        view.setFrame(NSRect::new(NSPoint::new(*x, mid_y - h / 2.0), NSSize::new(w, h)));
    }
    *x += w + gap;
}

/// `place` variant for NSTextField (timecode).
fn place_label(view: &NSTextField, mid_y: f64, x: &mut f64, w: f64, h: f64, gap: f64) {
    // SAFETY: main-thread AppKit.
    unsafe {
        view.setFrame(NSRect::new(NSPoint::new(*x, mid_y - h / 2.0), NSSize::new(w, h)));
    }
    *x += w + gap;
}

// ---------------------------------------------------------------------------
// Timecode formatting
// ---------------------------------------------------------------------------

/// Format milliseconds as `mm:ss` (zero-padded).  Hours roll into `mm`
/// (shell never shows > 2-hour videos in v1.19); when that changes the
/// caller can swap in a `h:mm:ss` variant without touching the action
/// handlers.
pub(crate) fn format_mmss(ms: u64) -> String {
    let total_secs = ms / 1000;
    let mm = total_secs / 60;
    let ss = total_secs % 60;
    format!("{mm:02}:{ss:02}")
}

// ---------------------------------------------------------------------------
// Tests — pure-algorithmic / enum display, no AppKit main-thread dependency.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn format_mmss_zero() {
        assert_eq!(format_mmss(0), "00:00");
    }

    #[test]
    fn format_mmss_sub_second() {
        assert_eq!(format_mmss(999), "00:00");
    }

    #[test]
    fn format_mmss_exact_second() {
        assert_eq!(format_mmss(1_000), "00:01");
    }

    #[test]
    fn format_mmss_one_minute() {
        assert_eq!(format_mmss(60_000), "01:00");
    }

    #[test]
    fn format_mmss_sample_demo_duration() {
        // v1.8 demo is 212 s → 3:32
        assert_eq!(format_mmss(212_000), "03:32");
    }

    #[test]
    fn format_mmss_long_video_rolls_into_minutes() {
        // 1h30m10s = 5410 s → shows as "90:10" (minutes overflow, not
        // hours:minutes) — documents the v1.19 contract explicitly so the
        // test breaks if we flip to h:mm:ss without updating callers.
        assert_eq!(format_mmss(5_410_000), "90:10");
    }

    #[test]
    fn hud_error_display_is_nonempty() {
        let e = HudError::Internal("boom");
        assert!(!format!("{e}").is_empty());
    }

    #[test]
    fn frame_step_at_30fps_is_33ms() {
        // Documents the fps assumption; when v1.20 adds per-source fps
        // awareness the constant lifts onto HudController and this test
        // moves with it.
        assert_eq!(FRAME_STEP_MS, 33);
    }

    #[test]
    fn play_pause_glyphs_are_distinct() {
        // Catch a copy-paste regression where both glyphs end up the same
        // (rule #5 of FM-AUTOPLAY-POLICY is lost if icon never changes).
        assert_ne!(PLAY_GLYPH, PAUSE_GLYPH);
    }

    // Compile-time layout-constant sanity checks.  `const { assert!(…) }`
    // is evaluated at monomorphisation so a typo that makes a button zero-
    // sized fails the build, not runtime.  Replaces the previous runtime
    // #[test] variant (clippy::assertions_on_constants lints that pattern).
    const _: () = {
        assert!(HUD_CORNER > 0.0);
        assert!(H_PAD > 0.0);
        assert!(ICON_BUTTON_WIDTH > 0.0);
        assert!(PLAY_BUTTON_WIDTH > ICON_BUTTON_WIDTH);
        assert!(BUTTON_HEIGHT > 0.0);
        assert!(TIMECODE_WIDTH > 0.0);
    };
}
