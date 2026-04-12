use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

#[allow(clippy::too_many_arguments)]
fn format_perf_log_line(
    ts: u64,
    frame_files: &[PathBuf],
    video_overlay: &Option<PathBuf>,
    total_frames: usize,
    skipped_frames: usize,
    content_duration: f64,
    record_secs: f64,
    overlay_secs: f64,
    fps: f64,
    size_mb: f64,
    pixel_size: (usize, usize),
    target_fps: usize,
    encoder: &str,
) -> String {
    let mode = if video_overlay.is_some() {
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
    let first_file = frame_files
        .first()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    format!(
        r#"{{"ts":{ts},"mode":"{mode}","file":"{first_file}","content_s":{content_duration:.1},"record_s":{record_secs:.1},"overlay_s":{overlay_secs:.1},"total_s":{total_secs:.1},"realtime_x":{realtime_x:.1},"fps":{fps:.1},"frames":{total_frames},"skipped":{skipped_frames},"skip_pct":{skip_pct:.1},"size_mb":{size_mb:.1},"resolution":"{}x{}","target_fps":{target_fps},"encoder":"{encoder}"}}"#,
        pixel_size.0, pixel_size.1,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn write_perf_log(
    _out: &Path,
    frame_files: &[PathBuf],
    video_overlay: &Option<PathBuf>,
    total_frames: usize,
    skipped_frames: usize,
    content_duration: f64,
    record_secs: f64,
    overlay_secs: f64,
    fps: f64,
    size_mb: f64,
    pixel_size: (usize, usize),
    target_fps: usize,
    encoder: &str,
) {
    use std::io::Write;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let line = format_perf_log_line(
        ts,
        frame_files,
        video_overlay,
        total_frames,
        skipped_frames,
        content_duration,
        record_secs,
        overlay_secs,
        fps,
        size_mb,
        pixel_size,
        target_fps,
        encoder,
    );

    let log_path = env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join("perf.jsonl")))
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

/// Overlay a source video into the recorded clip's black video area.
/// Video area: x:80 y:276 w:920 h:538 in 1080x1920 output.
pub fn overlay_video(recorded: &Path, video: &Path) -> Result<(), String> {
    use std::process::Command;

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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
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
    fn format_perf_log_line_formats_clip_mode_metrics() {
        let line = format_perf_log_line(
            123,
            &[PathBuf::from("/tmp/frame-001.png")],
            &Some(PathBuf::from("/tmp/overlay.mp4")),
            12,
            3,
            30.0,
            10.0,
            5.0,
            60.0,
            42.4,
            (1080, 1920),
            30,
            "h264_videotoolbox",
        );

        assert_eq!(
            line,
            r#"{"ts":123,"mode":"clip","file":"frame-001.png","content_s":30.0,"record_s":10.0,"overlay_s":5.0,"total_s":15.0,"realtime_x":2.0,"fps":60.0,"frames":12,"skipped":3,"skip_pct":25.0,"size_mb":42.4,"resolution":"1080x1920","target_fps":30,"encoder":"h264_videotoolbox"}"#
        );
    }

    #[test]
    fn format_perf_log_line_handles_slide_mode_with_zero_totals() {
        let line = format_perf_log_line(
            456,
            &[],
            &None,
            0,
            0,
            0.0,
            0.0,
            0.0,
            24.0,
            0.0,
            (920, 538),
            24,
            "libx264",
        );

        assert_eq!(
            line,
            r#"{"ts":456,"mode":"slide","file":"unknown","content_s":0.0,"record_s":0.0,"overlay_s":0.0,"total_s":0.0,"realtime_x":0.0,"fps":24.0,"frames":0,"skipped":0,"skip_pct":0.0,"size_mb":0.0,"resolution":"920x538","target_fps":24,"encoder":"libx264"}"#
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
