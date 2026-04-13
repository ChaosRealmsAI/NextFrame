//! Shared recorder modules used by the CLI and benchmarks.

/// Logging macro that auto-prepends file:line for AI-readable logs.
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

extern crate self as recorder;

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct CommonArgs {
    pub frames: Vec<PathBuf>,
    pub dir: Option<PathBuf>,
    pub out: PathBuf,
    pub fps: usize,
    pub crf: u8,
    pub dpr: f64,
    pub jobs: Option<usize>,
    pub no_skip: bool,
    pub skip_aggressive: bool,
    pub headed: bool,
    pub width: f64,
    pub height: f64,
    pub parallel: Option<usize>,
    /// Only record frames in this range (start, end). Used by parallel subprocess.
    pub frame_range: Option<(usize, usize)>,
    /// Render at a fraction of output resolution, then upscale.
    /// 0.5 = render at half size, 1.0 = native (default).
    pub render_scale: f64,
}

pub mod api;
pub(crate) mod capture;
pub(crate) mod clock;
pub(crate) mod encoder;
pub(crate) mod overlay;
pub(crate) mod parallel;
pub(crate) mod parser;
pub(crate) mod plan;
pub(crate) mod progress;
pub(crate) mod record;
pub(crate) mod server;
pub mod util;
pub(crate) mod webview;
