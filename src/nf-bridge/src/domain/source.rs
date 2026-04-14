//! Source pipeline bridge — spawn `nf-source` CLI for video cutting.
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::util::validation::require_string;

/// Find the `nf-source` binary.
fn source_path() -> Result<PathBuf, String> {
    which::which("nf-source").map_err(|_| {
        "failed to find nf-source binary: not in PATH. Fix: build nf-source or add to PATH.".into()
    })
}

/// source.cut — cut video clips from a source video using a sentence plan.
/// Params: { episode: string, video: string, sentencesDir: string, planPath: string }
/// Output goes to <episode>/clips/
pub(crate) fn handle_source_cut(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let video = require_string(params, "video")?;
    let sentences_dir = require_string(params, "sentencesDir")?;
    let plan_path = require_string(params, "planPath")?;

    let episode_path = PathBuf::from(episode);
    let clips_dir = episode_path.join("clips");
    fs::create_dir_all(&clips_dir)
        .map_err(|e| format!("failed to create clips dir '{}': {e}", clips_dir.display()))?;

    let nf_source = source_path()?;
    let output = Command::new(&nf_source)
        .arg("cut")
        .arg("--video")
        .arg(&video)
        .arg("--sentences-path")
        .arg(&sentences_dir)
        .arg("--plan-path")
        .arg(&plan_path)
        .arg("--out-dir")
        .arg(&clips_dir)
        .output()
        .map_err(|e| format!("failed to run nf-source cut: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "nf-source cut failed (exit {}): {stderr}",
            output.status
        ));
    }

    // Read cut_report.json if it exists
    let report_path = clips_dir.join("cut_report.json");
    let report = if report_path.exists() {
        let content = fs::read_to_string(&report_path).unwrap_or_default();
        serde_json::from_str::<Value>(&content).unwrap_or(json!(null))
    } else {
        json!(null)
    };

    // List generated clips
    let clips = list_clips(&clips_dir);

    Ok(json!({
        "clipsDir": clips_dir.display().to_string(),
        "clips": clips,
        "report": report,
    }))
}

/// source.clips — list existing clips in an episode.
/// Params: { episode: string }
pub(crate) fn handle_source_clips(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let clips_dir = PathBuf::from(episode).join("clips");
    let clips = list_clips(&clips_dir);

    Ok(json!({
        "clipsDir": clips_dir.display().to_string(),
        "clips": clips,
    }))
}

fn list_clips(dir: &PathBuf) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut clips: Vec<Value> = entries
        .filter_map(Result::ok)
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".mp4") || name.ends_with(".webm")
        })
        .map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let path = e.path().display().to_string();
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            json!({ "name": name, "path": path, "size": size })
        })
        .collect();
    clips.sort_by(|a, b| {
        let na = a.get("name").and_then(Value::as_str).unwrap_or("");
        let nb = b.get("name").and_then(Value::as_str).unwrap_or("");
        na.cmp(nb)
    });
    clips
}
