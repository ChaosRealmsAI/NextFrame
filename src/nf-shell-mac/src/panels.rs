#![deny(unsafe_op_in_unsafe_fn)]

use objc2::rc::Retained;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSBezierPath, NSColor, NSEvent, NSFont, NSLayoutConstraint, NSTextAlignment, NSTextField,
    NSView,
};
use objc2_foundation::{NSArray, NSPoint, NSRect, NSSize, NSString};

pub const TITLE_BAR_HEIGHT: f64 = 48.0;
pub const RIGHT_PANEL_WIDTH: f64 = 320.0;
pub const TIMELINE_HEIGHT: f64 = 320.0;

#[derive(Clone, Copy, Debug)]
struct ViewStyle {
    fill: [f64; 4],
    stroke: [f64; 4],
    draw_bottom_border: bool,
    draggable: bool,
}

const TITLE_STYLE: ViewStyle = ViewStyle {
    fill: [0.10, 0.11, 0.14, 1.0],
    stroke: [0.20, 0.21, 0.27, 1.0],
    draw_bottom_border: true,
    draggable: true,
};

const PREVIEW_STYLE: ViewStyle = ViewStyle {
    fill: [0.07, 0.08, 0.10, 1.0],
    stroke: [0.18, 0.20, 0.25, 1.0],
    draw_bottom_border: false,
    draggable: false,
};

const PARAMS_STYLE: ViewStyle = ViewStyle {
    fill: [0.13, 0.12, 0.10, 1.0],
    stroke: [0.27, 0.24, 0.18, 1.0],
    draw_bottom_border: false,
    draggable: false,
};

const TIMELINE_STYLE: ViewStyle = ViewStyle {
    fill: [0.09, 0.12, 0.10, 1.0],
    stroke: [0.17, 0.23, 0.19, 1.0],
    draw_bottom_border: false,
    draggable: false,
};

define_class!(
    #[unsafe(super(NSView))]
    #[ivars = ViewStyle]
    struct PanelView;

    impl PanelView {
        #[unsafe(method(isFlipped))]
        fn is_flipped(&self) -> bool {
            true
        }

        #[unsafe(method(drawRect:))]
        fn draw_rect(&self, _dirty_rect: NSRect) {
            let bounds = self.bounds();
            fill_rect(bounds, self.ivars().fill);
            stroke_color(self.ivars().stroke);
            if self.ivars().draw_bottom_border {
                let y = bounds.size.height - 0.5;
                NSBezierPath::strokeLineFromPoint_toPoint(
                    NSPoint::new(0.0, y),
                    NSPoint::new(bounds.size.width, y),
                );
            } else {
                NSBezierPath::strokeRect(bounds);
            }
        }
    }
);

impl PanelView {
    fn new(mtm: MainThreadMarker, style: ViewStyle) -> Retained<Self> {
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
        let this = Self::alloc(mtm).set_ivars(style);
        // SAFETY: `PanelView` inherits `NSView`; this is the designated initializer.
        unsafe { msg_send![super(this), initWithFrame: frame] }
    }
}

define_class!(
    #[unsafe(super(NSView))]
    #[ivars = ViewStyle]
    struct TitleBarView;

    impl TitleBarView {
        #[unsafe(method(isFlipped))]
        fn is_flipped(&self) -> bool {
            true
        }

        #[unsafe(method(mouseDownCanMoveWindow))]
        fn mouse_down_can_move_window(&self) -> bool {
            self.ivars().draggable
        }

        #[unsafe(method(drawRect:))]
        fn draw_rect(&self, _dirty_rect: NSRect) {
            let bounds = self.bounds();
            fill_rect(bounds, self.ivars().fill);
            stroke_color(self.ivars().stroke);
            let y = bounds.size.height - 0.5;
            NSBezierPath::strokeLineFromPoint_toPoint(
                NSPoint::new(0.0, y),
                NSPoint::new(bounds.size.width, y),
            );
            draw_traffic_lights();
        }

        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            let point = self.convertPoint_fromView(event.locationInWindow(), None);
            if let Some(window) = self.window() {
                if traffic_hit(point, 16.0) {
                    window.performClose(None);
                    return;
                }
                if traffic_hit(point, 36.0) {
                    window.performMiniaturize(None);
                    return;
                }
                if traffic_hit(point, 56.0) {
                    window.performZoom(None);
                    return;
                }
            }
            // SAFETY: Forwarding the original event to `NSView` preserves dragging behavior.
            unsafe { msg_send![super(self), mouseDown: event] }
        }
    }
);

