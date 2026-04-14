//! Gold standard: new IPC handlers should follow this pattern.
//! domain project management handlers
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::util::path::home_dir;
use crate::util::time::iso_now;
use crate::util::validation::require_string;

/// Project — top-level container for episodes and segments.
/// Also known as: workspace, collection, show.
pub(crate) fn projects_root() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("NextFrame")
        .join("projects")
}

pub(crate) fn handle_project_list(_params: &Value) -> Result<Value, String> {
    let root = projects_root();
    if !root.exists() {
        return Ok(json!({ "projects": [] }));
    }

    let mut projects: Vec<Value> = Vec::new();
    let entries = fs::read_dir(&root).map_err(|e| format!("failed to read projects dir: {e}"))?;

    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let project_json = path.join("project.json");
        if !project_json.exists() {
            continue;
        }
        let content = fs::read_to_string(&project_json)
            .map_err(|e| format!("failed to read {}: {e}", project_json.display()))?;
        let meta: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

        // count episode subdirs
        let episode_count = fs::read_dir(&path)
            .map(|rd| {
                rd.filter_map(Result::ok)
                    .filter(|e| e.path().is_dir() && e.path().join("episode.json").exists())
                    .count()
            })
            .unwrap_or(0);

        let updated = meta
            .get("updated")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        // Find a thumbnail: look for thumbnail.png, or first screenshot in any episode
        let thumbnail = find_project_thumbnail(&path);

        projects.push(json!({
            "name": meta.get("name").and_then(Value::as_str).unwrap_or_default(),
            "path": path.display().to_string(),
            "episodes": episode_count,
            "updated": updated,
            "thumbnail": thumbnail,
        }));
    }

    projects.sort_by(|a, b| {
        let a_updated = a.get("updated").and_then(Value::as_str).unwrap_or("");
        let b_updated = b.get("updated").and_then(Value::as_str).unwrap_or("");
        b_updated.cmp(a_updated)
    });

    Ok(json!({ "projects": projects }))
}

use std::path::Path;

/// Find a thumbnail for a project: check thumbnail.png at project root,
/// then look for screenshots or .mp4 in episode subdirectories.
/// Returns a relative path from the project root (for nfdata:// URLs).
fn find_project_thumbnail(project_dir: &Path) -> Option<String> {
    // 1. Direct thumbnail at project root
    for name in &["thumbnail.png", "thumbnail.jpg", "cover.png", "cover.jpg"] {
        if project_dir.join(name).exists() {
            return Some(name.to_string());
        }
    }

    // 2. Look in episode subdirectories for screenshots or frames
    let Ok(entries) = fs::read_dir(project_dir) else {
        return None;
    };
    for entry in entries.filter_map(Result::ok) {
        let ep_path = entry.path();
        if !ep_path.is_dir() || !ep_path.join("episode.json").exists() {
            continue;
        }
        let ep_name = entry.file_name().to_string_lossy().to_string();

        // Check screenshots/ dir
        let screenshots = ep_path.join("screenshots");
        if screenshots.is_dir() {
            if let Some(img) = first_image_in(&screenshots) {
                return Some(format!("{ep_name}/screenshots/{img}"));
            }
        }

        // Check .frames/ dir
        let frames = ep_path.join(".frames");
        if frames.is_dir() {
            if let Some(img) = first_image_in(&frames) {
                return Some(format!("{ep_name}/.frames/{img}"));
            }
        }
    }
    None
}

fn first_image_in(dir: &Path) -> Option<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".png") || name.ends_with(".jpg") || name.ends_with(".jpeg") {
            return Some(name);
        }
    }
    None
}

pub(crate) fn handle_project_create(params: &Value) -> Result<Value, String> {
    let name = require_string(params, "name")?;
    let root = projects_root();
    let project_dir = root.join(name);
    if project_dir.exists() {
        return Err(format!( // Fix: included in the error string below
            "failed to create project: project '{name}' already exists. Fix: choose a different project name or remove the existing project directory."
        ));
    }

    fs::create_dir_all(&project_dir).map_err(|e| format!("failed to create project dir: {e}"))?;

    let now = iso_now();
    let meta = json!({
        "name": name,
        "created": now,
        "updated": now,
    });

    let project_json = project_dir.join("project.json");
    fs::write(
        &project_json,
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("failed to write project.json: {e}"))?;

    Ok(json!({ "path": project_dir.display().to_string() }))
}
