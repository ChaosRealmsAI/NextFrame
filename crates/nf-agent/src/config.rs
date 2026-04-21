use std::{collections::BTreeMap, fs, path::Path};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub provider: ProviderConfig,
    pub system_prompt: SystemPrompt,
    #[serde(default = "default_final_check_enabled")]
    pub final_check_enabled: bool,
    #[serde(default = "default_max_tool_result_chars")]
    pub max_tool_result_chars: usize,
    #[serde(default = "default_max_history_chars")]
    pub max_history_chars: usize,
    #[serde(default)]
    pub pricing: PricingTable,
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderConfig {
    pub base_url: String,
    pub api_key_env: String,
    pub model: Model,
}

pub type Model = String;
pub type PricingTable = BTreeMap<String, [f64; 2]>;

#[derive(Debug, Clone, Deserialize)]
pub struct SystemPrompt {
    pub text: String,
}

fn default_final_check_enabled() -> bool {
    true
}

fn default_max_tool_result_chars() -> usize {
    4_000
}

fn default_max_history_chars() -> usize {
    200_000
}

impl Config {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let source = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        toml::from_str(&source)
            .with_context(|| format!("failed to parse config {}", path.display()))
    }

    pub fn model(&self) -> &str {
        &self.provider.model
    }

    pub fn system_prompt(&self) -> &str {
        &self.system_prompt.text
    }

    pub fn estimate_cost_usd(&self, usage: &crate::provider::Usage) -> f64 {
        let Some([prompt_per_million, completion_per_million]) =
            self.pricing.get(self.model()).copied()
        else {
            return 0.0;
        };
        ((usage.prompt_tokens as f64 / 1_000_000.0) * prompt_per_million)
            + ((usage.completion_tokens as f64 / 1_000_000.0) * completion_per_million)
    }
}
