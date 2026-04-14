//! ffmpeg helpers for extracting and slicing WAV audio for transcription.

use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};

/// Slice a WAV file into another WAV file.
pub fn slice_wav(input: &Path, start_sec: f64, duration_sec: f64, output: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-loglevel")
        .arg("error")
        .arg("-ss")
        .arg(format!("{start_sec:.3}"))
        .arg("-i")
        .arg(input)
        .arg("-t")
        .arg(format!("{duration_sec:.3}"))
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("wav")
        .arg(output)
        .status()
        .context("run ffmpeg for audio slice")?;

    if !status.success() {
        bail!("ffmpeg audio slice failed with exit {:?}", status.code());
    }
    Ok(())
}
