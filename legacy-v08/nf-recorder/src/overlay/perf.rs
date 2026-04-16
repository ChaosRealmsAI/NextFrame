//! overlay performance logging
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

pub struct PerfLogContext<'a> {
    pub output_path: Option<&'a Path>,
    pub frame_files: &'a [PathBuf],
    pub video_overlay: Option<&'a Path>,
    pub html_duration_sec: Option<f64>,
    pub plan_duration_sec: f64,
    pub width: f64,
    pub height: f64,
    pub dpr: f64,
    pub target_fps: usize,
    pub parallel: usize,
    pub render_scale: f64,
    pub has_audio: bool,
    pub video_layers_count: usize,
    pub audio_src: Option<&'a Path>,
    pub crf: u8,
    pub skip: bool,
    pub skip_aggressive: bool,
}

fn round_tenths(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn path_display_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Measured performance metrics collected during recording.
pub struct PerfMetrics<'a> {
    pub total_frames: usize,
    pub skipped_frames: usize,
    pub content_duration: f64,
    pub record_secs: f64,
    pub overlay_secs: f64,
    pub fps: f64,
    pub size_mb: f64,
    pub pixel_size: (usize, usize),
    pub encoder: &'a str,
}

pub(super) fn format_perf_log_line(
    ts: u64,
    metrics: &PerfMetrics<'_>,
    context: &PerfLogContext<'_>,
    command_args: &[String],
) -> String {
    let total_frames = metrics.total_frames;
    let skipped_frames = metrics.skipped_frames;
    let content_duration = metrics.content_duration;
    let record_secs = metrics.record_secs;
    let overlay_secs = metrics.overlay_secs;
    let fps = metrics.fps;
    let size_mb = metrics.size_mb;
    let pixel_size = metrics.pixel_size;
    let encoder = metrics.encoder;
    let mode = if context.video_overlay.is_some() {
        "clip"
    } else {
        "slide"
    };
    let skip_pct = if total_frames > 0 {
        skipped_frames as f64 / total_frames as f64 * 100.0
    } else {
        0.0
    };
    let total_secs = record_secs + overlay_secs;
    let realtime_x = if total_secs > 0.0 {
        content_duration / total_secs
    } else {
        0.0
    };
    let html_files = context
        .frame_files
        .iter()
        .map(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("unknown")
                .to_owned()
        })
        .collect::<Vec<_>>();
    let first_file = context
        .frame_files
        .first()
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("unknown");

    json!({
        "ts": ts,
        "mode": mode,
        "file": first_file,
        "html_files": html_files,
        "content_s": round_tenths(content_duration),
        "html_duration_sec": context.html_duration_sec.map(round_tenths),
        "plan_duration_sec": round_tenths(context.plan_duration_sec),
        "record_s": round_tenths(record_secs),
        "overlay_s": round_tenths(overlay_secs),
        "total_s": round_tenths(total_secs),
        "realtime_x": round_tenths(realtime_x),
        "fps": round_tenths(fps),
        "frames": total_frames,
        "skipped": skipped_frames,
        "skip_pct": round_tenths(skip_pct),
        "size_mb": round_tenths(size_mb),
        "resolution": format!("{}x{}", pixel_size.0, pixel_size.1),
        "width": context.width,
        "height": context.height,
        "dpr": context.dpr,
        "target_fps": context.target_fps,
        "parallel": context.parallel,
        "render_scale": context.render_scale,
        "has_audio": context.has_audio,
        "has_video_overlay": context.video_layers_count > 0,
        "video_layers_count": context.video_layers_count,
        "audio_src": context.audio_src.map(path_display_string),
        "output_path": context.output_path.map(path_display_string),
        "crf": context.crf,
        "skip": context.skip,
        "skip_aggressive": context.skip_aggressive,
        "status": "done",
        "command_args": command_args,
        "encoder": encoder,
    })
    .to_string()
}

pub fn write_perf_log(_out: &Path, metrics: &PerfMetrics<'_>, context: PerfLogContext<'_>) {
    use std::io::Write;

    if env::var_os(crate::api::OUTPUT_JSON_ENV).is_some() {
        return;
    }

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let command_args = env::args_os()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

    let line = format_perf_log_line(ts, metrics, &context, &command_args);

    let log_path = context
        .output_path
        .as_ref()
        .and_then(|path| path.parent().map(|dir| dir.join("perf.jsonl")))
        .or_else(|| {
            env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|path| path.join("perf.jsonl")))
        })
        .unwrap_or_else(|| PathBuf::from("/tmp/recorder-perf.jsonl"));

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(file, "{line}");
        trace_log!("perf log path: {}", log_path.display());
    }
}
