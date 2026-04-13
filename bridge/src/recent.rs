use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::sync::{Mutex, OnceLock};

use crate::fs::{resolve_home_existing_path, resolve_home_write_path, validate_path};
use crate::util::path::{home_dir, home_root};
use crate::util::time::unix_timestamp_secs;
use crate::util::validation::{require_object, require_string};

pub(crate) const RECENT_DIR_NAME: &str = ".nextframe";
pub(crate) const RECENT_FILE_NAME: &str = "recent.json";
pub(crate) const RECENT_MAX_ENTRIES: usize = 10;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecentProjectRecord {
    pub(crate) path: String,
    pub(crate) last_opened: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecentProjectItem {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) last_opened: u64,
}

pub(crate) fn handle_recent_list(params: &Value) -> Result<Value, String> {
    let _ = require_object(params)?;
    let storage_path = ensure_recent_storage_file()?;
    let records = normalize_recent_records(read_recent_records(&storage_path)?);

    save_recent_records(&storage_path, &records)?;

    serde_json::to_value(
        records
            .into_iter()
            .map(|record| RecentProjectItem {
                name: recent_project_name(&record.path),
                path: record.path,
                last_opened: record.last_opened,
            })
            .collect::<Vec<_>>(),
    )
    .map_err(|error| format!("failed to serialize recent projects: {error}"))
}

pub(crate) fn handle_recent_add(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = resolve_home_existing_path(path)?;
    ensure_recent_project_extension(&path_buf, path)?;

    let storage_path = ensure_recent_storage_file()?;
    let mut records = normalize_recent_records(read_recent_records(&storage_path)?);
    let canonical_path = path_buf.display().to_string();

    records.retain(|record| record.path != canonical_path);
    records.insert(
        0,
        RecentProjectRecord {
            path: canonical_path,
            last_opened: unix_timestamp_secs()?,
        },
    );
    records.truncate(RECENT_MAX_ENTRIES);

    save_recent_records(&storage_path, &records)?;

    Ok(json!({
        "count": records.len(),
    }))
}

pub(crate) fn handle_recent_clear(params: &Value) -> Result<Value, String> {
    let _ = require_object(params)?;
    let storage_path = ensure_recent_storage_file()?;
    save_recent_records(&storage_path, &[])?;

    Ok(json!({
        "cleared": true,
    }))
}

fn recent_storage_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(path) = recent_storage_path_override() {
        return Ok(path);
    }

    let home = home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let storage_path = home.join(RECENT_DIR_NAME).join(RECENT_FILE_NAME);
    let raw_path = storage_path.display().to_string();
    resolve_home_write_path(&raw_path)
}

fn ensure_recent_storage_file() -> Result<PathBuf, String> {
    let storage_path = recent_storage_path()?;

    if let Some(parent) = storage_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create recent file directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    match fs::metadata(&storage_path) {
        Ok(metadata) if metadata.is_dir() => Err(format!(
            "recent file path is a directory: {}",
            storage_path.display()
        )),
        Ok(_) => Ok(storage_path),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::write(&storage_path, "[]").map_err(|write_error| {
                format!(
                    "failed to create recent file '{}': {write_error}",
                    storage_path.display()
                )
            })?;
            Ok(storage_path)
        }
        Err(error) => Err(format!(
            "failed to inspect recent file '{}': {error}",
            storage_path.display()
        )),
    }
}

fn read_recent_records(storage_path: &Path) -> Result<Vec<RecentProjectRecord>, String> {
    let contents = fs::read_to_string(storage_path).map_err(|error| {
        format!(
            "failed to read recent file '{}': {error}",
            storage_path.display()
        )
    })?;

    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&contents).map_err(|error| {
        format!(
            "failed to parse recent file '{}': {error}",
            storage_path.display()
        )
    })
}

fn save_recent_records(storage_path: &Path, records: &[RecentProjectRecord]) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(records).map_err(|error| {
        format!(
            "failed to serialize recent file '{}': {error}",
            storage_path.display()
        )
    })?;

    fs::write(storage_path, serialized).map_err(|error| {
        format!(
            "failed to write recent file '{}': {error}",
            storage_path.display()
        )
    })
}

fn normalize_recent_records(records: Vec<RecentProjectRecord>) -> Vec<RecentProjectRecord> {
    let mut normalized = Vec::with_capacity(records.len().min(RECENT_MAX_ENTRIES));
    let mut seen = HashSet::new();

    for record in records {
        if !is_recent_project_path(&record.path) {
            continue;
        }

        if seen.insert(record.path.clone()) {
            normalized.push(record);
        }

        if normalized.len() == RECENT_MAX_ENTRIES {
            break;
        }
    }

    normalized
}

fn is_recent_project_path(raw_path: &str) -> bool {
    let Ok(path) = validate_path(raw_path) else {
        return false;
    };
    let Ok(home) = home_root() else {
        return false;
    };

    path.starts_with(&home) && has_recent_project_extension(&path)
}

fn recent_project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(path)
        .to_string()
}

pub(crate) fn has_recent_project_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("nfproj"))
}

fn ensure_recent_project_extension(path: &Path, raw_path: &str) -> Result<(), String> {
    if has_recent_project_extension(path) {
        Ok(())
    } else {
        Err(format!("path must point to a .nfproj file: {raw_path}"))
    }
}

// --- test mocking ---

#[cfg(test)]
pub(crate) static RECENT_STORAGE_PATH_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
#[cfg(test)]
pub(crate) static RECENT_STORAGE_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn recent_storage_path_override() -> Option<PathBuf> {
    recent_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[cfg(test)]
pub(crate) fn set_recent_storage_path_override_for_tests(path: Option<PathBuf>) {
    let mut state = recent_storage_path_override_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *state = path;
}

#[cfg(test)]
fn recent_storage_path_override_state() -> &'static Mutex<Option<PathBuf>> {
    RECENT_STORAGE_PATH_OVERRIDE.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub(crate) fn recent_storage_test_lock() -> &'static Mutex<()> {
    RECENT_STORAGE_TEST_LOCK.get_or_init(|| Mutex::new(()))
}
