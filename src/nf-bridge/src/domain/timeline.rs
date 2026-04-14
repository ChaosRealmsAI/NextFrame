//! domain timeline handlers
use serde_json::{json, Value};
use std::fs;

use crate::storage::fs::{resolve_existing_path, resolve_write_path};
use crate::util::validation::{require_string, require_value_alias};

pub(crate) fn handle_timeline_load(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read timeline '{}': {error}", path_buf.display()))?;

    let mut timeline: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse timeline '{}': {error}", path_buf.display()))?;
    infer_missing_version(&mut timeline);
    validate_timeline_contract(&timeline).map_err(|error| {
        format!(
            "failed to validate timeline '{}': {error}",
            path_buf.display()
        )
    })?;
    Ok(timeline)
}

pub(crate) fn handle_timeline_save(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_write_path(path)?;
    let json_value = require_value_alias(params, &["json", "timeline"])?;
    let serialized = serde_json::to_string_pretty(json_value).map_err(|error| {
        format!(
            "failed to serialize timeline for '{}': {error}",
            path_buf.display()
        )
    })?;

    let bytes_written = serialized.len();
    fs::write(&path_buf, serialized)
        .map_err(|error| format!("failed to write timeline '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": bytes_written,
    }))
}

fn infer_missing_version(timeline: &mut Value) {
    let Some(object) = timeline.as_object_mut() else {
        return;
    };
    if object
        .get("version")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        return;
    }

    let inferred = if object.get("layers").and_then(Value::as_array).is_some()
        || object
            .get("schema")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "nextframe/v0.3")
    {
        Some("0.3")
    } else if object.get("tracks").and_then(Value::as_array).is_some()
        || object
            .get("schema")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "nextframe/v0.1")
    {
        Some("0.1")
    } else {
        None
    };

    if let Some(version) = inferred {
        object.insert("version".to_string(), Value::String(version.to_string()));
    }
}

fn validate_timeline_contract(timeline: &Value) -> Result<(), String> {
    let object = timeline
        .as_object()
        .ok_or_else(|| "timeline must be a JSON object".to_string())?;
    let version = object
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "timeline.version must be a non-empty string".to_string())?;
    if version.trim().is_empty() || !is_semver_like(version) {
        return Err(format!(
            "timeline.version must be a semver-like string, got {version:?}"
        ));
    }

    if let Some(tracks) = object.get("tracks").and_then(Value::as_array) {
        validate_tracks(tracks)?;
        return Ok(());
    }
    if let Some(layers) = object.get("layers").and_then(Value::as_array) {
        validate_number_field(object, "width")?;
        validate_number_field(object, "height")?;
        validate_number_field(object, "fps")?;
        validate_number_field(object, "duration")?;
        validate_layers(layers)?;
        return Ok(());
    }

    Err("timeline must contain either tracks[] or layers[]".to_string())
}

fn validate_tracks(tracks: &[Value]) -> Result<(), String> {
    for (track_index, track) in tracks.iter().enumerate() {
        let track_object = track
            .as_object()
            .ok_or_else(|| format!("tracks[{track_index}] must be an object"))?;
        validate_string_field(track_object, "id", &format!("tracks[{track_index}]"))?;
        let clips = track_object
            .get("clips")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("tracks[{track_index}].clips must be an array"))?;
        for (clip_index, clip) in clips.iter().enumerate() {
            validate_clip_fields(clip, &format!("tracks[{track_index}].clips[{clip_index}]"))?;
        }
    }
    Ok(())
}

fn validate_layers(layers: &[Value]) -> Result<(), String> {
    for (layer_index, layer) in layers.iter().enumerate() {
        validate_clip_fields(layer, &format!("layers[{layer_index}]"))?;
    }
    Ok(())
}

fn validate_clip_fields(value: &Value, label: &str) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| format!("{label} must be an object"))?;
    validate_string_field(object, "id", label)?;
    validate_string_field(object, "scene", label)?;
    validate_number_field(object, "start")?;
    validate_number_field(object, "dur")?;
    match object.get("params") {
        Some(Value::Object(_)) => Ok(()),
        _ => Err(format!("{label}.params must be an object")),
    }
}

fn validate_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    let value = object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{label}.{key} must be a non-empty string"))?;
    if value.trim().is_empty() {
        return Err(format!("{label}.{key} must be a non-empty string"));
    }
    Ok(())
}

fn validate_number_field(object: &serde_json::Map<String, Value>, key: &str) -> Result<(), String> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("timeline.{key} must be a number"))?;
    Ok(())
}

fn is_semver_like(version: &str) -> bool {
    let mut parts = version.split('.');
    let Some(major) = parts.next() else {
        return false;
    };
    let Some(minor) = parts.next() else {
        return false;
    };
    let patch = parts.next();
    if parts.next().is_some() {
        return false;
    }
    if !major.chars().all(|ch| ch.is_ascii_digit()) || !minor.chars().all(|ch| ch.is_ascii_digit())
    {
        return false;
    }
    match patch {
        Some(value) => !value.is_empty() && value.chars().all(|ch| ch.is_ascii_digit()),
        None => true,
    }
}
