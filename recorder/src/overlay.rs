use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use crate::plan::VideoLayerInfo;

const OVERLAY_X: usize = 80;
const OVERLAY_Y: usize = 276;
const OVERLAY_WIDTH: usize = 920;
const OVERLAY_HEIGHT: usize = 538;

fn build_overlay_filter() -> String {
    format!(
        "[1:v]scale={OVERLAY_WIDTH}:{OVERLAY_HEIGHT}:force_original_aspect_ratio=decrease,\
         pad={OVERLAY_WIDTH}:{OVERLAY_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black[vid];\
         [0:v][vid]overlay={OVERLAY_X}:{OVERLAY_Y}[out]"
    )
}

#[derive(Debug, Clone, PartialEq)]
pub struct VideoOverlaySpec {
    pub source_path: PathBuf,
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
    pub start_sec: f64,
    pub duration_sec: f64,
}

fn urlencoding_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            if let (Some(h), Some(l)) = (hi, lo) {
                result.push((h * 16 + l) as u8 as char);
            } else {
                result.push('%');
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

fn strip_query_and_fragment(input: &str) -> &str {
    let end = input
        .find(|ch| ch == '?' || ch == '#')
        .unwrap_or(input.len());
    &input[..end]
}

fn resolve_overlay_source(src: &str, root: &Path, html_path: &Path) -> Option<PathBuf> {
    let raw = strip_query_and_fragment(src.trim());
    if raw.is_empty() {
        return None;
    }

    if let Some(stripped) = raw.strip_prefix("file://") {
        let decoded = urlencoding_decode(stripped.trim_start_matches("localhost/"));
        let path = PathBuf::from(decoded);
        return path.exists().then_some(path);
    }

    if raw.starts_with("http://") || raw.starts_with("https://") {
        if let Some((_, path_part)) = raw.split_once("://")
            && let Some((_, slash_and_path)) = path_part.split_once('/')
        {
            let path = root.join(urlencoding_decode(slash_and_path));
            if path.exists() {
                return Some(path);
            }
        }
        return None;
    }

    let decoded = urlencoding_decode(raw);
    let absolute = PathBuf::from(&decoded);
    if absolute.is_absolute() && absolute.exists() {
        return Some(absolute);
    }
    if decoded.starts_with('/') {
        let from_root = root.join(decoded.trim_start_matches('/'));
        if from_root.exists() {
            return Some(from_root);
        }
    }

    let parent = html_path.parent().unwrap_or_else(|| Path::new("."));
    let relative = parent.join(decoded);
    relative.exists().then_some(relative)
}

fn parse_layer_axis(raw: &str, axis_pixels: f64, dpr: f64, label: &str) -> Result<usize, String> {
    let trimmed = raw.trim();
    let value = if let Some(percent) = trimmed.strip_suffix('%') {
        percent
            .trim()
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} percentage {raw:?}: {err}"))?
            / 100.0
            * axis_pixels
    } else if let Some(px) = trimmed.strip_suffix("px") {
        px.trim()
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} pixel value {raw:?}: {err}"))?
            * dpr
    } else {
        trimmed
            .parse::<f64>()
            .map_err(|err| format!("invalid {label} value {raw:?}: {err}"))?
            * dpr
    };
    Ok(value.round().max(0.0) as usize)
}

pub fn build_video_overlay_specs(
    layers: &[VideoLayerInfo],
    root: &Path,
    html_path: &Path,
    output_width_css: f64,
    output_height_css: f64,
    dpr: f64,
) -> Result<Vec<VideoOverlaySpec>, String> {
    let output_width_px = (output_width_css * dpr).round().max(1.0);
    let output_height_px = (output_height_css * dpr).round().max(1.0);
    let mut overlays = Vec::with_capacity(layers.len());

    for layer in layers {
        let source_path = resolve_overlay_source(&layer.src, root, html_path)
            .ok_or_else(|| format!("failed to resolve video layer src {}", layer.src))?;
        let width = parse_layer_axis(&layer.w, output_width_px, dpr, "w")?;
        let height = parse_layer_axis(&layer.h, output_height_px, dpr, "h")?;
        if width == 0 || height == 0 || layer.dur <= 0.0 {
            continue;
        }
        overlays.push(VideoOverlaySpec {
            source_path,
            x: parse_layer_axis(&layer.x, output_width_px, dpr, "x")?,
            y: parse_layer_axis(&layer.y, output_height_px, dpr, "y")?,
            width,
            height,
            start_sec: layer.start.max(0.0),
            duration_sec: layer.dur.max(0.0),
        });
    }

    Ok(overlays)
}