impl TitleBarView {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
        let this = Self::alloc(mtm).set_ivars(TITLE_STYLE);
        // SAFETY: `TitleBarView` inherits `NSView`; this is the designated initializer.
        unsafe { msg_send![super(this), initWithFrame: frame] }
    }
}

pub struct PanelViews {
    pub title_bar: Retained<NSView>,
    pub preview_host: Retained<NSView>,
    pub params_panel: Retained<NSView>,
    pub timeline_panel: Retained<NSView>,
}

pub fn install(content_view: &NSView, mtm: MainThreadMarker) -> Result<PanelViews, String> {
    let title_bar = TitleBarView::new(mtm);
    let preview = PanelView::new(mtm, PREVIEW_STYLE);
    let params = PanelView::new(mtm, PARAMS_STYLE);
    let timeline = PanelView::new(mtm, TIMELINE_STYLE);

    let views: [&NSView; 4] = [
        title_bar.as_ref(),
        preview.as_ref(),
        params.as_ref(),
        timeline.as_ref(),
    ];
    for view in views {
        view.setTranslatesAutoresizingMaskIntoConstraints(false);
        content_view.addSubview(view);
    }

    install_title_contents(title_bar.as_ref(), mtm);
    install_preview_badge(preview.as_ref(), mtm);
    install_params_contents(params.as_ref(), mtm);
    install_timeline_contents(timeline.as_ref(), mtm);

    let constraints = NSArray::from_retained_slice(&[
        title_bar
            .leadingAnchor()
            .constraintEqualToAnchor(&content_view.leadingAnchor()),
        title_bar
            .trailingAnchor()
            .constraintEqualToAnchor(&content_view.trailingAnchor()),
        title_bar
            .topAnchor()
            .constraintEqualToAnchor(&content_view.topAnchor()),
        title_bar.heightAnchor().constraintEqualToConstant(TITLE_BAR_HEIGHT),
        timeline
            .leadingAnchor()
            .constraintEqualToAnchor(&content_view.leadingAnchor()),
        timeline
            .trailingAnchor()
            .constraintEqualToAnchor(&content_view.trailingAnchor()),
        timeline
            .bottomAnchor()
            .constraintEqualToAnchor(&content_view.bottomAnchor()),
        timeline
            .heightAnchor()
            .constraintEqualToConstant(TIMELINE_HEIGHT),
        params
            .trailingAnchor()
            .constraintEqualToAnchor(&content_view.trailingAnchor()),
        params
            .topAnchor()
            .constraintEqualToAnchor(&title_bar.bottomAnchor()),
        params
            .bottomAnchor()
            .constraintEqualToAnchor(&timeline.topAnchor()),
        params
            .widthAnchor()
            .constraintEqualToConstant(RIGHT_PANEL_WIDTH),
        preview
            .leadingAnchor()
            .constraintEqualToAnchor(&content_view.leadingAnchor()),
        preview
            .topAnchor()
            .constraintEqualToAnchor(&title_bar.bottomAnchor()),
        preview
            .trailingAnchor()
            .constraintEqualToAnchor(&params.leadingAnchor()),
        preview
            .bottomAnchor()
            .constraintEqualToAnchor(&timeline.topAnchor()),
    ]);
    NSLayoutConstraint::activateConstraints(&constraints);

    Ok(PanelViews {
        title_bar: Retained::into_super(title_bar),
        preview_host: Retained::into_super(preview),
        params_panel: Retained::into_super(params),
        timeline_panel: Retained::into_super(timeline),
    })
}

