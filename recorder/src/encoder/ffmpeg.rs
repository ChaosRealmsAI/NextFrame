//! FFmpeg-based audio muxing, segment concatenation, and audio probing.

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Uses `ffprobe` to inspect the duration of an optional audio track.
pub fn probe_audio_duration(audio_path: Option<&Path>) -> Result<f64, String> {
    let Some(path) = audio_path else {
        return Ok(0.0);
    };
    if !path.exists() {
        return Err(format!("audio file does not exist: {}", path.display()));
    }
    let output = Command::new("ffprobe")
        .args([
            OsStr::new("-v"),
            OsStr::new("quiet"),
            OsStr::new("-show_entries"),
            OsStr::new("format=duration"),
            OsStr::new("-of"),
            OsStr::new("csv=p=0"),
            path.as_os_str(),
        ])
        .output()
        .map_err(|err| format!("failed to launch ffprobe for {}: {err}", path.display()))?;
    if !output.status.success() {
        return Err(format!(
            "ffprobe failed for {}: exit {}",
            path.display(),
            output.status
        ));
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|err| {
            format!(
                "failed to parse ffprobe duration for {}: {err}",
                path.display()
            )
        })
}

/// Concatenates the finished segment files into the final output MP4.
pub fn concat_segments(segment_paths: &[PathBuf], output_path: &Path) -> Result<(), String> {
    if segment_paths.len() == 1 {
        // Single segment: just rename, no ffmpeg needed
        fs::rename(&segment_paths[0], output_path)
            .or_else(|_| fs::copy(&segment_paths[0], output_path).map(|_| ()))
            .map_err(|err| format!("failed to move single segment to output: {err}"))?;
        return Ok(());
    }

    // Use filter_complex concat (re-encodes) instead of demuxer concat (-c copy).
    // Demuxer concat breaks when segments have different time_base (e.g. after overlay
    // re-encodes some segments but not others), causing wrong total duration.
    let mut args: Vec<String> = vec!["-y".into()];
    for path in segment_paths {
        args.push("-i".into());
        args.push(path.to_string_lossy().into_owned());
    }

    // Build filter_complex: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[v][a]
    let n = segment_paths.len();
    let mut filter = String::with_capacity(n * 12 + 40);
    for i in 0..n {
        filter.push_str(&format!("[{i}:v][{i}:a]"));
    }
    filter.push_str(&format!("concat=n={n}:v=1:a=1[v][a]"));

    args.extend_from_slice(&[
        "-filter_complex".into(),
        filter,
        "-map".into(),
        "[v]".into(),
        "-map".into(),
        "[a]".into(),
        "-c:v".into(),
        "h264_videotoolbox".into(),
        "-q:v".into(),
        "65".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.to_string_lossy().into_owned(),
    ]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|err| format!("failed to launch concat ffmpeg: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "ffmpeg concat failed: {}",
        String::from_utf8_lossy(&output.stderr)
    ))
}

pub(super) fn mux_audio_track(
    video_path: &Path,
    audio_path: Option<&Path>,
    duration_sec: f64,
    output_path: &Path,
) -> Result<(), String> {
    let mut args = vec![
        "-y".to_string(),
        "-i".into(),
        video_path.as_os_str().to_string_lossy().into_owned(),
    ];

    if let Some(audio_path) = audio_path.filter(|path| path.exists()) {
        args.push("-i".into());
        args.push(audio_path.as_os_str().to_string_lossy().into_owned());
    } else {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            format!("anullsrc=r=48000:cl=stereo:d={duration_sec:.3}"),
        ]);
    }

    args.extend([
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "192k".into(),
        "-shortest".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.as_os_str().to_string_lossy().into_owned(),
    ]);

    let output = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|err| {
            format!(
                "failed to start ffmpeg audio mux for {}: {err}",
                output_path.display()
            )
        })?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "ffmpeg audio mux failed for {}: {}",
        output_path.display(),
        String::from_utf8_lossy(&output.stderr)
    ))
}