fn build_video_layer_filter(layers: &[VideoOverlaySpec]) -> String {
    let mut filters = Vec::with_capacity(layers.len() * 3);
    let mut current = "[0:v]".to_owned();

    for (index, layer) in layers.iter().enumerate() {
        let scaled = format!("[layer{index}_scaled]");
        let shifted = format!("[layer{index}_shifted]");
        let output = if index + 1 == layers.len() {
            "[out]".to_owned()
        } else {
            format!("[base{}]", index + 1)
        };
        let end_sec = layer.start_sec + layer.duration_sec.max(0.0);

        filters.push(format!(
            "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black{}",
            index + 1,
            layer.width,
            layer.height,
            layer.width,
            layer.height,
            scaled
        ));
        filters.push(format!(
            "{}setpts=PTS-STARTPTS+{:.6}/TB{}",
            scaled, layer.start_sec, shifted
        ));
        filters.push(format!(
            "{}{}overlay={}:{}:enable='between(t,{:.6},{:.6})':eof_action=pass{}",
            current, shifted, layer.x, layer.y, layer.start_sec, end_sec, output
        ));
        current = output;
    }

    filters.join(";")
}

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
    pub parallel: Option<usize>,
    pub render_scale: f64,
    pub has_audio: bool,
    pub video_layers_count: usize,
    pub audio_src: Option<&'a Path>,
}

fn round_tenths(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn path_display_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[allow(clippy::too_many_arguments)]
fn format_perf_log_line(
    ts: u64,
    total_frames: usize,
    skipped_frames: usize,
    content_duration: f64,
    record_secs: f64,
    overlay_secs: f64,
    fps: f64,
    size_mb: f64,
    pixel_size: (usize, usize),
    encoder: &str,
    context: &PerfLogContext<'_>,
    command_args: &[String],
) -> String {
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
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
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
        "command_args": command_args,
        "encoder": encoder,
    })
    .to_string()
}

#[allow(clippy::too_many_arguments)]
pub fn write_perf_log(
    _out: &Path,
    total_frames: usize,
    skipped_frames: usize,
    content_duration: f64,
    record_secs: f64,
    overlay_secs: f64,
    fps: f64,
    size_mb: f64,
    pixel_size: (usize, usize),
    encoder: &str,
    context: PerfLogContext<'_>,
) {
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

    let line = format_perf_log_line(
        ts,
        total_frames,
        skipped_frames,
        content_duration,
        record_secs,
        overlay_secs,
        fps,
        size_mb,
        pixel_size,
        encoder,
        &context,
        &command_args,
    );

    // Write perf log next to the output MP4 file for easy project-level analysis.
    // Fallback: next to the recorder binary, then /tmp.
    let log_path = context
        .output_path
        .as_ref()
        .and_then(|p| p.parent().map(|d| d.join("perf.jsonl")))
        .or_else(|| {
            env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|p| p.join("perf.jsonl")))
        })
        .unwrap_or_else(|| PathBuf::from("/tmp/recorder-perf.jsonl"));

    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(f, "{line}");
        println!("  perf → {}", log_path.display());
    }
}

pub fn overlay_video_layers(recorded: &Path, layers: &[VideoOverlaySpec]) -> Result<(), String> {
    if layers.is_empty() {
        return Ok(());
    }

    println!("  overlay: compositing {} video layer(s)", layers.len());
    let temp_out = recorded.with_extension("overlay.mp4");
    let filter = build_video_layer_filter(layers);
    let mut command = Command::new("ffmpeg");
    command.args(["-y", "-i"]).arg(recorded);
    for layer in layers {
        command.arg("-i").arg(&layer.source_path);
    }
    let status = command
        .args(["-filter_complex", &filter])
        .args(["-map", "[out]"])
        .args(["-map", "0:a?"])
        .args(["-c:v", "h264_videotoolbox", "-q:v", "65"])
        .args(["-c:a", "copy"])
        .args(["-movflags", "+faststart"])
        .arg(&temp_out)
        .output()
        .map_err(|err| format!("ffmpeg failed to start: {err}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!(
            "ffmpeg video-layer overlay failed:\n{}",
            &stderr[stderr.len().saturating_sub(500)..]
        ));
    }

    fs::rename(&temp_out, recorded)
        .map_err(|err| format!("failed to rename overlay output: {err}"))?;
    Ok(())
}

