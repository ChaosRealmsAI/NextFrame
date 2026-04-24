use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use directories::BaseDirs;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

static SLUG_RE: Lazy<Result<Regex, regex::Error>> =
    Lazy::new(|| Regex::new(r"^[a-z][a-z0-9.-]{0,63}$"));

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("storage failed: {0}")]
    StorageFailed(String),
    #[error("invalid slug '{slug}' · hint: {hint}")]
    SlugInvalid { slug: String, hint: String },
    #[error("{0}")]
    ValidationFailed(String),
}

impl From<std::io::Error> for ProjectError {
    fn from(value: std::io::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}

impl From<serde_json::Error> for ProjectError {
    fn from(value: serde_json::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Registry {
    pub projects: Vec<RegistryProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegistryProject {
    pub slug: String,
    pub name: String,
    pub created: String,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub slug: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub created: String,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Episode {
    pub slug: String,
    pub name: String,
    pub duration: f64,
    #[serde(default)]
    pub anchors: BTreeMap<String, f64>,
    #[serde(default)]
    pub clips: Vec<Value>,
    #[serde(default)]
    pub log: Vec<Value>,
}

pub trait Storage {
    fn load_registry(&self) -> Result<Registry, ProjectError>;
    fn save_registry(&self, registry: &Registry) -> Result<(), ProjectError>;
    fn load_project(&self, slug: &str) -> Result<Project, ProjectError>;
    fn save_project(&self, project: &Project) -> Result<(), ProjectError>;
    fn load_episode(
        &self,
        project_slug: &str,
        episode_slug: &str,
    ) -> Result<Episode, ProjectError>;
    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), ProjectError>;
}

#[derive(Debug, Clone)]
pub struct JsonStorage {
    root: PathBuf,
}

impl JsonStorage {
    pub fn default_root() -> Result<PathBuf, ProjectError> {
        if let Some(root) = std::env::var_os("NEXTFRAME_HOME") {
            return Ok(PathBuf::from(root));
        }

        BaseDirs::new()
            .map(|dirs| dirs.home_dir().join(".nextframe"))
            .ok_or_else(|| ProjectError::StorageFailed("home directory is unavailable".to_string()))
    }

    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn registry_path(&self) -> PathBuf {
        self.root.join("registry.json")
    }

    fn project_path(&self, slug: &str) -> Result<PathBuf, ProjectError> {
        validate_slug(slug)?;
        Ok(self.root.join(slug).join("project.json"))
    }

    fn episode_path(&self, project_slug: &str, episode_slug: &str) -> Result<PathBuf, ProjectError> {
        validate_slug(project_slug)?;
        validate_slug(episode_slug)?;
        Ok(self
            .root
            .join(project_slug)
            .join("episodes")
            .join(format!("{episode_slug}.json")))
    }
}

impl Storage for JsonStorage {
    fn load_registry(&self) -> Result<Registry, ProjectError> {
        read_json(&self.registry_path())
    }

    fn save_registry(&self, registry: &Registry) -> Result<(), ProjectError> {
        atomic_write(&self.registry_path(), registry)
    }

    fn load_project(&self, slug: &str) -> Result<Project, ProjectError> {
        read_json(&self.project_path(slug)?)
    }

    fn save_project(&self, project: &Project) -> Result<(), ProjectError> {
        validate_slug(&project.slug)?;
        atomic_write(&self.project_path(&project.slug)?, project)
    }

    fn load_episode(&self, project_slug: &str, episode_slug: &str) -> Result<Episode, ProjectError> {
        read_json(&self.episode_path(project_slug, episode_slug)?)
    }

    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), ProjectError> {
        validate_slug(&episode.slug)?;
        atomic_write(&self.episode_path(project_slug, &episode.slug)?, episode)
    }
}

pub fn validate_slug(slug: &str) -> Result<(), ProjectError> {
    match &*SLUG_RE {
        Ok(regex) if regex.is_match(slug) => return Ok(()),
        Ok(_) => {}
        Err(err) => {
            return Err(ProjectError::ValidationFailed(format!(
                "built-in slug regex failed to compile: {err}"
            )));
        }
    }

    Err(ProjectError::SlugInvalid {
        slug: slug.to_string(),
        hint:
            "use lowercase letters, numbers, dots, and hyphens; start with a letter; max 64 chars"
                .to_string(),
    })
}

pub fn atomic_write<T: Serialize>(path: &Path, value: &T) -> Result<(), ProjectError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| ProjectError::StorageFailed(err.to_string()))?;
    }

