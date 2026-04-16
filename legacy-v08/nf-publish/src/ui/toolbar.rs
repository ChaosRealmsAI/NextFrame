//! ui toolbar ui construction
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::sel;
use objc2_app_kit::{NSAutoresizingMaskOptions, NSButton, NSFont, NSTextField, NSView};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

use crate::state::{BOOKMARKS_BAR_HEIGHT, TAB_STRIP_HEIGHT, TOOLBAR_HEIGHT};

use super::{BrowserLayout, make_hairline, set_btn_tint, set_layer_bg, set_layer_radius, srgb};

pub(crate) fn create_browser_layout(
    mtm: MainThreadMarker,
    width: f64,
    height: f64,
    target: &AnyObject,
) -> BrowserLayout {
    let tab_strip_bg = srgb(0.855, 0.847, 0.835, 1.0);
    let toolbar_bg = srgb(0.961, 0.957, 0.949, 1.0);
    let bookmarks_bg = srgb(0.976, 0.973, 0.968, 1.0);

    let tab_strip = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(
                NSPoint::new(0.0, height - TAB_STRIP_HEIGHT),
                NSSize::new(width, TAB_STRIP_HEIGHT),
            ),
        )
    };
    tab_strip.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    set_layer_bg(&tab_strip, &tab_strip_bg);

    let toolbar_y = height - TAB_STRIP_HEIGHT - TOOLBAR_HEIGHT;
    let toolbar = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(
                NSPoint::new(0.0, toolbar_y),
                NSSize::new(width, TOOLBAR_HEIGHT),
            ),
        )
    };
    toolbar.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    set_layer_bg(&toolbar, &toolbar_bg);

    let bookmarks_y = height - TAB_STRIP_HEIGHT - TOOLBAR_HEIGHT - BOOKMARKS_BAR_HEIGHT;
    let bookmarks_bar = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(
                NSPoint::new(0.0, bookmarks_y),
                NSSize::new(width, BOOKMARKS_BAR_HEIGHT),
            ),
        )
    };
    bookmarks_bar.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    set_layer_bg(&bookmarks_bar, &bookmarks_bg);
    let bookmarks_line = make_hairline(mtm, 0.0, 0.0, width, 1.0);
    bookmarks_line.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable);
    bookmarks_bar.addSubview(&bookmarks_line);

    let wv_h = height - TAB_STRIP_HEIGHT - TOOLBAR_HEIGHT - BOOKMARKS_BAR_HEIGHT;
    let webview_host = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSView is immediately initialized with a valid frame.
        NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width, wv_h)),
        )
    };
    webview_host.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let nav_font = unsafe { NSFont::systemFontOfSize(20.0) }; // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let nav_tint = srgb(0.30, 0.30, 0.32, 1.0);
    let btn_y = (TOOLBAR_HEIGHT - 32.0) / 2.0;
    let back_button = make_nav_btn(
        mtm,
        12.0,
        btn_y,
        "‹",
        &nav_font,
        &nav_tint,
        target,
        sel!(toolbarBackClicked:),
    );
    let forward_button = make_nav_btn(
        mtm,
        44.0,
        btn_y,
        "›",
        &nav_font,
        &nav_tint,
        target,
        sel!(toolbarForwardClicked:),
    );
    let reload_button = make_nav_btn(
        mtm,
        76.0,
        btn_y,
        "↻",
        &nav_font,
        &nav_tint,
        target,
        sel!(toolbarReloadClicked:),
    );
    toolbar.addSubview(&back_button);
    toolbar.addSubview(&forward_button);
    toolbar.addSubview(&reload_button);

    let addr_x = 116.0;
    let addr_h = 22.0;
    let addr_y = (TOOLBAR_HEIGHT - addr_h) / 2.0;
    let address_field = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSTextField is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSTextField is immediately initialized with a valid frame.
        NSTextField::initWithFrame(
            mtm.alloc(),
            NSRect::new(
                NSPoint::new(addr_x, addr_y),
                NSSize::new((width - addr_x - 14.0).max(160.0), addr_h),
            ),
        )
    };
    address_field.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    address_field.setEditable(true);
    address_field.setSelectable(true);
    address_field.setBezeled(false);
    address_field.setBordered(false);
    address_field.setDrawsBackground(false);
    set_layer_bg(&address_field, &srgb(0.925, 0.920, 0.910, 1.0));
    set_layer_radius(&address_field, 6.0);
    address_field.setTextColor(Some(&srgb(0.15, 0.15, 0.16, 1.0)));
    // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    let addr_font = unsafe { NSFont::systemFontOfSize(13.0) }; // SAFETY: `systemFontOfSize:` is an AppKit constructor returning a valid shared NSFont for this size on the main thread.
    // SAFETY: `address_field` is a live NSTextField and `addr_font` is a valid NSFont instance.
    unsafe { address_field.setFont(Some(&addr_font)) }; // SAFETY: `address_field` is a live NSTextField and `addr_font` is a valid NSFont instance.
    address_field.setPlaceholderString(Some(&NSString::from_str("Search or enter URL")));
    unsafe {
        // SAFETY: `target` is the Objective-C action target for the toolbar and `addressBarSubmitted:` is implemented on it.
        // SAFETY: `target` is the Objective-C action target for the toolbar and `addressBarSubmitted:` is implemented on it.
        address_field.setTarget(Some(target));
        address_field.setAction(Some(sel!(addressBarSubmitted:)));
    }
    toolbar.addSubview(&address_field);

    BrowserLayout {
        tab_strip,
        toolbar,
        bookmarks_bar,
        webview_host,
        address_field,
        back_button,
        forward_button,
        reload_button,
    }
}

#[allow(clippy::too_many_arguments)]
fn make_nav_btn(
    mtm: MainThreadMarker,
    x: f64,
    y: f64,
    title: &str,
    font: &NSFont,
    tint: &objc2_app_kit::NSColor,
    target: &AnyObject,
    action: objc2::runtime::Sel,
) -> Retained<NSButton> {
    let btn = unsafe {
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
        // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSButton is immediately initialized with a valid frame.
        NSButton::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(x, y), NSSize::new(32.0, 32.0)),
        )
    };
    btn.setTitle(&NSString::from_str(title));
    btn.setBordered(false);
    // SAFETY: `btn` is a live NSButton and `font` is a valid NSFont to install on the control.
    unsafe { btn.setFont(Some(font)) }; // SAFETY: `btn` is a live NSButton and `font` is a valid NSFont to install on the control.
    set_btn_tint(&btn, tint);
    unsafe {
        // SAFETY: `target` is the Objective-C action target for the toolbar button and `action` is one of the implemented selectors on that target.
        // SAFETY: `target` is the Objective-C action target for the toolbar button and `action` is one of the implemented selectors on that target.
        btn.setTarget(Some(target));
        btn.setAction(Some(action));
    }
    btn
}
