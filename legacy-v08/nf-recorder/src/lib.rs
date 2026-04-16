//! Shared recorder modules used by the CLI and benchmarks.
use std::io::{self, Write};

use chrono::{SecondsFormat, Utc};
use serde_json::{Value, json};

pub(crate) fn emit_trace(module: impl AsRef<str>, event: impl AsRef<str>, data: Value) {
    let line = json!({
        "ts": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "module": module.as_ref(),
        "event": event.as_ref(),
        "data": data,
    })
    .to_string();
    let _ = writeln!(io::stderr().lock(), "{line}");
}

pub(crate) fn emit_message(module_path: &str, message: String) {
    emit_trace(
        infer_module_name(module_path),
        "message",
        json!({ "message": message }),
    );
}

pub(crate) fn infer_module_name(module_path: &str) -> String {
    let mut segments = module_path.split("::");
    let crate_name = segments.next().unwrap_or(module_path);
    segments.next().map(str::to_owned).unwrap_or_else(|| {
        crate_name
            .rsplit('_')
            .next()
            .unwrap_or(crate_name)
            .to_owned()
    })
}

macro_rules! trace_log {
    ($($arg:tt)*) => {{
        $crate::emit_message(module_path!(), format!($($arg)*));
    }};
}

extern crate self as recorder;

use std::fmt::Display;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub(crate) struct CommonArgs {
    pub frames: Vec<PathBuf>,
    pub dir: Option<PathBuf>,
    pub out: PathBuf,
    pub fps: usize,
    pub crf: u8,
    pub dpr: f64,
    pub jobs: Option<usize>,
    pub skip: bool,
    pub skip_aggressive: bool,
    pub headed: bool,
    pub width: f64,
    pub height: f64,
    pub parallel: usize,
    /// Only record frames in this range (start, end). Used by parallel subprocess.
    pub frame_range: Option<(usize, usize)>,
    /// Render at a fraction of output resolution, then upscale.
    /// 0.5 = render at half size, 1.0 = native (default).
    pub render_scale: f64,
    /// Internal flag for frame-slice subprocesses; skips per-segment audio muxing.
    pub disable_audio: bool,
}

mod api;
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
mod util;
pub(crate) mod webview;

pub use api::{OUTPUT_JSON_ENV, RecordArgs, RecordOutput, overlay_output, record_segments};
pub use util::absolute_path;

pub(crate) fn error_with_fix(action: &str, reason: impl Display, fix: &str) -> String {
    format!("failed to {action}: {reason}. Fix: {fix}")
}

pub(crate) fn internal_error_with_fix(action: &str, reason: impl Display, fix: &str) -> String {
    let _ = fix;
    format!("Internal: failed to {action}: {reason}")
}
