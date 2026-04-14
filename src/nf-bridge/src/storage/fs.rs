//! storage filesystem handlers
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::codec::encoding::base64_decode;
use crate::util::path::{canonical_or_raw, expand_home_dir, home_dir, home_root};
use crate::util::validation::{require_string, require_string_alias};

pub(crate) fn handle_fs_read(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "contents": contents,
    }))
}

pub(crate) fn handle_fs_write(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let contents = require_string(params, "contents")?;
    let path_buf = resolve_write_path(path)?;

    fs::write(&path_buf, contents)
        .map_err(|error| format!("failed to write '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": contents.len(),
    }))
}

pub(crate) fn handle_fs_list_dir(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_existing_path(path)?;
    let mut entries = fs::read_dir(&path_buf)
        .map_err(|error| format!("failed to list '{}': {error}", path_buf.display()))?
        .map(|entry_result| {
            let entry =
                entry_result.map_err(|error| format!("failed to inspect dir entry: {error}"))?;
            let entry_path = entry.path();
            let metadata = entry.metadata().map_err(|error| {
                format!(
                    "failed to read metadata for '{}': {error}",
                    entry_path.display()
                )
            })?;

            Ok(json!({
                "name": entry.file_name().to_string_lossy().to_string(),
                "path": entry_path.display().to_string(),
                "isDir": metadata.is_dir(),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|left, right| {
        let left_name = left.get("name").and_then(Value::as_str).unwrap_or_default();
        let right_name = right
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_name.cmp(right_name)
    });

    Ok(json!({
        "path": path,
        "entries": entries,
    }))
}

pub(crate) fn handle_fs_mtime(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Ok(json!({ "mtime": null }));
    }
    let metadata = fs::metadata(&path_buf).map_err(|e| format!("failed to read metadata: {e}"))?;
    let mtime = metadata
        .modified()
        .map_err(|e| format!("failed to get mtime: {e}"))?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(json!({ "mtime": mtime as u64 }))
}

pub(crate) fn handle_fs_write_base64(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let data_url = require_string_alias(params, &["data"])?;

    // Strip data URL prefix: "data:image/png;base64,..."
    let b64_data = data_url
        .find(",")
        .map(|i| &data_url[i + 1..])
        .unwrap_or(data_url);

    let bytes = base64_decode(b64_data)?;
    let path_buf = PathBuf::from(path);

    if let Some(parent) = path_buf.parent() {
        let _ = fs::create_dir_all(parent);
    }

    fs::write(&path_buf, &bytes)
        .map_err(|e| format!("failed to write '{}': {e}", path_buf.display()))?;

    Ok(json!({
        "path": path_buf.display().to_string(),
        "bytesWritten": bytes.len(),
    }))
}

pub(crate) fn validate_path(raw_path: &str) -> Result<PathBuf, String> {
    let normalized = raw_path.trim();
    if normalized.is_empty() {
        return Err( // Fix: included in the error string below
            "failed to validate path: value is empty. Fix: provide a non-empty path.".to_string(),
        );
    }

    if normalized.contains('\0') {
        return Err( // Fix: included in the error string below
            "failed to validate path: path must not contain null bytes. Fix: remove null bytes from the path.".to_string(),
        );
    }

    if normalized.contains("..") {
        return Err(format!( // Fix: included in the error string below
            "failed to validate path: path is outside sandbox: {raw_path}. Fix: use a path under your home directory or the system temp directory without '..'."
        ));
    }

    Ok(expand_home_dir(normalized))
}

pub(crate) fn resolve_existing_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;

    ensure_allowed_path(&canonical, raw_path)?;
    Ok(canonical)
}

pub(crate) fn resolve_write_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let existing_parent = nearest_existing_ancestor(parent)
        .ok_or_else(|| {
            format!(
                "failed to resolve parent path: no existing parent was found for '{}'. Fix: create the parent directory first or choose an existing destination.",
                path.display()
            )
        })?;
    let canonical_parent = fs::canonicalize(&existing_parent).map_err(|error| {
        format!(
            "failed to resolve parent for '{}': {error}",
            existing_parent.display()
        )
    })?;

    ensure_allowed_path(&canonical_parent, raw_path)?;

    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let canonical_target = fs::canonicalize(&path)
                .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;
            ensure_allowed_path(&canonical_target, raw_path)?;
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!( // Fix: included in the error string below
                "failed to inspect path: could not inspect '{}': {error}. Fix: verify the path is accessible and try again.",
                path.display()
            ));
        }
    }

    Ok(path)
}

pub(crate) fn resolve_home_existing_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;

    ensure_home_path(&canonical, raw_path)?;
    Ok(canonical)
}

pub(crate) fn resolve_home_write_path(raw_path: &str) -> Result<PathBuf, String> {
    let path = validate_path(raw_path)?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let existing_parent = nearest_existing_ancestor(parent)
        .ok_or_else(|| {
            format!(
                "failed to resolve parent path: no existing parent was found for '{}'. Fix: create the parent directory first or choose an existing destination.",
                path.display()
            )
        })?;
    let canonical_parent = fs::canonicalize(&existing_parent).map_err(|error| {
        format!(
            "failed to resolve parent for '{}': {error}",
            existing_parent.display()
        )
    })?;

    ensure_home_path(&canonical_parent, raw_path)?;

    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let canonical_target = fs::canonicalize(&path)
                .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;
            ensure_home_path(&canonical_target, raw_path)?;
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!( // Fix: included in the error string below
                "failed to inspect path: could not inspect '{}': {error}. Fix: verify the path is accessible and try again.",
                path.display()
            ));
        }
    }

    Ok(path)
}

pub(crate) fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = path;

    loop {
        if current.exists() {
            return Some(current.to_path_buf());
        }

        current = current.parent()?;
    }
}

pub(crate) fn ensure_allowed_path(path: &Path, raw_path: &str) -> Result<(), String> {
    if is_allowed_path(path) {
        Ok(())
    } else {
        Err(format!( // Fix: included in the error string below
            "failed to validate path: path is outside sandbox: {raw_path}. Fix: use a path under your home directory or the system temp directory."
        ))
    }
}

fn ensure_home_path(path: &Path, raw_path: &str) -> Result<(), String> {
    let home = home_root()?;
    if path.starts_with(&home) {
        Ok(())
    } else {
        Err(format!( // Fix: included in the error string below
            "failed to validate path: path is outside sandbox: {raw_path}. Fix: use a path inside your home directory."
        ))
    }
}

pub(crate) fn is_allowed_path(path: &Path) -> bool {
    allowed_roots()
        .into_iter()
        .any(|root| path.starts_with(root))
}

pub(crate) fn allowed_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    roots.push(canonical_or_raw(env::temp_dir()));
    if let Some(home) = home_dir() {
        roots.push(canonical_or_raw(home));
    }

    roots
}

pub(crate) fn resolve_reveal_path(raw_path: &str) -> Result<PathBuf, String> {
    resolve_existing_path(raw_path).or_else(|_| resolve_write_path(raw_path))
}
