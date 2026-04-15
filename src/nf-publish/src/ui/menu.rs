//! ui menu ui construction
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2::sel;
use objc2_app_kit::{NSAutoresizingMaskOptions, NSButton, NSFont, NSView};
use objc2_foundation::{MainThreadMarker, NSInteger, NSPoint, NSRect, NSSize, NSString};

use crate::state::{BOOKMARK_COLORS, BOOKMARKS_BAR_HEIGHT, BrowserTabView, TAB_STRIP_HEIGHT, TABS};

use super::{
    make_hairline, remove_all_subviews, set_btn_tint, set_layer_bg, set_layer_radius,
    set_top_corners, srgb, status_dot_color,
};

fn bookmark_label_width(label: &str) -> f64 {
    label
        .chars()
        .map(|ch| if ch.is_ascii() { 7.0 } else { 12.0 })
        .sum::<f64>()
        + 4.0
}

pub(crate) fn rebuild_bookmarks_bar(bar: &NSView, target: &AnyObject, statuses: &[Option<bool>]) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    remove_all_subviews(bar);

    let width = bar.frame().size.width;
    let bottom_line = make_hairline(mtm, 0.0, 0.0, width, 1.0);
    bottom_line.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable);
    bar.addSubview(&bottom_line);

    // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let label_font = unsafe { NSFont::systemFontOfSize(12.0) }; // SAFETY: see comment above.
    let label_color = srgb(0.267, 0.267, 0.267, 1.0);
    let mut x = 14.0;
    let dot_size = 6.0;
    let dot_y = (BOOKMARKS_BAR_HEIGHT - dot_size) / 2.0;
    let button_h = 18.0;
    let button_y = (BOOKMARKS_BAR_HEIGHT - button_h) / 2.0;

    for (index, (tab, _)) in TABS.iter().zip(BOOKMARK_COLORS.iter()).enumerate() {
        let status = statuses.get(index).copied().unwrap_or(None);
        let dot = unsafe {
            // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
            NSView::initWithFrame(
                mtm.alloc(),
                NSRect::new(NSPoint::new(x, dot_y), NSSize::new(dot_size, dot_size)),
            )
        };
        set_layer_bg(&dot, &status_dot_color(status));
        set_layer_radius(&dot, dot_size / 2.0);
        bar.addSubview(&dot);

        let label_x = x + dot_size + 6.0;
        let button_w = bookmark_label_width(tab.label);
        let button = unsafe {
            // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
            NSButton::initWithFrame(
                mtm.alloc(),
                NSRect::new(
                    NSPoint::new(label_x, button_y),
                    NSSize::new(button_w, button_h),
                ),
            )
        };
        button.setTitle(&NSString::from_str(tab.label));
        button.setTag(index as NSInteger);
        button.setBordered(false);
        // SAFETY: `button` is a live NSButton and `label_font` is a valid NSFont instance.
        unsafe { button.setFont(Some(&label_font)) }; // SAFETY: see comment above.
        // SAFETY: `button` is a live NSButton and `setAlignment:` is a valid NSTextAlignment setter on its AppKit class cluster.
        let _: () = unsafe { msg_send![&*button, setAlignment: 0i64] }; // SAFETY: see comment above.
        set_btn_tint(&button, &label_color);
        unsafe {
            // SAFETY: `target` implements `sidebarTabClicked:` and is valid for AppKit target-action dispatch.
            button.setTarget(Some(target));
            button.setAction(Some(sel!(sidebarTabClicked:)));
        }
        bar.addSubview(&button);

        x = label_x + button_w + 16.0;
    }
}

