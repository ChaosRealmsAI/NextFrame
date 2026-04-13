use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::validation::require_string;

fn replace_json_extension(path: &Path) -> PathBuf {
    let as_string = path.to_string_lossy();
    if let Some(stripped) = as_string.strip_suffix(".json") {
        return PathBuf::from(format!("{stripped}.html"));
    }
    PathBuf::from(format!("{as_string}.html"))
}

pub(crate) fn handle_compose_generate(params: &Value) -> Result<Value, String> {
    let timeline_path = PathBuf::from(require_string(params, "timelinePath")?);
    let output_path = match params.get("outputPath").and_then(Value::as_str) {
        Some(raw) if !raw.trim().is_empty() => PathBuf::from(raw),
        _ => replace_json_extension(&timeline_path),
    };

    let bundle_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime/web/src/bundle.cjs");

    let output = Command::new("node")
        .arg(&bundle_path)
        .arg(&timeline_path)
        .arg(&output_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("failed to run compose bundle: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let details = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("bundle exited with code {}", output.status.code().unwrap_or(-1))
        };
        return Err(details);
    }

    let meta = fs::metadata(&output_path)
        .map_err(|error| format!("failed to stat composed html {}: {error}", output_path.display()))?;

    Ok(json!({
        "ok": true,
        "path": output_path,
        "size": meta.len(),
    }))
}
