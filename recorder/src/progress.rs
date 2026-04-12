//! Progress bar geometry shared between DOM probing and pixel overlays.

/// DOM id used by slide templates for the progress bar slot.
#[allow(dead_code)]
pub(crate) const PROGRESS_ELEMENT_ID: &str = "sk-progress";
/// Legacy DOM id used by older HTML templates for the progress track.
#[allow(dead_code)]
pub(crate) const LEGACY_PROGRESS_ELEMENT_ID: &str = "progress";
/// Shadow-DOM-friendly selector used by component slides that render a custom track.
pub const PROGRESS_TRACK_SELECTOR: &str = ".progress-bar .track";
pub const PROGRESS_SELECTOR: &str = "#sk-progress";
pub const LEGACY_PROGRESS_SELECTOR: &str = "#progress";

/// Ordered candidate selectors used when probing the DOM for a progress slot.
pub const PROGRESS_CANDIDATE_SELECTORS: &[&str] = &[
    PROGRESS_SELECTOR,
    LEGACY_PROGRESS_SELECTOR,
    PROGRESS_TRACK_SELECTOR,
];

// Default fill color (#da7756)
const DEFAULT_FILL_R: f64 = 0.855;
const DEFAULT_FILL_G: f64 = 0.467;
const DEFAULT_FILL_B: f64 = 0.337;

/// Parse a hex color string (#RRGGBB or RRGGBB) into (r, g, b) floats 0-1.
#[allow(dead_code)]
pub(crate) fn parse_hex_color(hex: &str) -> Option<(f64, f64, f64)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f64 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f64 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f64 / 255.0;
    Some((r, g, b))
}

/// Physical-pixel bounding box of the progress bar slot.
#[derive(Clone, Copy, Debug)]
pub struct ProgressRect {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
}

impl ProgressRect {
    pub const fn new(x: usize, y: usize, width: usize, height: usize) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

/// Progress bar overlay data passed to the pixel buffer renderer.
pub struct ProgressOverlay<'a> {
    pub x: usize,
    pub y: usize,
    pub fill_w: usize,
    pub max_w: usize,
    pub h: usize,
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub dots: &'a [f64],
}

/// Precomputed progress bar geometry plus segment boundary dots.
#[derive(Clone, Debug)]
pub struct ProgressBar {
    rect: ProgressRect,
    dot_positions: Vec<f64>,
    fill_r: f64,
    fill_g: f64,
    fill_b: f64,
}

impl ProgressBar {
    pub fn new(rect: ProgressRect, segment_durations: &[f64]) -> Self {
        Self {
            rect,
            dot_positions: segment_dot_positions(segment_durations),
            fill_r: DEFAULT_FILL_R,
            fill_g: DEFAULT_FILL_G,
            fill_b: DEFAULT_FILL_B,
        }
    }

    /// Set custom fill color (from --progress-color hex).
    pub fn with_color(mut self, r: f64, g: f64, b: f64) -> Self {
        self.fill_r = r;
        self.fill_g = g;
        self.fill_b = b;
        self
    }

    pub fn overlay(&self, pct: f64) -> ProgressOverlay<'_> {
        let ratio = (pct / 100.0).clamp(0.0, 1.0);
        let fill_w = (self.rect.width as f64 * ratio) as usize;
        ProgressOverlay {
            x: self.rect.x,
            y: self.rect.y,
            fill_w,
            max_w: self.rect.width,
            h: self.rect.height,
            r: self.fill_r,
            g: self.fill_g,
            b: self.fill_b,
            dots: &self.dot_positions,
        }
    }
}

fn segment_dot_positions(segment_durations: &[f64]) -> Vec<f64> {
    let total: f64 = segment_durations.iter().sum();
    if total <= 0.0 {
        return Vec::new();
    }

    let mut dots = Vec::with_capacity(segment_durations.len().saturating_sub(1));
    let mut cumulative = 0.0;
    for (index, duration) in segment_durations.iter().enumerate() {
        cumulative += duration;
        if index + 1 < segment_durations.len() {
            dots.push(cumulative / total);
        }
    }
    dots
}
