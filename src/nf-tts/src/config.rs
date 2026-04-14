//! configuration loading
use crate::backend::DEFAULT_BACKEND;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VoxConfig {
    #[serde(default)]
    pub default_voice: Option<String>,
    #[serde(default)]
    pub default_dir: Option<String>,
    #[serde(default)]
    pub default_backend: Option<String>,
    #[serde(default)]
    pub aliases: HashMap<String, String>,
}

impl VoxConfig {
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("nf-tts")
            .join("config.toml")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| toml::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    /// Resolve a voice name: check aliases first, then return as-is.
    pub fn resolve_voice(&self, voice: &str) -> String {
        self.aliases
            .get(voice)
            .cloned()
            .unwrap_or_else(|| voice.to_string())
    }

    pub fn configured_voice(&self) -> Option<String> {
        self.default_voice
            .as_deref()
            .map(|voice| self.resolve_voice(voice))
    }

    pub fn resolve_backend(&self, backend: Option<String>) -> String {
        backend
            .or_else(|| self.default_backend.clone())
            .unwrap_or_else(|| DEFAULT_BACKEND.to_string())
    }
}
