//! Cut-report schemas emitted by `splice cut`.

use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Batch-level cut report.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CutReport {
    #[serde(default)]
    pub success: Vec<ClipResult>,
    #[serde(default)]
    pub failed: Vec<ClipFailure>,
}

/// One successfully cut clip.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClipResult {
    pub clip_num: u32,
    pub title: String,
    pub from_id: u32,
    pub to_id: u32,
    pub start: f64,
    pub end: f64,
    pub duration: f64,
    pub file: String,
    pub text_preview: String,
}

/// One failed clip attempt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClipFailure {
    pub clip_num: u32,
    pub title: String,
    pub from_id: u32,
    pub to_id: u32,
    pub error: String,
    pub cause: String,
}

impl CutReport {
    /// Load `cut_report.json` from disk.
    pub fn from_path(path: &Path) -> Result<Self> {
        let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))
    }

    /// Write `cut_report.json` to disk.
    pub fn write_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).context("serialize cut report")?,
        )
        .with_context(|| format!("write {}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cut_report_serializes_without_verify() -> Result<()> {
        let report = CutReport {
            success: vec![ClipResult {
                clip_num: 1,
                title: "Title".to_string(),
                from_id: 1,
                to_id: 2,
                start: 0.0,
                end: 2.0,
                duration: 2.0,
                file: "clip_01.mp4".to_string(),
                text_preview: "Hello".to_string(),
            }],
            failed: vec![],
        };

        let json = serde_json::to_string(&report)?;

        assert!(json.contains("\"text_preview\":\"Hello\""));
        Ok(())
    }
}
