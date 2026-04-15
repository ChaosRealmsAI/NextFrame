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
    // 1. Honor explicit env override
    if let Some(path) = env::var_os("NF_GUIDE_RECIPES") {
        return PathBuf::from(path);
    }

    // 2. Try CARGO_MANIFEST_DIR-relative (works when run via cargo or from the binary placed under target/)
    let manifest_relative = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("recipes");
    if manifest_relative.is_dir() {
        return manifest_relative;
    }

    // 3. Walk up from the current executable to find src/nf-guide/recipes (works when binary is shipped)
    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("src/nf-guide/recipes");
            if candidate.is_dir() {
                return candidate;
            }
        }
    }

    // 4. Last resort: cwd-relative (legacy behavior)
    PathBuf::from("./src/nf-guide/recipes")
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

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]

    use super::*;
    use std::fs;
    use std::process;

    fn make_test_recipes() -> PathBuf {
        let dir = env::temp_dir().join(format!("nf-guide-test-{}", process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("alpha")).unwrap();
        fs::write(
            dir.join("alpha/recipe.json"),
            r#"{"id":"alpha","name":"Alpha","description":"first","steps":[{"id":"one","title":"Step One","prompt":"01-one.md"}]}"#,
        )
        .unwrap();
        fs::write(dir.join("alpha/guide.md"), "# Alpha guide").unwrap();
        fs::write(dir.join("alpha/01-one.md"), "Step One body").unwrap();
        fs::write(dir.join("alpha/pitfalls.md"), "Known pitfalls").unwrap();

        fs::create_dir_all(dir.join("beta")).unwrap();
        fs::write(
            dir.join("beta/recipe.json"),
            r#"{"id":"beta","name":"Beta","description":"second","steps":[]}"#,
        )
        .unwrap();
        // Skip a directory without recipe.json — must be ignored
        fs::create_dir_all(dir.join("gamma_no_recipe")).unwrap();
        dir
    }

    #[test]
    fn discover_returns_only_dirs_with_recipe_json() {
        let dir = make_test_recipes();
        let recipes = discover_recipes(&dir).unwrap();
        assert_eq!(recipes.len(), 2);
        let ids: Vec<&str> = recipes.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["alpha", "beta"]);
    }

    #[test]
    fn discover_sorts_alphabetically() {
        let dir = make_test_recipes();
        let recipes = discover_recipes(&dir).unwrap();
        assert_eq!(recipes[0].0, "alpha");
        assert_eq!(recipes[1].0, "beta");
    }

    #[test]
    fn load_recipe_parses_steps() {
        let dir = make_test_recipes();
        let recipe = load_recipe(&dir, "alpha").unwrap();
        assert_eq!(recipe.id, "alpha");
        assert_eq!(recipe.steps.len(), 1);
        assert_eq!(recipe.steps[0].id, "one");
        assert_eq!(recipe.steps[0].prompt, "01-one.md");
    }

    #[test]
    fn load_recipe_missing_returns_error() {
        let dir = make_test_recipes();
        let result = load_recipe(&dir, "no-such-pipeline");
        assert!(result.is_err());
    }

    #[test]
    fn get_step_content_known_step() {
        let dir = make_test_recipes();
        let body = get_step_content(&dir, "alpha", "one").unwrap();
        assert_eq!(body, "Step One body");
    }

    #[test]
    fn get_step_content_pitfalls_special_case() {
        let dir = make_test_recipes();
        let body = get_step_content(&dir, "alpha", "pitfalls").unwrap();
        assert_eq!(body, "Known pitfalls");
    }

    #[test]
    fn get_step_content_unknown_step_returns_error() {
        let dir = make_test_recipes();
        let result = get_step_content(&dir, "alpha", "no-such-step");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown step"));
    }

    #[test]
    fn default_recipes_dir_honors_env_override() {
        // SAFETY: tests run sequentially within this module — set+unset is acceptable
        unsafe { // SAFETY: tests run sequentially within this module — set+unset is acceptable
            env::set_var("NF_GUIDE_RECIPES", "/tmp/custom-recipes");
        }
        let dir = default_recipes_dir();
        assert_eq!(dir, PathBuf::from("/tmp/custom-recipes"));
        unsafe { // SAFETY: this test clears the env override it just installed, still within the same serialized test scope.
            env::remove_var("NF_GUIDE_RECIPES");
        }
    }
}