fn install_title_contents(title_bar: &NSView, mtm: MainThreadMarker) {
    let brand = make_label(mtm, "NextFrame", 13.0, true, [0.96, 0.97, 0.99, 1.0]);
    let file_hint = make_label(
        mtm,
        "Play Shell",
        11.0,
        false,
        [0.62, 0.65, 0.74, 1.0],
    );
    let action = make_pill(mtm, "Export");

    let title_subviews: [&NSView; 3] = [brand.as_ref(), file_hint.as_ref(), action.as_ref()];
    for view in title_subviews {
        view.setTranslatesAutoresizingMaskIntoConstraints(false);
        title_bar.addSubview(view);
    }

    let constraints = NSArray::from_retained_slice(&[
        brand
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&title_bar.leadingAnchor(), 96.0),
        brand
            .centerYAnchor()
            .constraintEqualToAnchor(&title_bar.centerYAnchor()),
        file_hint
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&brand.trailingAnchor(), 12.0),
        file_hint
            .centerYAnchor()
            .constraintEqualToAnchor(&title_bar.centerYAnchor()),
        action
            .trailingAnchor()
            .constraintEqualToAnchor_constant(&title_bar.trailingAnchor(), -18.0),
        action
            .centerYAnchor()
            .constraintEqualToAnchor(&title_bar.centerYAnchor()),
        action.widthAnchor().constraintEqualToConstant(72.0),
        action.heightAnchor().constraintEqualToConstant(28.0),
    ]);
    NSLayoutConstraint::activateConstraints(&constraints);
}

fn install_preview_badge(preview: &NSView, mtm: MainThreadMarker) {
    let label = make_label(mtm, "Preview", 12.0, true, [0.73, 0.80, 0.92, 1.0]);
    label.setTranslatesAutoresizingMaskIntoConstraints(false);
    preview.addSubview(label.as_ref());

    let constraints = NSArray::from_retained_slice(&[
        label
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&preview.leadingAnchor(), 16.0),
        label
            .topAnchor()
            .constraintEqualToAnchor_constant(&preview.topAnchor(), 12.0),
    ]);
    NSLayoutConstraint::activateConstraints(&constraints);
}

fn install_params_contents(panel: &NSView, mtm: MainThreadMarker) {
    let title = make_label(mtm, "Params", 14.0, true, [0.96, 0.94, 0.88, 1.0]);
    let rows = [
        "mode      play",
        "viewport  1920x1080",
        "bridge    nfBridge",
        "watcher   source.json",
    ];
    let mut row_labels = Vec::new();
    for row in rows {
        row_labels.push(make_label(mtm, row, 11.0, false, [0.84, 0.80, 0.72, 1.0]));
    }

    title.setTranslatesAutoresizingMaskIntoConstraints(false);
    panel.addSubview(title.as_ref());
    for label in &row_labels {
        label.setTranslatesAutoresizingMaskIntoConstraints(false);
        panel.addSubview(label.as_ref());
    }

    let mut constraints = vec![
        title
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&panel.leadingAnchor(), 18.0),
        title
            .topAnchor()
            .constraintEqualToAnchor_constant(&panel.topAnchor(), 18.0),
    ];

    let mut previous: &NSView = title.as_ref();
    for label in &row_labels {
        constraints.push(
            label
                .leadingAnchor()
                .constraintEqualToAnchor_constant(&panel.leadingAnchor(), 18.0),
        );
        constraints.push(
            label
                .topAnchor()
                .constraintEqualToAnchor_constant(&previous.bottomAnchor(), 14.0),
        );
        previous = label.as_ref();
    }

    let constraints = NSArray::from_retained_slice(&constraints);
    NSLayoutConstraint::activateConstraints(&constraints);
}