    let tmp_path = path.with_extension("tmp");
    let result = (|| -> Result<(), ProjectError> {
        let json = serde_json::to_string_pretty(value)?;
        let mut tmp = fs::File::create(&tmp_path)?;
        tmp.write_all(json.as_bytes())?;
        tmp.write_all(b"\n")?;
        tmp.sync_all()?;
        fs::rename(&tmp_path, path)?;
        Ok(())
    })();

    if result.is_err() {
        let _cleanup_result = fs::remove_file(&tmp_path);
    }

    result
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, ProjectError> {
    let raw =
        fs::read_to_string(path).map_err(|err| ProjectError::StorageFailed(err.to_string()))?;
    serde_json::from_str(&raw).map_err(|err| ProjectError::StorageFailed(err.to_string()))
}

#[derive(Debug, Clone)]
pub struct SourceCompileResult {
    pub source: Value,
    pub warnings: Vec<String>,
}

pub fn compile_episode_source(
    project_slug: &str,
    episode: &Episode,
) -> Result<SourceCompileResult, ProjectError> {
    let mut warnings = Vec::new();
    let duration_ms = seconds_to_ms(episode.duration, "episode.duration")?;
    let mut scene_clips = Vec::new();
    let mut ignored_tracks = BTreeMap::<String, usize>::new();

    for clip in &episode.clips {
        let Some(object) = clip.as_object() else {
            warnings.push("ignored non-object clip".to_string());
            continue;
        };
        let track = object
            .get("track")
            .and_then(Value::as_str)
            .or_else(|| object.get("kind").and_then(Value::as_str))
            .unwrap_or("scene");
        if track != "scene" {
            *ignored_tracks.entry(track.to_string()).or_insert(0) += 1;
            continue;
        }

        let id = object
            .get("slug")
            .or_else(|| object.get("id"))
            .or_else(|| object.get("clip"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| ProjectError::ValidationFailed("scene clip missing slug".to_string()))?;
        let label = object
            .get("label")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(id);
        let start_ms = resolve_time_ms(object.get("start"), &episode.anchors, "start")?;
        let end_ms = resolve_time_ms(object.get("end"), &episode.anchors, "end")?;
        if end_ms <= start_ms {
            return Err(ProjectError::ValidationFailed(format!(
                "clip '{id}' end must be greater than start"
            )));
        }
        if end_ms > duration_ms {
            warnings.push(format!(
                "clip '{id}' ends after episode duration and will still be exported"
            ));
        }

        scene_clips.push(json!({
            "id": id,
            "begin": start_ms,
            "end": end_ms,
            "params": {
                "layout": "hero",
                "title": label,
                "subtitle": id,
                "accent_color": "#bc8cff"
            }
        }));
    }

    for (track, count) in ignored_tracks {
        warnings.push(format!(
            "ignored {count} clip(s) on unsupported export track '{track}'"
        ));
    }

    if scene_clips.is_empty() {
        return Err(ProjectError::ValidationFailed(
            "episode has no scene clips to export".to_string(),
        ));
    }

    let source = json!({
        "meta": {
            "name": episode.name,
            "project": project_slug,
            "episode": episode.slug,
            "version": "v0.5",
            "export": {
                "resolution": "1080p"
            }
        },
        "viewport": {
            "ratio": "16:9",
            "w": 1920,
            "h": 1080
        },
        "duration": duration_ms,
        "anchors": {},
        "tracks": [
            {
                "id": "scene-main",
                "kind": "scene",
                "clips": scene_clips
            }
        ]
    });

    Ok(SourceCompileResult { source, warnings })
}

fn resolve_time_ms(
    value: Option<&Value>,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    match value {
        Some(Value::Number(number)) => {
            let seconds = number.as_f64().ok_or_else(|| {
                ProjectError::ValidationFailed(format!("{field} must be a finite number"))
            })?;
            seconds_to_ms(seconds, field)
        }
        Some(Value::String(raw)) => resolve_time_expr_ms(raw, anchors, field),
        _ => Err(ProjectError::ValidationFailed(format!(
            "{field} must be a number, anchor, or simple anchor +/- seconds expression"
        ))),
    }
}

fn resolve_time_expr_ms(
    raw: &str,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ProjectError::ValidationFailed(format!("{field} is empty")));
    }
    if let Ok(seconds) = trimmed.parse::<f64>() {
        return seconds_to_ms(seconds, field);
    }
    if let Some(seconds) = anchors.get(trimmed).copied() {
        return seconds_to_ms(seconds, field);
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 3 && (parts[1] == "+" || parts[1] == "-") {
        let base = anchors.get(parts[0]).copied().ok_or_else(|| {
            ProjectError::ValidationFailed(format!("unknown anchor '{}' in {field}", parts[0]))
        })?;
        let delta = parts[2].parse::<f64>().map_err(|err| {
            ProjectError::ValidationFailed(format!("invalid seconds offset in {field}: {err}"))
        })?;
        let seconds = if parts[1] == "+" {
            base + delta
        } else {
            base - delta
        };
        return seconds_to_ms(seconds, field);
    }

    Err(ProjectError::ValidationFailed(format!(
        "unsupported time expression for {field}: '{trimmed}'"
    )))
}

fn seconds_to_ms(seconds: f64, field: &str) -> Result<u64, ProjectError> {
    if !seconds.is_finite() || seconds < 0.0 {
        return Err(ProjectError::ValidationFailed(format!(
            "{field} must be a non-negative finite number"
        )));
    }
    let ms = (seconds * 1000.0).round();
    if ms > u64::MAX as f64 {
        return Err(ProjectError::ValidationFailed(format!(
            "{field} is too large"
        )));
    }
    Ok(ms as u64)
}

#[cfg(test)]
mod tests {
    use super::{Episode, JsonStorage, Project, Registry, RegistryProject, Storage};