pub(crate) fn rebuild_tab_strip(tab_strip: &NSView, target: &AnyObject, tabs: &[BrowserTabView]) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    remove_all_subviews(tab_strip);

    // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let tab_font = unsafe { NSFont::systemFontOfSize(12.0) }; // SAFETY: see comment above.
    let active_text = srgb(0.12, 0.12, 0.13, 1.0);
    let inactive_text = srgb(0.55, 0.55, 0.57, 1.0);
    let active_tab_bg = srgb(0.961, 0.957, 0.949, 1.0);
    let sep_color = srgb(0.78, 0.77, 0.76, 1.0);

    let tab_h = TAB_STRIP_HEIGHT - 6.0;
    let tab_y = 0.0;
    let close_w = 20.0;
    let pad_left = 78.0;
    let pad_right = 44.0;
    let gap = 1.0;
    let strip_w = tab_strip.frame().size.width;
    let num_tabs = tabs.len().max(1) as f64;
    let available = strip_w - pad_left - pad_right - (num_tabs - 1.0) * gap;
    let tab_w = (available / num_tabs).clamp(80.0, 220.0);
    let mut x = pad_left;

    for (idx, tab) in tabs.iter().enumerate() {
        let title_w = tab_w - close_w - 8.0;
        let title = if tab.loading {
            format!("⟳ {}", tab.title)
        } else {
            tab.title.clone()
        };

        let btn = unsafe {
            // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
            NSButton::initWithFrame(
                mtm.alloc(),
                NSRect::new(NSPoint::new(x, tab_y), NSSize::new(title_w, tab_h)),
            )
        };
        btn.setTitle(&NSString::from_str(&title));
        btn.setTag(tab.id as NSInteger);
        btn.setBordered(false);
        // SAFETY: `btn` is a live NSButton and `tab_font` is a valid NSFont instance.
        unsafe { btn.setFont(Some(&tab_font)) }; // SAFETY: see comment above.
        // SAFETY: `btn` is a live NSButton and `setAlignment:` is a valid NSTextAlignment setter on its AppKit class cluster.
        let _: () = unsafe { msg_send![&*btn, setAlignment: 0i64] }; // SAFETY: see comment above.
        let _: () = unsafe {
            // SAFETY: `btn` exposes an NSCell and both selectors are valid NSCell setters for truncation behavior.
            let cell: *const objc2::runtime::AnyObject = msg_send![&*btn, cell];
            msg_send![cell, setLineBreakMode: 4i64]
        };
        let _: () = unsafe {
            // SAFETY: `btn` exposes an NSCell and `setWraps:` is a valid selector to disable wrapping for tab titles.
            let cell: *const objc2::runtime::AnyObject = msg_send![&*btn, cell];
            msg_send![cell, setWraps: false]
        };
        btn.setWantsLayer(true);
        if tab.active {
            set_layer_bg(&btn, &active_tab_bg);
            set_top_corners(&btn, 8.0);
            set_btn_tint(&btn, &active_text);
        } else {
            set_btn_tint(&btn, &inactive_text);
        }
        unsafe {
            // SAFETY: `target` implements `runtimeTabClicked:` and is valid for AppKit target-action dispatch.
            btn.setTarget(Some(target));
            btn.setAction(Some(sel!(runtimeTabClicked:)));
        }
        tab_strip.addSubview(&btn);

        let close = unsafe {
            // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
            NSButton::initWithFrame(
                mtm.alloc(),
                NSRect::new(
                    NSPoint::new(x + title_w, tab_y),
                    NSSize::new(close_w, tab_h),
                ),
            )
        };
        close.setTitle(&NSString::from_str("×"));
        close.setTag(tab.id as NSInteger);
        close.setBordered(false);
        // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
        let close_font = unsafe { NSFont::systemFontOfSize(12.0) }; // SAFETY: see comment above.
        // SAFETY: `close` is a live NSButton and `close_font` is a valid NSFont instance.
        unsafe { close.setFont(Some(&close_font)) }; // SAFETY: see comment above.
        close.setWantsLayer(true);
        if tab.active {
            set_layer_bg(&close, &active_tab_bg);
            set_top_corners(&close, 8.0);
            if let Some(layer) = close.layer() {
                // SAFETY: `layer` is a live CALayer from the close button and `setMaskedCorners:` accepts the CACornerMask bitset used here.
                let _: () = unsafe { msg_send![&*layer, setMaskedCorners: 2u64] }; // SAFETY: see comment above.
            }
            set_btn_tint(&close, &srgb(0.45, 0.45, 0.47, 1.0));
        } else {
            set_btn_tint(&close, &srgb(0.62, 0.62, 0.64, 1.0));
        }
        unsafe {
            // SAFETY: `target` implements `closeTabClicked:` and is valid for AppKit target-action dispatch.
            close.setTarget(Some(target));
            close.setAction(Some(sel!(closeTabClicked:)));
        }
        tab_strip.addSubview(&close);

        if tab.active
            && let Some(layer) = btn.layer()
        {
            // SAFETY: `layer` is a live CALayer from the tab button and `setMaskedCorners:` accepts the CACornerMask bitset used here.
            let _: () = unsafe { msg_send![&*layer, setMaskedCorners: 1u64] }; // SAFETY: see comment above.
        }

        x += tab_w;
        if !tab.active && idx + 1 < tabs.len() && !tabs[idx + 1].active {
            let sep = unsafe {
                // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
                NSView::initWithFrame(
                    mtm.alloc(),
                    NSRect::new(NSPoint::new(x, tab_y + 6.0), NSSize::new(1.0, tab_h - 12.0)),
                )
            };
            set_layer_bg(&sep, &sep_color);
            tab_strip.addSubview(&sep);
        }
        x += 1.0;
    }

    let plus = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
        NSButton::initWithFrame(
            mtm.alloc(),
            NSRect::new(
                NSPoint::new(x + 6.0, tab_y + 2.0),
                NSSize::new(28.0, tab_h - 4.0),
            ),
        )
    };
    plus.setTitle(&NSString::from_str("+"));
    plus.setBordered(false);
    // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let plus_font = unsafe { NSFont::systemFontOfSize(18.0) }; // SAFETY: see comment above.
    // SAFETY: `plus` is a live NSButton and `plus_font` is a valid NSFont instance.
    unsafe { plus.setFont(Some(&plus_font)) }; // SAFETY: see comment above.
    set_btn_tint(&plus, &srgb(0.55, 0.55, 0.57, 1.0));
    unsafe {
        // SAFETY: `target` implements `newTabClicked:` and is valid for AppKit target-action dispatch.
        plus.setTarget(Some(target));
        plus.setAction(Some(sel!(newTabClicked:)));
    }
    tab_strip.addSubview(&plus);
}
