//! overlay tests helpers
#![allow(clippy::unwrap_used)]
#![allow(clippy::expect_used)]

use std::env;
use std::ffi::OsString;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use super::ffmpeg::{build_overlay_filter, build_video_layer_filter};
use super::perf::{PerfMetrics, format_perf_log_line};
use super::spec::VideoOverlaySpec;
use super::{PerfLogContext, build_video_overlay_specs, overlay_video};
use crate::plan::VideoLayerInfo;

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
        build_overlay_filter(1.0),
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
        output_path: None,
        frame_files: &frame_files,
        video_overlay: Some(Path::new("/tmp/overlay.mp4")),
        html_duration_sec: Some(28.5),
        plan_duration_sec: 30.0,
        width: 540.0,
        height: 960.0,
        dpr: 2.0,
        target_fps: 30,
        parallel: 4,
        render_scale: 0.75,
        has_audio: true,
        video_layers_count: 2,
        audio_src: Some(Path::new("/tmp/audio.m4a")),
        crf: 14,
        skip: false,
        skip_aggressive: false,
    };
    let line = format_perf_log_line(
        123,
        &PerfMetrics {
            total_frames: 12,
            skipped_frames: 3,
            content_duration: 30.0,
            record_secs: 10.0,
            overlay_secs: 5.0,
            fps: 60.0,
            size_mb: 42.4,
            pixel_size: (1080, 1920),
            encoder: "h264_videotoolbox",
        },
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
        output_path: None,
        frame_files: &frame_files,
        video_overlay: None,
        html_duration_sec: None,
        plan_duration_sec: 0.0,
        width: 920.0,
        height: 538.0,
        dpr: 1.0,
        target_fps: 24,
        parallel: 1,
        render_scale: 1.0,
        has_audio: false,
        video_layers_count: 0,
        audio_src: None,
        crf: 23,
        skip: false,
        skip_aggressive: false,
    };
    let line = format_perf_log_line(
        456,
        &PerfMetrics {
            total_frames: 0,
            skipped_frames: 0,
            content_duration: 0.0,
            record_secs: 0.0,
            overlay_secs: 0.0,
            fps: 24.0,
            size_mb: 0.0,
            pixel_size: (920, 538),
            encoder: "libx264",
        },
        &context,
        &["nextframe-recorder".into(), "slide".into()],
    );
    let value: Value = serde_json::from_str(&line).unwrap();

    assert_eq!(value["mode"], "slide");
    assert_eq!(value["file"], "unknown");
    assert_eq!(value["html_files"], serde_json::json!([]));
    assert_eq!(value["html_duration_sec"], Value::Null);
    assert_eq!(value["parallel"], 1);
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

    let err = overlay_video(&recorded, &missing_video, 2.0).expect_err("missing input should fail");

    assert!(
        err.contains("failed to overlay the source video with ffmpeg:"),
        "unexpected overlay error: {err}"
    );
    assert!(
        err.contains("No such file or directory"),
        "unexpected overlay error: {err}"
    );
    assert!(
        err.contains("Fix: Inspect the ffmpeg stderr output, verify the input files, and retry."),
        "unexpected overlay error: {err}"
    );
    assert!(recorded.exists());

    let _ = fs::remove_dir_all(&temp_dir);
}
