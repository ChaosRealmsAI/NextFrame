use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use crate::fs::resolve_home_write_path;
use crate::util::path::home_dir;
use crate::recent::{has_recent_project_extension, RECENT_DIR_NAME};
use crate::util::validation::{require_string_alias, require_value_alias};

pub(crate) const AUTOSAVE_DIR_NAME: &str = "autosave";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutosaveListItem {
    pub(crate) project_id: String,
    pub(crate) path: String,
    pub(crate) modified: u64,
}

pub(crate) fn handle_autosave_write(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let timeline = require_value_alias(params, &["timeline", "json"])?;
    let autosave_path = autosave_file_path(project_id)?;
    let serialized = serde_json::to_string_pretty(timeline).map_err(|error| {
        format!(
            "failed to serialize autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    if let Some(parent) = autosave_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create autosave directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    let bytes_written = serialized.len();
    fs::write(&autosave_path, serialized).map_err(|error| {
        format!(
            "failed to write autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    Ok(json!({
        "projectId": project_id,
        "path": autosave_path.display().to_string(),
        "bytesWritten": bytes_written,
    }))
}

pub(crate) fn handle_autosave_list(_params: &Value) -> Result<Value, String> {
    let autosave_dir = autosave_dir_path()?;
    let metadata = match fs::metadata(&autosave_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(json!([])),
        Err(error) => {
            return Err(format!(
                "failed to inspect autosave directory '{}': {error}",
                autosave_dir.display()
            ));
        }
    };

    if !metadata.is_dir() {
        return Err(format!(
            "autosave path is not a directory: {}",
            autosave_dir.display()
        ));
    }

    let mut entries = fs::read_dir(&autosave_dir)
        .map_err(|error| {
            format!(
                "failed to list autosave directory '{}': {error}",
                autosave_dir.display()
            )
        })?
        .filter_map(Result::ok)
        .filter_map(|entry| autosave_list_item(&entry.path()).transpose())
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| left.project_id.cmp(&right.project_id))
    });

    Ok(json!(entries))
}

pub(crate) fn handle_autosave_clear(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let autosave_path = autosave_file_path(project_id)?;

    let cleared = match fs::remove_file(&autosave_path) {
        Ok(()) => true,
        Err(error) if error.kind() == ErrorKind::NotFound => false,
        Err(error) => {
            return Err(format!(
                "failed to clear autosave '{}': {error}",
                autosave_path.display()
            ));
        }
    };

    Ok(json!({
        "projectId": project_id,
        "path": autosave_path.display().to_string(),
        "cleared": cleared,
    }))
}

pub(crate) fn handle_autosave_recover(params: &Value) -> Result<Value, String> {
    let project_id = require_string_alias(params, &["projectId", "project_id"])?;
    let autosave_path = autosave_file_path(project_id)?;
    let contents = fs::read_to_string(&autosave_path).map_err(|error| {
        format!(
            "failed to read autosave '{}': {error}",
            autosave_path.display()
        )
    })?;

    serde_json::from_str(&contents).map_err(|error| {
        format!(
            "failed to parse autosave '{}': {error}",
            autosave_path.display()
        )
    })
}

fn autosave_dir_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(path) = autosave_storage_path_override() {
        return Ok(path);
    }

    let home = home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let autosave_dir = home.join(RECENT_DIR_NAME).join(AUTOSAVE_DIR_NAME);
    let raw_path = autosave_dir.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn autosave_file_path(project_id: &str) -> Result<PathBuf, String> {
    validate_autosave_project_id(project_id)?;
    let autosave_dir = autosave_dir_path()?;
    let autosave_path = autosave_dir.join(format!("{project_id}.nfproj"));
    let raw_path = autosave_path.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn validate_autosave_project_id(project_id: &str) -> Result<(), String> {
    if project_id.is_empty() {
        return Err("params.projectId must be a non-empty string".to_string());
    }

    if project_id == "." || project_id == ".." || project_id.contains(['/', '\\']) {
        return Err(format!("invalid autosave project id: {project_id}"));
    }

    Ok(())
}

fn autosave_list_item(path: &Path) -> Result<Option<AutosaveListItem>, String> {
    if !has_recent_project_extension(path) {
        return Ok(None);
    }

    let project_id = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("invalid autosave filename '{}'", path.display()))?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to inspect autosave '{}': {error}", path.display()))?;
    if !metadata.is_file() {
        return Ok(None);
    }

    let modified = metadata
        .modified()
        .map_err(|error| format!("failed to inspect autosave '{}': {error}", path.display()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("autosave modified time before unix epoch: {error}"))?
        .as_millis() as u64;

    Ok(Some(AutosaveListItem {
        project_id: project_id.to_string(),
        path: path.display().to_string(),
        modified,
    }))
}

// --- test mocking ---

#[cfg(test)]
pub(crate) static AUTOSAVE_STORAGE_PATH_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> =
    OnceLock::new();
#[cfg(test)]
pub(crate) static AUTOSAVE_STORAGE_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn autosave_storage_path_override() -> Option<PathBuf> {
    autosave_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[cfg(test)]
pub(crate) fn set_autosave_storage_path_override_for_tests(path: Option<PathBuf>) {
    let mut state = autosave_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *state = path;
}

#[cfg(test)]
fn autosave_storage_path_override_state() -> &'static Mutex<Option<PathBuf>> {
    AUTOSAVE_STORAGE_PATH_OVERRIDE.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub(crate) fn autosave_storage_test_lock() -> &'static Mutex<()> {
    AUTOSAVE_STORAGE_TEST_LOCK.get_or_init(|| Mutex::new(()))
}
