//! 4-panel layout: toolbar / preview WKWebView / params / timeline.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PanelKind {
    Toolbar,
    Preview,
    Params,
    Timeline,
}

#[derive(Debug, Clone)]
pub struct PanelLayout {
    pub kind: PanelKind,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

pub fn default_layout(width: f32, height: f32) -> Vec<PanelLayout> {
    let toolbar_h = 40.0;
    let timeline_h = 180.0;
    let params_w = 320.0;
    let mid_y = toolbar_h;
    let mid_h = (height - toolbar_h - timeline_h).max(0.0);
    vec![
        PanelLayout {
            kind: PanelKind::Toolbar,
            x: 0.0,
            y: 0.0,
            w: width,
            h: toolbar_h,
        },
        PanelLayout {
            kind: PanelKind::Preview,
            x: 0.0,
            y: mid_y,
            w: (width - params_w).max(0.0),
            h: mid_h,
        },
        PanelLayout {
            kind: PanelKind::Params,
            x: (width - params_w).max(0.0),
            y: mid_y,
            w: params_w.min(width),
            h: mid_h,
        },
        PanelLayout {
            kind: PanelKind::Timeline,
            x: 0.0,
            y: mid_y + mid_h,
            w: width,
            h: timeline_h,
        },
    ]
}
