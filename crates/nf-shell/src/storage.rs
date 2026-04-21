use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use directories::BaseDirs;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::errors::NfError;

static SLUG_RE: Lazy<Result<Regex, regex::Error>> =
    Lazy::new(|| Regex::new(r"^[a-z][a-z0-9.-]{0,63}$"));

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
    fn load_registry(&self) -> Result<Registry, NfError>;
    fn save_registry(&self, registry: &Registry) -> Result<(), NfError>;
    fn load_project(&self, slug: &str) -> Result<Project, NfError>;
    fn save_project(&self, project: &Project) -> Result<(), NfError>;
    fn load_episode(&self, project_slug: &str, episode_slug: &str) -> Result<Episode, NfError>;
    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), NfError>;
}

#[derive(Debug, Clone)]
pub struct JsonStorage {
    root: PathBuf,
}

impl JsonStorage {
    pub fn default_root() -> Result<PathBuf, NfError> {
        BaseDirs::new()
            .map(|dirs| dirs.home_dir().join(".nextframe"))
            .ok_or_else(|| NfError::StorageFailed("home directory is unavailable".to_string()))
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

    fn project_path(&self, slug: &str) -> Result<PathBuf, NfError> {
        validate_slug(slug)?;
        Ok(self.root.join(slug).join("project.json"))
    }

    fn episode_path(&self, project_slug: &str, episode_slug: &str) -> Result<PathBuf, NfError> {
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
    fn load_registry(&self) -> Result<Registry, NfError> {
        read_json(&self.registry_path())
    }

    fn save_registry(&self, registry: &Registry) -> Result<(), NfError> {
        atomic_write(&self.registry_path(), registry)
    }

    fn load_project(&self, slug: &str) -> Result<Project, NfError> {
        read_json(&self.project_path(slug)?)
    }

    fn save_project(&self, project: &Project) -> Result<(), NfError> {
        validate_slug(&project.slug)?;
        atomic_write(&self.project_path(&project.slug)?, project)
    }

    fn load_episode(&self, project_slug: &str, episode_slug: &str) -> Result<Episode, NfError> {
        read_json(&self.episode_path(project_slug, episode_slug)?)
    }

    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), NfError> {
        validate_slug(&episode.slug)?;
        atomic_write(&self.episode_path(project_slug, &episode.slug)?, episode)
    }
}

pub fn validate_slug(slug: &str) -> Result<(), NfError> {
    match &*SLUG_RE {
        Ok(regex) if regex.is_match(slug) => return Ok(()),
        Ok(_) => {}
        Err(err) => {
            return Err(NfError::ValidationFailed(format!(
                "built-in slug regex failed to compile: {err}"
            )));
        }
    }

    Err(NfError::SlugInvalid {
        slug: slug.to_string(),
        hint:
            "use lowercase letters, numbers, dots, and hyphens; start with a letter; max 64 chars"
                .to_string(),
    })
}

pub fn atomic_write<T: Serialize>(path: &Path, value: &T) -> Result<(), NfError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }

    let tmp_path = path.with_extension("tmp");
    let result = (|| -> Result<(), NfError> {
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

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, NfError> {
    let raw = fs::read_to_string(path).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    serde_json::from_str(&raw).map_err(|err| NfError::StorageFailed(err.to_string()))
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{validate_slug, Episode, JsonStorage, Project, Registry, RegistryProject, Storage};

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
    fn slug_validation_rejects_bad_values() {
        assert!(validate_slug("next-frame").is_ok());
        assert!(validate_slug("demo-v0.5").is_ok());
        assert!(validate_slug("NextFrame").is_err());
        assert!(validate_slug("-bad").is_err());
        assert!(validate_slug("bad_slug").is_err());
    }

    fn test_storage(label: &str) -> Result<JsonStorage, Box<dyn std::error::Error>> {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
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
