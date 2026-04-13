use serde_json::{json, Value};
use std::fs;

use crate::fs::{resolve_existing_path, resolve_write_path};
use crate::util::validation::{require_string, require_value_alias};

pub(crate) fn handle_timeline_load(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read timeline '{}': {error}", path_buf.display()))?;

    serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse timeline '{}': {error}", path_buf.display()))
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
