//! Audio synthesis bridge — spawn `nextframe audio-synth` CLI.
//! No direct vox dependency. nextframe CLI handles TTS + alignment internally.
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::util::validation::require_string;

/// Find the `nextframe` CLI binary (node script).
fn nextframe_cli() -> Result<(String, Vec<String>), String> {
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../nf-cli/bin/nextframe.js");
    if script.exists() {
        return Ok(("node".into(), vec![script.display().to_string()]));
    }
    // Try global install
    if let Ok(path) = which::which("nextframe") {
        return Ok((path.display().to_string(), vec![]));
    }
    Err(
        "failed to find nextframe CLI. Fix: run from project root or install nextframe globally."
            .into(),
    )
}

/// Resolve project name and episode name from full paths.
fn resolve_names(project_path: &str, episode_path: &str) -> (String, String) {
    let project_name = PathBuf::from(project_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let episode_name = PathBuf::from(episode_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    (project_name, episode_name)
}

/// audio.synth — generate TTS audio for a script segment via nextframe CLI.
/// Params: { project: string, episode: string, segment: number, voice?: string, backend?: string }
pub(crate) fn handle_audio_synth(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let segment = params
        .get("segment")
        .and_then(Value::as_u64)
        .ok_or(
            "missing required param: segment (1-based number). Fix: provide params.segment as a 1-based segment number.",
        )?;

    let (project_name, episode_name) = resolve_names(project, episode);
    let (bin, prefix_args) = nextframe_cli()?;

    let mut cmd = Command::new(&bin);
    for arg in &prefix_args {
        cmd.arg(arg);
    }
    cmd.arg("audio-synth")
        .arg(&project_name)
        .arg(&episode_name)
        .arg(format!("--segment={segment}"))
        .arg("--json");

    if let Some(voice) = params.get("voice").and_then(Value::as_str) {
        if !voice.is_empty() {
            cmd.arg(format!("--voice={voice}"));
        }
    }
    if let Some(backend) = params.get("backend").and_then(Value::as_str) {
        if !backend.is_empty() {
            cmd.arg(format!("--backend={backend}"));
        }
    }

    let output = cmd
        .output()
        .map_err(|e| {
            format!(
                "failed to run nextframe audio-synth: {e}. Fix: ensure node and the NextFrame CLI are installed and available."
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "nextframe audio-synth failed (exit {}): {stderr}. Fix: verify the project, episode, segment, and voice options, then retry.",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    match serde_json::from_str::<Value>(&stdout) {
        Ok(result) => Ok(result),
        Err(_) => Ok(json!({ "ok": true, "raw": stdout.trim() })),
    }
}

/// audio.status — check if audio exists for a segment.
/// Params: { episode: string, segment: number }
pub(crate) fn handle_audio_status(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let segment = params.get("segment").and_then(Value::as_u64).unwrap_or(1);

    let audio_dir = PathBuf::from(&episode)
        .join("audio")
        .join(format!("seg-{segment}"));
    let mp3 = find_first_file(&audio_dir, ".mp3");
    let timeline = find_first_file(&audio_dir, ".timeline.json");
    let srt = find_first_file(&audio_dir, ".srt");
    let exists = mp3.is_some();

    let timeline_data = timeline.as_ref().and_then(|p| {
        fs::read_to_string(p)
            .ok()
            .and_then(|c| serde_json::from_str::<Value>(&c).ok())
    });

    Ok(json!({
        "exists": exists,
        "mp3": mp3.map(|p| p.display().to_string()),
        "timeline": timeline.map(|p| p.display().to_string()),
        "srt": srt.map(|p| p.display().to_string()),
        "timelineData": timeline_data,
        "audioDir": audio_dir.display().to_string(),
    }))
}

fn find_first_file(dir: &PathBuf, suffix: &str) -> Option<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(suffix) {
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
                    if name.ends_with(suffix) {
                        return Some(sub_entry.path());
                    }
                }
            }
        }
    }
    None
}
