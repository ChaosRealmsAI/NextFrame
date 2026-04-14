//! TTS bridge — spawn `vox` CLI for text-to-speech generation.
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::util::validation::require_string;

/// Find the `vox` binary.
fn vox_path() -> Result<PathBuf, String> {
    which::which("vox").map_err(|_| {
        "failed to find vox binary: not in PATH. Fix: install nf-tts or add vox to PATH.".into()
    })
}

/// tts.synth — generate audio for a text segment.
/// Params: { episode: string, segment: string, text: string, voice?: string, backend?: string }
/// Output goes to <episode>/audio/<segment>/<segment>.mp3
pub(crate) fn handle_tts_synth(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let segment_name = require_string(params, "segment")?;
    let text = require_string(params, "text")?;

    let episode_path = PathBuf::from(episode);
    let audio_dir = episode_path.join("audio").join(segment_name);
    fs::create_dir_all(&audio_dir)
        .map_err(|e| format!("failed to create audio dir '{}': {e}", audio_dir.display()))?;

    let vox = vox_path()?;
    let mut cmd = Command::new(&vox);
    cmd.arg("synth").arg(text).arg("-d").arg(&audio_dir);

    if let Some(voice) = params.get("voice").and_then(Value::as_str) {
        if !voice.is_empty() {
            cmd.arg("-v").arg(voice);
        }
    }
    if let Some(backend) = params.get("backend").and_then(Value::as_str) {
        if !backend.is_empty() {
            cmd.arg("-b").arg(backend);
        }
    }

    let output = cmd.output().map_err(|e| format!("failed to run vox synth: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("vox synth failed (exit {}): {stderr}", output.status));
    }

    // Find generated MP3 file
    let mp3 = find_first_file(&audio_dir, "mp3");
    let timeline_json = find_first_file(&audio_dir, "timeline.json");

    Ok(json!({
        "audioDir": audio_dir.display().to_string(),
        "mp3": mp3.map(|p| p.display().to_string()),
        "timeline": timeline_json.map(|p| p.display().to_string()),
    }))
}

/// tts.voices — list available TTS voices.
/// Params: { lang?: string }
pub(crate) fn handle_tts_voices(params: &Value) -> Result<Value, String> {
    let vox = vox_path()?;
    let mut cmd = Command::new(&vox);
    cmd.arg("voices").arg("--json");

    if let Some(lang) = params.get("lang").and_then(Value::as_str) {
        if !lang.is_empty() {
            cmd.arg("-l").arg(lang);
        }
    }

    let output = cmd.output().map_err(|e| format!("failed to run vox voices: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Try to parse as JSON array; fall back to raw text
    match serde_json::from_str::<Value>(&stdout) {
        Ok(voices) => Ok(json!({ "voices": voices })),
        Err(_) => Ok(json!({ "voices": stdout.trim() })),
    }
}

/// tts.status — check if audio exists for a segment.
/// Params: { episode: string, segment: string }
pub(crate) fn handle_tts_status(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let segment_name = require_string(params, "segment")?;

    let audio_dir = PathBuf::from(episode).join("audio").join(segment_name);
    let mp3 = find_first_file(&audio_dir, "mp3");
    let exists = mp3.is_some();

    Ok(json!({
        "exists": exists,
        "mp3": mp3.map(|p| p.display().to_string()),
        "audioDir": audio_dir.display().to_string(),
    }))
}

fn find_first_file(dir: &PathBuf, ext: &str) -> Option<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(ext) {
            return Some(entry.path());
        }
    }
    // Check subdirectories (vox outputs to <stem>/<stem>.mp3)
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(sub) = fs::read_dir(&path) {
                for sub_entry in sub.filter_map(Result::ok) {
                    let name = sub_entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(ext) {
                        return Some(sub_entry.path());
                    }
                }
            }
        }
    }
    None
}
