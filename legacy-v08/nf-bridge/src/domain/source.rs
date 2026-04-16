//! Source pipeline bridge — source list/cut helpers for episode clip state.
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use super::cli::{normalize_name, run_nextframe_cli};
use crate::util::validation::require_string;

/// source.cut — cut video clips from a source video using a sentence plan.
/// Params: { episode: string, video: string, sentencesDir: string, planPath: string }
pub(crate) fn handle_source_cut(params: &Value) -> Result<Value, String> {
    let episode = require_string(params, "episode")?;
    let video = require_string(params, "video")?;
    let sentences_dir = require_string(params, "sentencesDir")?;
    let plan_path = require_string(params, "planPath")?;
    let episode_name = normalize_name(episode);
    let project_name = Path::new(episode)
        .parent()
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| {
            "failed to resolve params.episode project name for source.cut. Fix: provide params.episode as an episode path.".to_string()
        })?;
    let source_name = Path::new(sentences_dir)
        .file_name()
        .or_else(|| Path::new(video).parent().and_then(|path| path.file_name()))
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| {
            "failed to resolve source name for source.cut. Fix: provide params.sentencesDir or params.video inside a source directory.".to_string()
        })?;
    let plan_arg = format!("--plan={plan_path}");
    let source_arg = format!("--source={source_name}");
    run_nextframe_cli(&[
        "source-cut",
        project_name.as_str(),
        episode_name.as_str(),
        source_arg.as_str(),
        plan_arg.as_str(),
    ])
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
