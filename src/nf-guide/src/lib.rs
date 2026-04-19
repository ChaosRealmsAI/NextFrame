//! Loads pipeline flow metadata and markdown content from the filesystem.

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct Flow {
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

pub fn default_flows_dir() -> PathBuf {
    // 1. Honor explicit env override (new name first, legacy name as fallback)
    if let Some(path) = env::var_os("NF_GUIDE_FLOWS") {
        return PathBuf::from(path);
    }
    if let Some(path) = env::var_os("NF_GUIDE_RECIPES") {
        // Legacy env var — still honored. Formerly known as recipes.
        return PathBuf::from(path);
    }

    // 2. Try CARGO_MANIFEST_DIR-relative (works when run via cargo or from the binary placed under target/)
    let manifest_relative = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("flows");
    if manifest_relative.is_dir() {
        return manifest_relative;
    }

    // 3. Walk up from the current executable to find src/nf-guide/flows (works when binary is shipped)
    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("src/nf-guide/flows");
            if candidate.is_dir() {
                return candidate;
            }
        }
    }

    // 4. Last resort: cwd-relative (legacy behavior)
    PathBuf::from("./src/nf-guide/flows")
}

pub fn discover_flows(flows_dir: impl AsRef<Path>) -> Result<Vec<(String, String)>, String> {
    let mut flows = Vec::new();
    let entries = fs::read_dir(flows_dir.as_ref()).map_err(|error| {
        format!("failed to read flows dir: {error}. Fix: set NF_GUIDE_FLOWS or run from the repo root")
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read flows dir entry: {error}"))?;
        let path = entry.path();
        if !path.is_dir() || !path.join("flow.json").is_file() {
            continue;
        }

        let flow = load_flow(flows_dir.as_ref(), &entry.file_name().to_string_lossy())?;
        flows.push((flow.id, flow.description));
    }

    flows.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(flows)
}

pub fn load_flow(flows_dir: impl AsRef<Path>, pipeline: &str) -> Result<Flow, String> {
    let path = flows_dir.as_ref().join(pipeline).join("flow.json");
    let json = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&json)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

pub fn get_step_content(
    flows_dir: impl AsRef<Path>,
    pipeline: &str,
    step: &str,
) -> Result<String, String> {
    let path = if step == "pitfalls" {
        flows_dir.as_ref().join(pipeline).join("pitfalls.md")
    } else {
        let flow = load_flow(flows_dir.as_ref(), pipeline)?;
        let entry = flow
            .steps
            .iter()
            .find(|entry| step_matches(entry, step))
            .ok_or_else(|| format!("unknown step \"{step}\" in flow \"{pipeline}\""))?;
        flows_dir.as_ref().join(pipeline).join(&entry.prompt)
    };

    fs::read_to_string(&path).map_err(|error| format!("failed to read {}: {error}", path.display()))
}

fn step_matches(entry: &Step, query: &str) -> bool {
    entry.id == query
        || prompt_stem(&entry.prompt) == query
        || entry.prompt == query
}

fn prompt_stem(prompt: &str) -> &str {
    prompt.strip_suffix(".md").unwrap_or(prompt)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]

    use super::*;
    use std::fs;
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_test_flows() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = env::temp_dir().join(format!("nf-guide-test-{}-{unique}", process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("alpha")).unwrap();
        fs::write(
            dir.join("alpha/flow.json"),
            r#"{"id":"alpha","name":"Alpha","description":"first","steps":[{"id":"one","title":"Step One","prompt":"01-one.md"}]}"#,
        )
        .unwrap();
        fs::write(dir.join("alpha/guide.md"), "# Alpha guide").unwrap();
        fs::write(dir.join("alpha/01-one.md"), "Step One body").unwrap();
        fs::write(dir.join("alpha/pitfalls.md"), "Known pitfalls").unwrap();

        fs::create_dir_all(dir.join("beta")).unwrap();
        fs::write(
            dir.join("beta/flow.json"),
            r#"{"id":"beta","name":"Beta","description":"second","steps":[]}"#,
        )
        .unwrap();
        // Skip a directory without flow.json — must be ignored
        fs::create_dir_all(dir.join("gamma_no_flow")).unwrap();
        dir
    }

    #[test]
    fn discover_returns_only_dirs_with_flow_json() {
        let dir = make_test_flows();
        let flows = discover_flows(&dir).unwrap();
        assert_eq!(flows.len(), 2);
        let ids: Vec<&str> = flows.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["alpha", "beta"]);
    }

    #[test]
    fn discover_sorts_alphabetically() {
        let dir = make_test_flows();
        let flows = discover_flows(&dir).unwrap();
        assert_eq!(flows[0].0, "alpha");
        assert_eq!(flows[1].0, "beta");
    }

    #[test]
    fn load_flow_parses_steps() {
        let dir = make_test_flows();
        let flow = load_flow(&dir, "alpha").unwrap();
        assert_eq!(flow.id, "alpha");
        assert_eq!(flow.steps.len(), 1);
        assert_eq!(flow.steps[0].id, "one");
        assert_eq!(flow.steps[0].prompt, "01-one.md");
    }

    #[test]
    fn load_flow_missing_returns_error() {
        let dir = make_test_flows();
        let result = load_flow(&dir, "no-such-pipeline");
        assert!(result.is_err());
    }

    #[test]
    fn get_step_content_known_step() {
        let dir = make_test_flows();
        let body = get_step_content(&dir, "alpha", "one").unwrap();
        assert_eq!(body, "Step One body");
    }

    #[test]
    fn get_step_content_pitfalls_special_case() {
        let dir = make_test_flows();
        let body = get_step_content(&dir, "alpha", "pitfalls").unwrap();
        assert_eq!(body, "Known pitfalls");
    }

    #[test]
    fn get_step_content_unknown_step_returns_error() {
        let dir = make_test_flows();
        let result = get_step_content(&dir, "alpha", "no-such-step");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown step"));
    }

    #[test]
    fn get_step_content_accepts_prompt_stem_alias() {
        let dir = make_test_flows();
        let body = get_step_content(&dir, "alpha", "01-one").unwrap();
        assert_eq!(body, "Step One body");
    }

    #[test]
    fn default_flows_dir_honors_env_override() {
        // SAFETY: tests run sequentially within this module — set+unset is acceptable
        unsafe {
            env::set_var("NF_GUIDE_FLOWS", "/tmp/custom-flows");
        }
        let dir = default_flows_dir();
        assert_eq!(dir, PathBuf::from("/tmp/custom-flows"));
        unsafe {
            env::remove_var("NF_GUIDE_FLOWS");
        }
    }
}
