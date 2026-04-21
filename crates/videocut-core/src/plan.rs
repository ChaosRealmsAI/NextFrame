//! Plan schemas for sentence-id-driven clip selection.

use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Full clip-selection plan contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Plan {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<String>,
    #[serde(default)]
    pub total_sentences: usize,
    #[serde(default)]
    pub clips: Vec<PlanClip>,
    #[serde(default)]
    pub bridges: Vec<PlanBridge>,
    #[serde(default)]
    pub skipped: Vec<PlanSkipped>,
}

/// One clip request resolved by sentence id range.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanClip {
    pub id: u32,
    pub from: u32,
    pub to: u32,
    pub title: String,
}

/// One informational bridge span.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanBridge {
    pub id: u32,
    pub covers: [u32; 2],
    pub angle: String,
}

/// One informational skipped span.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanSkipped {
    pub covers: [u32; 2],
    pub reason: String,
}

impl Plan {
    /// Load a plan from JSON.
    pub fn from_path(path: &Path) -> Result<Self> {
        let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))
    }

    /// Write a plan to JSON.
    pub fn write_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).context("serialize plan")?,
        )
        .with_context(|| format!("write {}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_round_trip_preserves_optional_sections() -> Result<()> {
        let plan = Plan {
            episode: Some("E01".to_string()),
            total_sentences: 44,
            clips: vec![PlanClip {
                id: 1,
                from: 1,
                to: 12,
                title: "Opening".to_string(),
            }],
            bridges: vec![PlanBridge {
                id: 2,
                covers: [13, 18],
                angle: "Context".to_string(),
            }],
            skipped: vec![PlanSkipped {
                covers: [19, 44],
                reason: "Off-topic".to_string(),
            }],
        };

        let json = serde_json::to_string(&plan)?;
        let parsed: Plan = serde_json::from_str(&json)?;

        assert_eq!(parsed, plan);
        Ok(())
    }
}
