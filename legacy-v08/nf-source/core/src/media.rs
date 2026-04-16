//! Shared ffmpeg and ffprobe helpers for media inspection and extraction.

use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};

/// Extract a media file to a 16 kHz mono WAV file.
pub fn extract_audio_to_wav(video: &Path, wav_path: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(video)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("wav")
        .arg(wav_path)
        .status()
        .context("run ffmpeg for audio extraction")?;

    if !status.success() {
        bail!(
            "ffmpeg audio extraction failed with exit {:?}",
            status.code()
        );
    }

    Ok(())
}

/// Probe media duration in seconds via `ffprobe`.
pub fn probe_duration(path: &Path) -> Result<f64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("quiet")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("csv=p=0")
        .arg(path)
        .output()
        .context("run ffprobe")?;

    if !output.status.success() {
        bail!(
            "ffprobe failed with exit {:?}: {}",
            output.status.code(),
            stderr_text(&output.stderr)
        );
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    raw.trim()
        .parse::<f64>()
        .with_context(|| format!("parse duration from {:?}", raw.trim()))
}

fn stderr_text(stderr: &[u8]) -> String {
    let trimmed = String::from_utf8_lossy(stderr).trim().to_string();
    if trimmed.is_empty() {
        "no stderr output".to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::stderr_text;

    #[test]
    fn stderr_text_reports_empty_output() {
        assert_eq!(stderr_text(b"   \n"), "no stderr output");
    }

    #[test]
    fn stderr_text_trims_output() {
        assert_eq!(stderr_text(b"  ffprobe failed \n"), "ffprobe failed");
    }
}
