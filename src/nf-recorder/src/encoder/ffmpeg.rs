//! FFmpeg-based audio muxing, segment concatenation, and audio probing.

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::error_with_fix;

/// Uses `ffprobe` to inspect the duration of an optional audio track.
pub fn probe_audio_duration(audio_path: Option<&Path>) -> Result<f64, String> {
    let Some(path) = audio_path else {
        return Ok(0.0);
    };
    if !path.exists() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "inspect the audio track duration",
                format!("audio file does not exist: {}", path.display()),
                "Point the timeline audio source at an existing local file and retry.",
            ),
        );
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
        .map_err(|err| {
            error_with_fix(
                "launch ffprobe for the audio track",
                format!("failed to start ffprobe for {}: {err}", path.display()),
                "Install `ffprobe` and ensure it is available on PATH before retrying.",
            )
        })?;
    if !output.status.success() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "inspect the audio track duration",
                format!(
                    "ffprobe failed for {} with exit {}",
                    path.display(),
                    output.status
                ),
                "Verify the audio file is readable by ffprobe, then retry.",
            ),
        );
    }
    parse_probe_audio_duration_output(path, &output.stdout)
}

/// Concatenates the finished segment files into the final output MP4.
pub fn concat_segments(segment_paths: &[PathBuf], output_path: &Path) -> Result<(), String> {
    if segment_paths.len() == 1 {
        // Single segment: just rename, no ffmpeg needed
        fs::rename(&segment_paths[0], output_path)
            .or_else(|_| fs::copy(&segment_paths[0], output_path).map(|_| ()))
            .map_err(|err| {
                error_with_fix(
                    "move the recorded segment to the final output path",
                    err,
                    "Ensure the output path is writable and retry.",
                )
            })?;
        return Ok(());
    }

    let args = build_concat_segments_args(segment_paths, output_path);

    let output = Command::new("ffmpeg").args(&args).output().map_err(|err| {
        error_with_fix(
            "launch ffmpeg to concatenate segments",
            err,
            "Install `ffmpeg` and ensure it is available on PATH before retrying.",
        )
    })?;
    if output.status.success() {
        return Ok(());
    }
    Err(
        /* Fix: user-facing error formatted below */
        error_with_fix(
            "concatenate the recorded segments",
            String::from_utf8_lossy(&output.stderr),
            "Inspect the ffmpeg error output, then retry after fixing the segment inputs.",
        ),
    )
}

fn parse_probe_audio_duration_output(path: &Path, stdout: &[u8]) -> Result<f64, String> {
    String::from_utf8_lossy(stdout)
        .trim()
        .parse::<f64>()
        .map_err(|err| {
            error_with_fix(
                "parse the ffprobe duration output",
                format!(
                    "failed to parse ffprobe duration for {}: {err}",
                    path.display()
                ),
                "Verify the audio file reports a numeric duration in ffprobe and retry.",
            )
        })
}

fn build_concat_segments_args(segment_paths: &[PathBuf], output_path: &Path) -> Vec<String> {
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
    args
}

#[cfg_attr(not(test), allow(dead_code))]
fn secs_to_hms(secs: f64) -> String {
    let total_millis = (secs.max(0.0) * 1000.0).round() as u64;
    let hours = total_millis / 3_600_000;
    let minutes = (total_millis % 3_600_000) / 60_000;
    let seconds = (total_millis % 60_000) / 1_000;
    let millis = total_millis % 1_000;
    format!("{hours:02}:{minutes:02}:{seconds:02}.{millis:03}")
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
        trace_log!(
            "warn: no audio file found (path={:?}), muxing silent track",
            audio_path
        );
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
            error_with_fix(
                "launch ffmpeg to mux audio",
                format!(
                    "failed to start ffmpeg for {}: {err}",
                    output_path.display()
                ),
                "Install `ffmpeg` and ensure it is available on PATH before retrying.",
            )
        })?;
    if output.status.success() {
        return Ok(());
    }
    Err(
        /* Fix: user-facing error formatted below */
        error_with_fix(
            "mux audio into the recorded output",
            format!(
                "ffmpeg failed for {}: {}",
                output_path.display(),
                String::from_utf8_lossy(&output.stderr)
            ),
            "Inspect the ffmpeg error output, then retry after fixing the audio or video input.",
        ),
    )
}

#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{build_concat_segments_args, parse_probe_audio_duration_output, secs_to_hms};

    #[test]
    fn builds_concat_segments_ffmpeg_args() {
        let segment_paths = vec![
            PathBuf::from("segment-0.mp4"),
            PathBuf::from("segment 1.mp4"),
            PathBuf::from("segment-2.mp4"),
        ];
        let args = build_concat_segments_args(&segment_paths, Path::new("final.mp4"));

        assert_eq!(
            args,
            vec![
                "-y",
                "-i",
                "segment-0.mp4",
                "-i",
                "segment 1.mp4",
                "-i",
                "segment-2.mp4",
                "-filter_complex",
                "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]",
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-c:v",
                "h264_videotoolbox",
                "-q:v",
                "65",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                "final.mp4",
            ]
        );
    }

    #[test]
    fn parses_valid_probe_audio_duration_output() {
        let duration = parse_probe_audio_duration_output(Path::new("audio.wav"), b"12.34567\n")
            .expect("duration should parse");

        assert!((duration - 12.34567).abs() < f64::EPSILON);
    }

    #[test]
    fn rejects_invalid_probe_audio_duration_output() {
        let err = parse_probe_audio_duration_output(Path::new("audio.wav"), b"not-a-duration\n")
            .expect_err("invalid duration should fail");

        assert!(err.contains("audio.wav"));
        assert!(err.contains("failed to parse ffprobe duration"));
    }

    #[test]
    fn formats_seconds_to_hms() {
        assert_eq!(secs_to_hms(0.0), "00:00:00.000");
        assert_eq!(secs_to_hms(65.432), "00:01:05.432");
        assert_eq!(secs_to_hms(3_661.25), "01:01:01.250");
    }
}