    #[test]
    fn registry_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("registry")?;
        let registry = Registry {
            projects: vec![RegistryProject {
                slug: "next-frame".to_string(),
                name: "NextFrame".to_string(),
                created: "2026-04-21T00:00:00Z".to_string(),
                last_modified: "2026-04-21T00:00:00Z".to_string(),
            }],
        };

        storage.save_registry(&registry)?;
        let loaded = storage.load_registry()?;

        assert_eq!(loaded, registry);
        cleanup(storage.root())?;
        Ok(())
    }

    #[test]
    fn project_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("project")?;
        let project = Project {
            slug: "demo-video".to_string(),
            name: "Demo Video".to_string(),
            description: Some("Demo".to_string()),
            tags: Some(vec!["demo".to_string()]),
            created: "2026-04-21T00:00:00Z".to_string(),
            modified: "2026-04-21T00:00:00Z".to_string(),
        };
        let episode = Episode {
            slug: "ep-01".to_string(),
            name: "Episode 01".to_string(),
            duration: 60.0,
            anchors: Default::default(),
            clips: Vec::new(),
            log: Vec::new(),
        };

        storage.save_project(&project)?;
        storage.save_episode(&project.slug, &episode)?;

        assert_eq!(storage.load_project(&project.slug)?, project);
        assert_eq!(storage.load_episode(&project.slug, &episode.slug)?, episode);
        cleanup(storage.root())?;
        Ok(())
    }

    #[test]
    fn compiles_scene_clips_to_source_json() -> Result<(), Box<dyn std::error::Error>> {
        let episode = Episode {
            slug: "ep-01".to_string(),
            name: "Episode 01".to_string(),
            duration: 5.0,
            anchors: Default::default(),
            clips: vec![serde_json::json!({
                "slug": "intro",
                "label": "Hello NextFrame",
                "track": "scene",
                "start": "0",
                "end": "5"
            })],
            log: Vec::new(),
        };

        let compiled = super::compile_episode_source("demo", &episode)?;

        assert_eq!(compiled.source["duration"], 5000);
        assert_eq!(
            compiled.source["tracks"][0]["clips"][0]["params"]["title"],
            "Hello NextFrame"
        );
        Ok(())
    }

    fn test_storage(label: &str) -> Result<JsonStorage, Box<dyn std::error::Error>> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("nextframe-{label}-{}-{nanos}", std::process::id()));
        Ok(JsonStorage::new(path))
    }

    fn cleanup(path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
        if path.exists() {
            std::fs::remove_dir_all(path)?;
        }
        Ok(())
    }
}
