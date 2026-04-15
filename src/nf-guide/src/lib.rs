//! Loads pipeline recipe metadata and markdown content from the filesystem.

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct Recipe {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub steps: Vec<Step>,
}

#[derive(Debug, Deserialize)]
pub struct Step {
    pub id: String,
    pub title: String,
    pub prompt: String,
}

pub fn default_recipes_dir() -> PathBuf {
    if let Some(path) = env::var_os("NF_GUIDE_RECIPES") {
        PathBuf::from(path)
    } else {
        PathBuf::from("./src/nf-guide/recipes")
    }
}

pub fn discover_recipes(recipes_dir: impl AsRef<Path>) -> Result<Vec<(String, String)>, String> {
    let mut recipes = Vec::new();
    let entries = fs::read_dir(recipes_dir.as_ref()).map_err(|error| {
        format!("failed to read recipes dir: {error}. Fix: set NF_GUIDE_RECIPES or run from the repo root")
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read recipes dir entry: {error}"))?;
        let path = entry.path();
        if !path.is_dir() || !path.join("recipe.json").is_file() {
            continue;
        }

        let recipe = load_recipe(recipes_dir.as_ref(), &entry.file_name().to_string_lossy())?;
        recipes.push((recipe.id, recipe.description));
    }

    recipes.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(recipes)
}

pub fn load_recipe(recipes_dir: impl AsRef<Path>, pipeline: &str) -> Result<Recipe, String> {
    let path = recipes_dir.as_ref().join(pipeline).join("recipe.json");
    let json = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&json)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

pub fn get_step_content(
    recipes_dir: impl AsRef<Path>,
    pipeline: &str,
    step: &str,
) -> Result<String, String> {
    let path = if step == "pitfalls" {
        recipes_dir.as_ref().join(pipeline).join("pitfalls.md")
    } else {
        let recipe = load_recipe(recipes_dir.as_ref(), pipeline)?;
        let entry = recipe
            .steps
            .iter()
            .find(|entry| entry.id == step)
            .ok_or_else(|| format!("unknown step \"{step}\" in pipeline \"{pipeline}\""))?;
        recipes_dir.as_ref().join(pipeline).join(&entry.prompt)
    };

    fs::read_to_string(&path).map_err(|error| format!("failed to read {}: {error}", path.display()))
}
