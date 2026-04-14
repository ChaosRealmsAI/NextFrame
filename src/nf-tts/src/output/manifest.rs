use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Manifest {
    pub total: usize,
    pub synthesized: usize,
    pub cached: usize,
    pub errors: usize,
    pub entries: Vec<ManifestEntry>,
    pub failures: Vec<ManifestFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestEntry {
    pub id: usize,
    pub text: String,
    pub voice: String,
    pub backend: String,
    pub file: String,
    pub duration_ms: Option<u64>,
    pub cached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestFailure {
    pub id: usize,
    pub text: String,
    pub voice: String,
    pub backend: String,
    pub error: String,
}

impl Manifest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_entry(&mut self, entry: ManifestEntry, cached: bool) {
        self.total += 1;
        if cached {
            self.cached += 1;
        } else {
            self.synthesized += 1;
        }
        self.entries.push(entry);
    }

    pub fn add_failure(&mut self, failure: ManifestFailure) {
        self.total += 1;
        self.errors += 1;
        self.failures.push(failure);
    }

    pub fn write_to(&self, dir: &Path) -> Result<String> {
        let path = dir.join("manifest.json");
        let content =
            serde_json::to_string_pretty(self).context("failed to serialize manifest JSON")?;
        std::fs::write(&path, content)
            .with_context(|| format!("failed to write {}", path.display()))?;
        Ok(path.to_string_lossy().to_string())
    }
}
