use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::storage::fs::{resolve_existing_path, resolve_write_path};
use crate::util::validation::require_string;

fn replace_json_extension(path: &Path) -> PathBuf {
    let as_string = path.to_string_lossy();
    if let Some(stripped) = as_string.strip_suffix(".json") {
        return PathBuf::from(format!("{stripped}.html"));
    }
    PathBuf::from(format!("{as_string}.html"))
}

fn resolve_bundle_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for relative in [
        "../nf-runtime/web/src/bundle.cjs",
        "../runtime/web/src/bundle.cjs",
    ] {
        let candidate = manifest_dir.join(relative);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("failed to resolve compose bundle from current directory".to_string())
}

pub(crate) fn handle_compose_generate(params: &Value) -> Result<Value, String> {
    let timeline_path = resolve_existing_path(require_string(params, "timelinePath")?)?;
    let output_path = match params.get("outputPath").and_then(Value::as_str) {
        Some(raw) if !raw.trim().is_empty() => resolve_write_path(raw)?,
        _ => replace_json_extension(&timeline_path),
    };

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create output directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    let bundle_path = resolve_bundle_path()?;

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
            format!(
                "bundle exited with code {}",
                output.status.code().unwrap_or(-1)
            )
        };
        return Err(details);
    }

    let meta = fs::metadata(&output_path).map_err(|error| {
        format!(
            "failed to stat composed html {}: {error}",
            output_path.display()
        )
    })?;

    if params.get("open").and_then(Value::as_bool).unwrap_or(false) {
        open_in_browser(&output_path)?;
    }

    Ok(json!({
        "path": output_path.display().to_string(),
        "size": meta.len(),
    }))
}

#[cfg(not(test))]
fn open_in_browser(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut next = Command::new("open");
        next.arg(path);
        next
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut next = Command::new("cmd");
        next.args(["/C", "start", "", &path.display().to_string()]);
        next
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut next = Command::new("xdg-open");
        next.arg(path);
        next
    };

    let status = command
        .status()
        .map_err(|error| format!("failed to open '{}': {error}", path.display()))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "failed to open '{}': command exited with {}",
            path.display(),
            status.code().unwrap_or(-1)
        ))
    }
}

#[cfg(test)]
fn open_in_browser(_path: &Path) -> Result<(), String> {
    Ok(())
}
