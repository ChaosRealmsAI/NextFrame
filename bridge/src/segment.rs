use serde_json::{json, Value};
use std::fs;

use crate::project::projects_root;
use crate::util::validation::{require_string, validate_project_component};

pub(crate) fn handle_segment_list(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let episode_dir = projects_root().join(project).join(episode);
    if !episode_dir.exists() {
        return Err("episode directory not found".to_string());
    }

    let mut segments: Vec<Value> = Vec::new();
    let entries =
        fs::read_dir(&episode_dir).map_err(|e| format!("failed to read episode dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()) == Some("episode.json") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let mut duration = 0.0_f64;
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                duration = val.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
            }
        }

        segments.push(json!({
            "name": name,
            "path": path.display().to_string(),
            "duration": duration,
        }));
    }

    segments.sort_by(|a, b| {
        let a_name = a.get("name").and_then(Value::as_str).unwrap_or("");
        let b_name = b.get("name").and_then(Value::as_str).unwrap_or("");
        a_name.cmp(b_name)
    });

    Ok(json!({ "segments": segments }))
}

pub(crate) fn handle_segment_video_url(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let segment = require_string(params, "segment")?;

    validate_project_component(project, "project")?;
    validate_project_component(episode, "episode")?;
    validate_project_component(segment, "segment")?;

    let video_path = projects_root()
        .join(project)
        .join(episode)
        .join(format!("{segment}.mp4"));

    if !video_path.is_file() {
        return Ok(json!({ "exists": false }));
    }

    Ok(json!({
        "exists": true,
        "path": video_path.display().to_string(),
    }))
}