fn install_timeline_contents(panel: &NSView, mtm: MainThreadMarker) {
    let title = make_label(mtm, "Timeline", 14.0, true, [0.90, 0.97, 0.93, 1.0]);
    let ruler = make_label(mtm, "0s      2s      4s      6s", 11.0, false, [0.65, 0.82, 0.73, 1.0]);
    let tracks = [
        "T  title                [========        ]",
        "A  voice                [==============  ]",
        "B  markers              [=====           ]",
    ];
    let mut track_labels = Vec::new();
    for track in tracks {
        track_labels.push(make_label(mtm, track, 11.0, false, [0.76, 0.90, 0.82, 1.0]));
    }

    title.setTranslatesAutoresizingMaskIntoConstraints(false);
    ruler.setTranslatesAutoresizingMaskIntoConstraints(false);
    panel.addSubview(title.as_ref());
    panel.addSubview(ruler.as_ref());
    for label in &track_labels {
        label.setTranslatesAutoresizingMaskIntoConstraints(false);
        panel.addSubview(label.as_ref());
    }

    let mut constraints = vec![
        title
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&panel.leadingAnchor(), 18.0),
        title
            .topAnchor()
            .constraintEqualToAnchor_constant(&panel.topAnchor(), 18.0),
        ruler
            .leadingAnchor()
            .constraintEqualToAnchor_constant(&panel.leadingAnchor(), 18.0),
        ruler
            .topAnchor()
            .constraintEqualToAnchor_constant(&title.bottomAnchor(), 18.0),
    ];

    let mut previous: &NSView = ruler.as_ref();
    for label in &track_labels {
        constraints.push(
            label
                .leadingAnchor()
                .constraintEqualToAnchor_constant(&panel.leadingAnchor(), 18.0),
        );
        constraints.push(
            label
                .topAnchor()
                .constraintEqualToAnchor_constant(&previous.bottomAnchor(), 16.0),
        );
        previous = label.as_ref();
    }

    let constraints = NSArray::from_retained_slice(&constraints);
    NSLayoutConstraint::activateConstraints(&constraints);
}

fn make_label(
    mtm: MainThreadMarker,
    text: &str,
    size: f64,
    bold: bool,
    rgba: [f64; 4],
) -> Retained<NSTextField> {
    let text = NSString::from_str(text);
    let label = NSTextField::labelWithString(&text, mtm);
    label.setTextColor(Some(&rgba_color(rgba)));
    label.setAlignment(NSTextAlignment::Left);
    let font = if bold {
        NSFont::boldSystemFontOfSize(size)
    } else {
        NSFont::systemFontOfSize(size)
    };
    label.setFont(Some(font.as_ref()));
    label
}

fn make_pill(mtm: MainThreadMarker, text: &str) -> Retained<NSTextField> {
    let pill = make_label(mtm, text, 11.0, true, [0.12, 0.12, 0.13, 1.0]);
    pill.setBackgroundColor(Some(&rgba_color([0.94, 0.68, 0.24, 1.0])));
    pill.setBordered(false);
    pill.setBezeled(false);
    pill.setDrawsBackground(true);
    pill.setAlignment(NSTextAlignment::Center);
    pill
}

fn fill_rect(rect: NSRect, rgba: [f64; 4]) {
    rgba_color(rgba).setFill();
    NSBezierPath::fillRect(rect);
}

fn stroke_color(rgba: [f64; 4]) {
    rgba_color(rgba).setStroke();
}

fn rgba_color(rgba: [f64; 4]) -> Retained<NSColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(rgba[0], rgba[1], rgba[2], rgba[3])
}

fn draw_traffic_lights() {
    for (x, rgba) in [
        (16.0, [1.0, 0.37, 0.32, 1.0]),
        (36.0, [1.0, 0.74, 0.18, 1.0]),
        (56.0, [0.16, 0.84, 0.43, 1.0]),
    ] {
        rgba_color(rgba).setFill();
        NSBezierPath::bezierPathWithOvalInRect(NSRect::new(
            NSPoint::new(x, 18.0),
            NSSize::new(12.0, 12.0),
        ))
        .fill();
    }
}

fn traffic_hit(point: NSPoint, x: f64) -> bool {
    point.x >= x && point.x <= x + 12.0 && point.y >= 18.0 && point.y <= 30.0
}
