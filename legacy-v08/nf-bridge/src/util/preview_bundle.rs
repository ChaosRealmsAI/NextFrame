//! utility preview scene bundle generation
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::path::preview_bundle_cache_dir;
use crate::util::validation::require_value;

fn resolve_bundler_path() -> PathBuf {
    crate::path::workspace_root()
        .join("src")
        .join("nf-core")
        .join("engine")
        .join("bundle-for-preview.ts")
}

fn resolve_tsx_path() -> PathBuf {
    crate::path::workspace_root()
        .join("src")
        .join("nf-cli")
        .join("node_modules")
        .join(".bin")
        .join("tsx")
}

fn extract_scene_ids(timeline: &Value) -> Vec<String> {
    let layers = timeline
        .get("layers")
        .and_then(Value::as_array)
        .or_else(|| timeline.get("clips").and_then(Value::as_array));

    let mut scene_ids = BTreeSet::new();
    if let Some(layers) = layers {
        for layer in layers {
            if let Some(scene_id) = layer.get("scene").and_then(Value::as_str) {
                scene_ids.insert(scene_id.to_string());
            }
        }
    }

    scene_ids.into_iter().collect()
}

fn bundle_hash(scene_ids: &[String]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"preview-bundle:v2\n");
    for scene_id in scene_ids {
        hasher.update(scene_id.as_bytes());
        hasher.update(b"\n");
    }
    format!("{:x}", hasher.finalize())
}

fn temp_timeline_path(hash: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    std::env::temp_dir().join(format!("nextframe-preview-bundle-{hash}-{millis}.json"))
}

pub(crate) fn handle_preview_bundle(params: &Value) -> Result<Value, String> {
    let timeline = require_value(params, "timeline")?;
    if !timeline.is_object() {
        return Err(
            "failed to read params.timeline: params.timeline must be a JSON object. Fix: provide the full timeline JSON object in params.timeline.".to_string(),
        );
    }

    let scene_ids = extract_scene_ids(timeline);
    let hash = bundle_hash(&scene_ids);
    let output_dir = preview_bundle_cache_dir();
    let output_path = output_dir.join(format!("scene-bundle-{hash}.js"));
    let mut cached = output_path.is_file();

    if !cached {
        fs::create_dir_all(&output_dir).map_err(|error| {
            format!(
                "failed to create preview bundle cache '{}': {error}. Fix: ensure the cache directory is writable.",
                output_dir.display()
            )
        })?;

        let timeline_path = temp_timeline_path(&hash);
        let timeline_json = serde_json::to_vec(timeline).map_err(|error| {
            format!(
                "failed to serialize preview timeline: {error}. Fix: provide timeline data that can be serialized to JSON."
            )
        })?;
        fs::write(&timeline_path, timeline_json).map_err(|error| {
            format!(
                "failed to write preview timeline '{}': {error}. Fix: ensure the system temp directory is writable.",
                timeline_path.display()
            )
        })?;

        let bundler_path = resolve_bundler_path();
        let tsx_path = resolve_tsx_path();
        if !tsx_path.is_file() {
            return Err(format!(
                "failed to run preview bundler: missing '{}'. Fix: install nf-cli dependencies so tsx is available.",
                tsx_path.display()
            ));
        }
        let output = Command::new(&tsx_path)
            .arg(&bundler_path)
            .arg(&timeline_path)
            .arg(&output_path)
            .output()
            .map_err(|error| {
                format!(
                    "failed to run preview bundler: {error}. Fix: ensure node is installed and available on PATH."
                )
            })?;
        let _ = fs::remove_file(&timeline_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let details = if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!(
                    "preview bundler exited with code {}",
                    output.status.code().unwrap_or(-1)
                )
            };
            return Err(format!(
                "failed to generate preview bundle: {details}. Fix: verify the timeline scene IDs match files under src/nf-core/scenes."
            ));
        }

        cached = false;
    }

    Ok(json!({
        "url": format!("nf://localhost/generated/scene-bundle-{hash}.js"),
        "sceneIds": scene_ids,
        "cached": cached,
    }))
}