/// Overlay a source video into the recorded clip's black video area.
/// Video area: x:80 y:276 w:920 h:538 in 1080x1920 output.
pub fn overlay_video(recorded: &Path, video: &Path) -> Result<(), String> {
    println!("  overlay: {} → video area", video.display());
    let temp_out = recorded.with_extension("overlay.mp4");

    let filter = build_overlay_filter();

    let status = Command::new("ffmpeg")
        .args(["-y"])
        .args(["-i", &recorded.to_string_lossy()])
        .args(["-i", &video.to_string_lossy()])
        .args(["-filter_complex", &filter])
        .args(["-map", "[out]"])
        .args(["-map", "0:a"])
        .args(["-c:v", "h264_videotoolbox", "-q:v", "65"])
        .args(["-c:a", "copy"])
        .arg(&temp_out)
        .output()
        .map_err(|err| format!("ffmpeg failed to start: {err}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!(
            "ffmpeg overlay failed:\n{}",
            &stderr[stderr.len().saturating_sub(300)..]
        ));
    }

    fs::rename(&temp_out, recorded)
        .map_err(|err| format!("failed to rename overlay output: {err}"))?;

    let size_mb = fs::metadata(recorded)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    println!("  ✓ overlay done: {:.1} MB\n", size_mb);
    Ok(())
}

