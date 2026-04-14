//! ui module exports
use std::panic::AssertUnwindSafe;

mod menu;
mod toolbar;

use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{NSAutoresizingMaskOptions, NSButton, NSColor, NSTextField, NSView};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString, NSURL, NSURLRequest};
use objc2_web_kit::{WKWebView, WKWebViewConfiguration};

use crate::delegates::{PilotNavDelegate, PilotUIDelegate};

pub(crate) use menu::{rebuild_bookmarks_bar, rebuild_tab_strip};
pub(crate) use toolbar::create_browser_layout;

pub(crate) struct BrowserLayout {
    pub(crate) tab_strip: Retained<NSView>,
    pub(crate) toolbar: Retained<NSView>,
    pub(crate) bookmarks_bar: Retained<NSView>,
    pub(crate) webview_host: Retained<NSView>,
    pub(crate) address_field: Retained<NSTextField>,
    pub(crate) back_button: Retained<NSButton>,
    pub(crate) forward_button: Retained<NSButton>,
    pub(crate) reload_button: Retained<NSButton>,
}

fn catch_objc(f: impl FnOnce()) -> Result<(), String> {
    // SAFETY: `objc2::exception::catch` only wraps the provided closure and is designed for this FFI boundary.
    let result = unsafe { objc2::exception::catch(AssertUnwindSafe(f)) }; // SAFETY: see comment above.
    result.map_err(|e| format!("ObjC exception: {e:?}"))
}

fn srgb(r: f64, g: f64, b: f64, a: f64) -> Retained<NSColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, a)
}

fn set_layer_bg(view: &NSView, color: &NSColor) {
    view.setWantsLayer(true);
    if let Some(layer) = view.layer() {
        let cg = color.CGColor();
        // SAFETY: `layer` is a live CALayer from this NSView and `setBackgroundColor:` accepts the CGColor pointer returned by AppKit.
        let _: () = unsafe { msg_send![&*layer, setBackgroundColor: Some(&*cg)] }; // SAFETY: see comment above.
    }
}

fn set_layer_radius(view: &NSView, radius: f64) {
    view.setWantsLayer(true);
    if let Some(layer) = view.layer() {
        // SAFETY: `layer` is a live CALayer from this NSView and `setCornerRadius:` is a valid CALayer selector for an f64 radius.
        let _: () = unsafe { msg_send![&*layer, setCornerRadius: radius] }; // SAFETY: see comment above.
    }
}

fn set_top_corners(view: &NSView, radius: f64) {
    view.setWantsLayer(true);
    if let Some(layer) = view.layer() {
        // SAFETY: `layer` is a live CALayer from this NSView and `setCornerRadius:` is a valid CALayer selector for an f64 radius.
        let _: () = unsafe { msg_send![&*layer, setCornerRadius: radius] }; // SAFETY: see comment above.
        // SAFETY: `layer` is a live CALayer and `setMaskedCorners:` accepts the CACornerMask bitset used here.
        let _: () = unsafe { msg_send![&*layer, setMaskedCorners: 3u64] }; // SAFETY: see comment above.
    }
}

fn set_btn_tint(btn: &NSButton, color: &NSColor) {
    // SAFETY: `btn` is a live NSButton and `setContentTintColor:` is a valid selector taking an NSColor.
    let _: () = unsafe { msg_send![btn, setContentTintColor: color] }; // SAFETY: see comment above.
}

fn remove_all_subviews(view: &NSView) {
    let subviews = view.subviews();
    for idx in (0..subviews.len()).rev() {
        let child = &*subviews.objectAtIndex(idx);
        let _ = catch_objc(|| {
            // SAFETY: `child` came from `view.subviews()` and `removeFromSuperview` is valid for every NSView.
            let _: () = unsafe { msg_send![child, removeFromSuperview] }; // SAFETY: see comment above.
        });
    }
}

fn make_hairline(mtm: MainThreadMarker, x: f64, y: f64, w: f64, h: f64) -> Retained<NSView> {
    // SAFETY: `mtm` guarantees main-thread AppKit access and `alloc()` returns an uninitialized NSView ready for `initWithFrame:`.
    let view = unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(x, y), NSSize::new(w, h)),
        )
    };
    set_layer_bg(&view, &srgb(0.910, 0.898, 0.882, 1.0));
    view
}

fn status_dot_color(status: Option<bool>) -> Retained<NSColor> {
    match status {
        Some(true) => srgb(0.204, 0.780, 0.349, 1.0),
        Some(false) => srgb(1.0, 0.231, 0.188, 1.0),
        None => srgb(0.780, 0.780, 0.800, 1.0),
    }
}

pub(crate) fn move_traffic_lights(window: &objc2_app_kit::NSWindow) {
    use objc2_app_kit::NSWindowButton;
    let padding_x = 10.0f64;
    let padding_y = 10.0f64;

    // SAFETY: `window` is a live NSWindow on the main thread and the queried standard buttons/contentLayoutRect selectors are valid NSWindow APIs.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        let close = window.standardWindowButton(NSWindowButton::CloseButton);
        let mini = window.standardWindowButton(NSWindowButton::MiniaturizeButton);
        let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);
        let (Some(close), Some(mini), Some(zoom)) = (close, mini, zoom) else {
            return;
        };

        let win_frame = window.frame();
        let content_rect: NSRect = msg_send![window, contentLayoutRect];
        let titlebar_h = win_frame.size.height - content_rect.size.height;

        let close_frame = close.frame();
        let mini_frame = mini.frame();
        let btn_h = close_frame.size.height;
        let spacing = mini_frame.origin.x - close_frame.origin.x;
        let y = titlebar_h - padding_y - btn_h;
        let mut x = padding_x;

        let mut cf = close_frame;
        cf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*close, setFrame: cf];
        x += spacing;

        let mut mf = mini_frame;
        mf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*mini, setFrame: mf];
        x += spacing;

        let mut zf = zoom.frame();
        zf.origin = NSPoint::new(x, y);
        let _: () = msg_send![&*zoom, setFrame: zf];
    }
}

pub(crate) fn create_webview(
    mtm: MainThreadMarker,
    frame: NSRect,
    url: &str,
    config: &WKWebViewConfiguration,
    ui_delegate: &PilotUIDelegate,
    nav_delegate: &PilotNavDelegate,
) -> Retained<WKWebView> {
    // SAFETY: `mtm` guarantees main-thread WebKit construction and `config` stays alive for the life of the app state.
    let webview = unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, config) }; // SAFETY: see comment above.
    // SAFETY: `webview` is freshly created and both delegates are Objective-C objects implementing the protocols WebKit expects.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.setUIDelegate(Some(ProtocolObject::from_ref(ui_delegate)));
        webview.setNavigationDelegate(Some(ProtocolObject::from_ref(nav_delegate)));
    }
    webview.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    if let Some(url) = NSURL::URLWithString(&NSString::from_str(url)) {
        let request = NSURLRequest::requestWithURL(&url);
        // SAFETY: `request` is a valid NSURLRequest and `loadRequest:` is the standard WKWebView navigation entry point.
        unsafe { // SAFETY: see comment above.
            // SAFETY: see comment above.
            webview.loadRequest(&request);
        }
    }
    webview
}
