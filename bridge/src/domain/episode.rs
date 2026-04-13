use serde_json::{json, Value};
use std::fs;

use super::project::projects_root;
use crate::util::time::iso_now;
use crate::util::validation::require_string;

pub(crate) fn handle_episode_list(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let project_dir = projects_root().join(project);
    if !project_dir.exists() {
        return Err(format!("project '{}' not found", project));
    }

    let mut episodes: Vec<Value> = Vec::new();
    let entries =
        fs::read_dir(&project_dir).map_err(|e| format!("failed to read project dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let episode_json = path.join("episode.json");
        if !episode_json.exists() {
            continue;
        }
        let content = fs::read_to_string(&episode_json)
            .map_err(|e| format!("failed to read {}: {e}", episode_json.display()))?;
        let meta: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

        // count segment .json files (excluding episode.json)
        let mut segment_count = 0;
        let mut total_duration = 0.0_f64;
        if let Ok(rd) = fs::read_dir(&path) {
            for seg_entry in rd.filter_map(Result::ok) {
                let seg_path = seg_entry.path();
                if seg_path.extension().and_then(|e| e.to_str()) == Some("json")
                    && seg_path.file_name().and_then(|n| n.to_str()) != Some("episode.json")
                {
                    segment_count += 1;
                    if let Ok(seg_content) = fs::read_to_string(&seg_path) {
                        if let Ok(seg_val) = serde_json::from_str::<Value>(&seg_content) {
                            if let Some(dur) = seg_val.get("duration").and_then(Value::as_f64) {
                                total_duration += dur;
                            }
                        }
                    }
                }
            }
        }

        let order = meta.get("order").and_then(Value::as_u64).unwrap_or(0);
        episodes.push(json!({
            "name": meta.get("name").and_then(Value::as_str).unwrap_or_default(),
            "path": path.display().to_string(),
            "order": order,
            "segments": segment_count,
            "totalDuration": total_duration,
        }));
    }

    episodes.sort_by_key(|e| e.get("order").and_then(Value::as_u64).unwrap_or(0));

    Ok(json!({ "episodes": episodes }))
}

pub(crate) fn handle_episode_create(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let name = require_string(params, "name")?;
    let project_dir = projects_root().join(project);
    if !project_dir.exists() {
        return Err(format!("project '{}' not found", project));
    }

    let episode_dir = project_dir.join(name);
    if episode_dir.exists() {
        return Err(format!("episode '{}' already exists", name));
    }

    // count existing episodes for order
    let order = fs::read_dir(&project_dir)
        .map(|rd| {
            rd.filter_map(Result::ok)
                .filter(|e| e.path().is_dir() && e.path().join("episode.json").exists())
                .count()
        })
        .unwrap_or(0);

    fs::create_dir_all(&episode_dir).map_err(|e| format!("failed to create episode dir: {e}"))?;

    let now = iso_now();
    let meta = json!({
        "name": name,
        "order": order,
        "created": now,
    });

    fs::write(
        episode_dir.join("episode.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("failed to write episode.json: {e}"))?;

    // update project.json updated timestamp
    let project_json_path = project_dir.join("project.json");
    if let Ok(content) = fs::read_to_string(&project_json_path) {
        if let Ok(mut project_meta) = serde_json::from_str::<Value>(&content) {
            if let Some(obj) = project_meta.as_object_mut() {
                obj.insert("updated".to_string(), json!(now));
                let _ = fs::write(
                    &project_json_path,
                    serde_json::to_string_pretty(&project_meta).unwrap_or_default(),
                );
            }
        }
    }

    Ok(json!({ "path": episode_dir.display().to_string() }))
}