/// Overlay a source video at a dynamic position with timing.
pub fn overlay_video_at(
    recorded: &Path,
    video_src: &Path,
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    start: f64,
    dur: f64,
) -> Result<(), String> {
    use std::process::Command;

    if !video_src.exists() {
        return Err(format!(
            "video overlay source not found: {}",
            video_src.display()
        ));
    }

    println!(
        "  overlay: {} → {}x{} at ({},{}) t={:.1}s dur={:.1}s",
        video_src.display(),
        w,
        h,
        x,
        y,
        start,
        dur
    );
    let temp_out = recorded.with_extension("overlay.mp4");

    // Build filter: scale source video to target size, overlay at position
    // -ss on input for start time, -t for duration
    let filter = format!(
        "[1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,\
         pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black[vid];\
         [0:v][vid]overlay={x}:{y}:enable='between(t,{start},{end})'[out]",
        end = start + dur
    );

    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y"]);
    cmd.args(["-i", &recorded.to_string_lossy()]);
    cmd.args(["-i", &video_src.to_string_lossy()]);
    cmd.args(["-filter_complex", &filter]);
    cmd.args(["-map", "[out]"]);
    // Try to copy audio if it exists, otherwise skip
    cmd.args(["-map", "0:a?"]);
    cmd.args(["-c:v", "h264_videotoolbox", "-q:v", "65"]);
    cmd.args(["-c:a", "copy"]);
    cmd.arg(&temp_out);

    let output = cmd
        .output()
        .map_err(|err| format!("ffmpeg failed to start: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg overlay failed:\n{}",
            &stderr[stderr.len().saturating_sub(500)..]
        ));
    }

    fs::rename(&temp_out, recorded)
        .map_err(|err| format!("failed to rename overlay output: {err}"))?;

    let size_mb = fs::metadata(recorded)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    println!("  ✓ overlay done: {:.1} MB", size_mb);
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::ffi::OsString;
    use std::sync::{Mutex, OnceLock};

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn unique_temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!(
            "nextframe-overlay-tests-{name}-{}-{nanos}",
            std::process::id()
        ))
    }

    struct EnvVarGuard {
        key: &'static str,
        old_value: Option<OsString>,
    }

    impl EnvVarGuard {
        fn set_path(path: &Path) -> Self {
            let old_value = env::var_os("PATH");
            unsafe {
                env::set_var("PATH", path);
            }
            Self {
                key: "PATH",
                old_value,
            }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match &self.old_value {
                Some(value) => unsafe {
                    env::set_var(self.key, value);
                },
                None => unsafe {
                    env::remove_var(self.key);
                },
            }
        }
    }

    #[test]
    fn build_overlay_filter_uses_expected_geometry() {
        assert_eq!(
            build_overlay_filter(),
            "[1:v]scale=920:538:force_original_aspect_ratio=decrease,pad=920:538:(ow-iw)/2:(oh-ih)/2:black[vid];[0:v][vid]overlay=80:276[out]"
        );
    }

    #[test]
    fn build_video_overlay_specs_converts_percent_rects_to_pixels() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let video = root.join("clip.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&video, b"clip").unwrap();

        let specs = build_video_overlay_specs(
            &[VideoLayerInfo {
                src: "clip.mp4".into(),
                x: "5%".into(),
                y: "5%".into(),
                w: "55%".into(),
                h: "65%".into(),
                start: 0.0,
                dur: 15.0,
            }],
            &root,
            &html,
            1920.0,
            1080.0,
            1.0,
        )
        .unwrap();

        assert_eq!(
            specs,
            vec![VideoOverlaySpec {
                source_path: video,
                x: 96,
                y: 54,
                width: 1056,
                height: 702,
                start_sec: 0.0,
                duration_sec: 15.0,
            }]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn build_video_overlay_specs_scales_css_pixels_by_dpr() {
        let root = crate::util::create_temp_dir().unwrap();
        let html = root.join("demo.html");
        let video = root.join("clip.mp4");
        fs::write(&html, "<html></html>").unwrap();
        fs::write(&video, b"clip").unwrap();

        let specs = build_video_overlay_specs(
            &[VideoLayerInfo {
                src: "clip.mp4".into(),
                x: "10".into(),
                y: "20px".into(),
                w: "320".into(),
                h: "180px".into(),
                start: 0.0,
                dur: 3.0,
            }],
            &root,
            &html,
            1920.0,
            1080.0,
            2.0,
        )
        .unwrap();

        assert_eq!(specs[0].x, 20);
        assert_eq!(specs[0].y, 40);
        assert_eq!(specs[0].width, 640);
        assert_eq!(specs[0].height, 360);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn build_video_layer_filter_handles_timed_layers() {
        let filter = build_video_layer_filter(&[
            VideoOverlaySpec {
                source_path: PathBuf::from("clip-a.mp4"),
                x: 96,
                y: 54,
                width: 1056,
                height: 702,
                start_sec: 0.0,
                duration_sec: 5.0,
            },
            VideoOverlaySpec {
                source_path: PathBuf::from("clip-b.mp4"),
                x: 200,
                y: 120,
                width: 400,
                height: 300,
                start_sec: 6.5,
                duration_sec: 2.0,
            },
        ]);

        assert_eq!(
            filter,
            "[1:v]scale=1056:702:force_original_aspect_ratio=decrease,pad=1056:702:(ow-iw)/2:(oh-ih)/2:black[layer0_scaled];[layer0_scaled]setpts=PTS-STARTPTS+0.000000/TB[layer0_shifted];[0:v][layer0_shifted]overlay=96:54:enable='between(t,0.000000,5.000000)':eof_action=pass[base1];[2:v]scale=400:300:force_original_aspect_ratio=decrease,pad=400:300:(ow-iw)/2:(oh-ih)/2:black[layer1_scaled];[layer1_scaled]setpts=PTS-STARTPTS+6.500000/TB[layer1_shifted];[base1][layer1_shifted]overlay=200:120:enable='between(t,6.500000,8.500000)':eof_action=pass[out]"
        );
    }

    #[test]
    fn format_perf_log_line_formats_clip_mode_metrics() {
        let frame_files = [PathBuf::from("/tmp/frame-001.png")];
        let context = PerfLogContext {
            frame_files: &frame_files,
            video_overlay: Some(Path::new("/tmp/overlay.mp4")),
            html_duration_sec: Some(28.5),
            plan_duration_sec: 30.0,
            width: 540.0,
            height: 960.0,
            dpr: 2.0,
            target_fps: 30,
            parallel: Some(4),
            render_scale: 0.75,
            has_audio: true,
            video_layers_count: 2,
            audio_src: Some(Path::new("/tmp/audio.m4a")),
        };
        let line = format_perf_log_line(
            123,
            12,
            3,
            30.0,
            10.0,
            5.0,
            60.0,
            42.4,
            (1080, 1920),
            "h264_videotoolbox",
            &context,
            &[
                "nextframe-recorder".into(),
                "slide".into(),
                "frame-001.png".into(),
            ],
        );
        let value: Value = serde_json::from_str(&line).unwrap();

        assert_eq!(value["ts"], 123);
        assert_eq!(value["mode"], "clip");
        assert_eq!(value["file"], "frame-001.png");
        assert_eq!(value["html_files"], serde_json::json!(["frame-001.png"]));
        assert_eq!(value["html_duration_sec"], 28.5);
        assert_eq!(value["plan_duration_sec"], 30.0);
        assert_eq!(value["width"], 540.0);
        assert_eq!(value["height"], 960.0);
        assert_eq!(value["dpr"], 2.0);
        assert_eq!(value["parallel"], 4);
        assert_eq!(value["render_scale"], 0.75);
        assert_eq!(value["has_audio"], true);
        assert_eq!(value["has_video_overlay"], true);
        assert_eq!(value["video_layers_count"], 2);
        assert_eq!(value["audio_src"], "/tmp/audio.m4a");
        assert_eq!(
            value["command_args"],
            serde_json::json!(["nextframe-recorder", "slide", "frame-001.png"])
        );
        assert_eq!(value["target_fps"], 30);
        assert_eq!(value["encoder"], "h264_videotoolbox");
    }

    #[test]
    fn format_perf_log_line_handles_slide_mode_with_zero_totals() {
        let frame_files: [PathBuf; 0] = [];
        let context = PerfLogContext {
            frame_files: &frame_files,
            video_overlay: None,
            html_duration_sec: None,
            plan_duration_sec: 0.0,
            width: 920.0,
            height: 538.0,
            dpr: 1.0,
            target_fps: 24,
            parallel: None,
            render_scale: 1.0,
            has_audio: false,
            video_layers_count: 0,
            audio_src: None,
        };
        let line = format_perf_log_line(
            456,
            0,
            0,
            0.0,
            0.0,
            0.0,
            24.0,
            0.0,
            (920, 538),
            "libx264",
            &context,
            &["nextframe-recorder".into(), "slide".into()],
        );
        let value: Value = serde_json::from_str(&line).unwrap();

        assert_eq!(value["mode"], "slide");
        assert_eq!(value["file"], "unknown");
        assert_eq!(value["html_files"], serde_json::json!([]));
        assert_eq!(value["html_duration_sec"], Value::Null);
        assert_eq!(value["parallel"], Value::Null);
        assert_eq!(value["has_audio"], false);
        assert_eq!(value["has_video_overlay"], false);
        assert_eq!(value["video_layers_count"], 0);
        assert_eq!(value["audio_src"], Value::Null);
        assert_eq!(
            value["command_args"],
            serde_json::json!(["nextframe-recorder", "slide"])
        );
    }

    #[test]
    fn overlay_video_returns_error_for_missing_input_file() {
        let _lock = test_lock();
        let temp_dir = unique_temp_path("overlay-video");
        fs::create_dir_all(&temp_dir).unwrap();

        let ffmpeg_path = temp_dir.join("ffmpeg");
        fs::write(
            &ffmpeg_path,
            "#!/bin/sh\nprev=\"\"\nfor arg in \"$@\"; do\n  if [ \"$prev\" = \"-i\" ] && [ ! -f \"$arg\" ]; then\n    echo \"No such file or directory: $arg\" >&2\n    exit 1\n  fi\n  prev=\"$arg\"\ndone\nexit 0\n",
        )
        .unwrap();
        #[cfg(unix)]
        fs::set_permissions(&ffmpeg_path, fs::Permissions::from_mode(0o755)).unwrap();

        let _path_guard = EnvVarGuard::set_path(&temp_dir);

        let recorded = temp_dir.join("recorded.mp4");
        let missing_video = temp_dir.join("missing.mp4");
        fs::write(&recorded, b"recorded").unwrap();

        let err = overlay_video(&recorded, &missing_video).expect_err("missing input should fail");

        assert!(err.contains("ffmpeg overlay failed:"));
        assert!(err.contains("No such file or directory"));
        assert!(recorded.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
