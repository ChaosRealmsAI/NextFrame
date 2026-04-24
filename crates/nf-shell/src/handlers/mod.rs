use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::errors::NfError;
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, Project, Registry, RegistryProject, Storage, validate_slug};

pub mod anchors;
pub mod app;
pub mod clips;
pub mod episodes;
pub mod export;
pub mod log;
pub mod projects;

pub struct ComposeOpHandler {
    storage: JsonStorage,
    handlers: Vec<Box<dyn OpHandler>>,
}

impl ComposeOpHandler {
    pub fn from_default_storage() -> Result<Self, NfError> {
        Ok(Self::new(JsonStorage::new(JsonStorage::default_root()?)))
    }

    pub fn new(storage: JsonStorage) -> Self {
        Self {
            storage: storage.clone(),
            handlers: vec![
                Box::new(projects::ProjectsOpHandler::new(storage.clone())),
                Box::new(episodes::EpisodesOpHandler::new(storage.clone())),
                Box::new(clips::ClipsOpHandler::new(storage.clone())),
                Box::new(anchors::AnchorsOpHandler::new(storage.clone())),
                Box::new(export::ExportOpHandler::new(storage.clone())),
                Box::new(log::LogOpHandler::new(storage)),
            ],
        }
    }
}

impl OpHandler for ComposeOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        for handler in &self.handlers {
            match handler.handle(req) {
                Ok(None) => {}
                Ok(Some(data)) => {
                    let _log_result = log::append_auto(&self.storage, req);
                    return Ok(Some(data));
                }
                Err(err) => return Err(err),
            }
        }

        Ok(None)
    }
}

pub(crate) fn required_str(params: &Value, name: &str) -> Result<String, NfError> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| NfError::ValidationFailed(format!("missing required parameter `{name}`")))
}

pub(crate) fn optional_str(params: &Value, name: &str) -> Option<String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(crate) fn optional_bool(params: &Value, name: &str) -> bool {
    params.get(name).and_then(Value::as_bool).unwrap_or(false)
}

pub(crate) fn optional_usize(params: &Value, name: &str, default: usize) -> Result<usize, NfError> {
    match params.get(name) {
        Some(value) => value
            .as_u64()
            .and_then(|number| usize::try_from(number).ok())
            .ok_or_else(|| {
                NfError::ValidationFailed(format!("`{name}` must be a positive integer"))
            }),
        None => Ok(default),
    }
}

pub(crate) fn required_f64(params: &Value, name: &str) -> Result<f64, NfError> {
    params
        .get(name)
        .and_then(Value::as_f64)
        .ok_or_else(|| NfError::ValidationFailed(format!("`{name}` must be a number")))
}

pub(crate) fn optional_f64(params: &Value, name: &str) -> Result<Option<f64>, NfError> {
    match params.get(name) {
        Some(value) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| NfError::ValidationFailed(format!("`{name}` must be a number"))),
        None => Ok(None),
    }
}

pub(crate) fn string_list(params: &Value, name: &str) -> Vec<String> {
    match params.get(name) {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(Value::String(raw)) => split_csv(raw),
        _ => Vec::new(),
    }
}

pub(crate) fn split_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub(crate) fn load_registry_or_empty(storage: &JsonStorage) -> Result<Registry, NfError> {
    let path = registry_path(storage);
    if !path.exists() {
        return Ok(Registry {
            projects: Vec::new(),
        });
    }

    Ok(storage.load_registry()?)
}

pub(crate) fn save_registry_project(
    storage: &JsonStorage,
    slug: &str,
    name: &str,
    created: &str,
    modified: &str,
) -> Result<(), NfError> {
    let mut registry = load_registry_or_empty(storage)?;
    registry.projects.retain(|project| project.slug != slug);
    registry.projects.push(RegistryProject {
        slug: slug.to_string(),
        name: name.to_string(),
        created: created.to_string(),
        last_modified: modified.to_string(),
    });
    registry.projects.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(storage.save_registry(&registry)?)
}

pub(crate) fn remove_registry_project(storage: &JsonStorage, slug: &str) -> Result<(), NfError> {
    let mut registry = load_registry_or_empty(storage)?;
    registry.projects.retain(|project| project.slug != slug);
    Ok(storage.save_registry(&registry)?)
}

pub(crate) fn ensure_project(storage: &JsonStorage, slug: &str) -> Result<Project, NfError> {
    validate_slug(slug)?;
    let path = project_path(storage, slug);
    if !path.exists() {
        return Err(NfError::UnknownProject {
            slug: slug.to_string(),
            hint: "nf projects list".to_string(),
        });
    }

    Ok(storage.load_project(slug)?)
}

pub(crate) fn ensure_episode(
    storage: &JsonStorage,
    project_slug: &str,
    episode_slug: &str,
) -> Result<crate::storage::Episode, NfError> {
    ensure_project(storage, project_slug)?;
    validate_slug(episode_slug)?;
    let path = episode_path(storage, project_slug, episode_slug);
    if !path.exists() {
        return Err(NfError::UnknownEpisode {
            slug: episode_slug.to_string(),
            hint: format!("nf episodes list --project={project_slug}"),
        });
    }

    Ok(storage.load_episode(project_slug, episode_slug)?)
}

pub(crate) fn registry_path(storage: &JsonStorage) -> PathBuf {
    storage.root().join("registry.json")
}

pub(crate) fn project_dir(storage: &JsonStorage, slug: &str) -> PathBuf {
    storage.root().join(slug)
}

pub(crate) fn project_path(storage: &JsonStorage, slug: &str) -> PathBuf {
    project_dir(storage, slug).join("project.json")
}

pub(crate) fn episodes_dir(storage: &JsonStorage, project_slug: &str) -> PathBuf {
    project_dir(storage, project_slug).join("episodes")
}

pub(crate) fn episode_path(
    storage: &JsonStorage,
    project_slug: &str,
    episode_slug: &str,
) -> PathBuf {
    episodes_dir(storage, project_slug).join(format!("{episode_slug}.json"))
}

pub(crate) fn archive_dir(storage: &JsonStorage) -> PathBuf {
    storage.root().join(".archive")
}

pub(crate) fn fs_modified_iso(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(system_time_iso)
        .unwrap_or_else(|_err| now_iso())
}

pub(crate) fn now_iso() -> String {
    system_time_iso(SystemTime::now())
}

fn system_time_iso(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0);
    let (year, month, day, hour, minute, second) = unix_to_utc(seconds);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn unix_to_utc(seconds: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);
    let hour = u32::try_from(day_seconds / 3_600).unwrap_or(0);
    let minute = u32::try_from((day_seconds % 3_600) / 60).unwrap_or(0);
    let second = u32::try_from(day_seconds % 60).unwrap_or(0);
    let (year, month, day) = civil_from_days(days);
    (year, month, day, hour, minute, second)
}

fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
    let days = days_since_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }

    (
        i32::try_from(year).unwrap_or(i32::MAX),
        u32::try_from(month).unwrap_or(1),
        u32::try_from(day).unwrap_or(1),
    )
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::storage::JsonStorage;

    pub(crate) fn test_storage(label: &str) -> Result<JsonStorage, Box<dyn std::error::Error>> {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-w2-{label}-{}-{nanos}",
            std::process::id()
        ));
        Ok(JsonStorage::new(path))
    }

    pub(crate) fn cleanup(storage: &JsonStorage) -> Result<(), Box<dyn std::error::Error>> {
        if storage.root().exists() {
            std::fs::remove_dir_all(storage.root())?;
        }
        Ok(())
    }
}
