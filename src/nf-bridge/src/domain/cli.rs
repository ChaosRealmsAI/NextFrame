//! Shared nextframe CLI gateway for pipeline IPC handlers.
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::project::projects_root;
use crate::util::validation::{require_string, require_value};

pub(crate) fn run_nextframe_cli(args: &[&str]) -> Result<Value, String> {
    let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../nf-cli/bin/nextframe.js");
    if !cli_path.is_file() {
        return Err(format!(
            "failed to find nextframe CLI at '{}'. Fix: ensure src/nf-cli/bin/nextframe.js exists.",
            cli_path.display()
        ));
    }

    let output = Command::new("node")
        .arg(&cli_path)
        .args(args)
        .arg("--json")
        .output()
        .map_err(|e| format!("failed to run nextframe CLI: {e}. Fix: ensure node is installed and available on PATH."))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        return Err(cli_error_message(
            &stdout,
            &String::from_utf8_lossy(&output.stderr),
        ));
    }

    serde_json::from_str::<Value>(stdout.trim()).map_err(|e| {
        format!("failed to parse nextframe CLI JSON output: {e}. Fix: ensure the CLI command returns valid JSON.")
    })
}

pub(crate) fn handle_script_get(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    let segment_arg = optional_u64_flag(params, "segment", "segment")?;
    let mut args = vec!["script-get", project_name.as_str(), episode_name.as_str()];
    if let Some(ref segment_arg) = segment_arg {
        args.push(segment_arg.as_str());
    }
    run_nextframe_cli(&args)
}

pub(crate) fn handle_script_set(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let narration = require_string(params, "narration")?;
    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    let segment_arg = required_u64_flag(params, "segment", "segment")?;
    let narration_arg = format!("--narration={narration}");
    let visual_arg = optional_string_flag(params, "visual", "visual")?;
    let role_arg = optional_string_flag(params, "role", "role")?;
    let logic_arg = optional_string_flag(params, "logic", "logic")?;
    let mut args = vec![
        "script-set",
        project_name.as_str(),
        episode_name.as_str(),
        segment_arg.as_str(),
        narration_arg.as_str(),
    ];
    if let Some(ref visual_arg) = visual_arg {
        args.push(visual_arg.as_str());
    }
    if let Some(ref role_arg) = role_arg {
        args.push(role_arg.as_str());
    }
    if let Some(ref logic_arg) = logic_arg {
        args.push(logic_arg.as_str());
    }
    run_nextframe_cli(&args)
}

pub(crate) fn handle_audio_get(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    let segment_arg = optional_u64_flag(params, "segment", "segment")?;
    let mut args = vec!["audio-get", project_name.as_str(), episode_name.as_str()];
    if let Some(ref segment_arg) = segment_arg {
        args.push(segment_arg.as_str());
    }
    run_nextframe_cli(&args)
}

pub(crate) fn handle_source_list(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let library_arg = format!(
        "--library={}",
        resolve_episode_path(project, episode)
            .join("sources")
            .display()
    );
    run_nextframe_cli(&["source-list", library_arg.as_str()])
}

pub(crate) fn handle_source_download(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let url = require_string(params, "url")?;
    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    let url_arg = format!("--url={url}");
    run_nextframe_cli(&[
        "source-download",
        project_name.as_str(),
        episode_name.as_str(),
        url_arg.as_str(),
    ])
}

pub(crate) fn handle_source_transcribe(params: &Value) -> Result<Value, String> {
    let project = require_string(params, "project")?;
    let episode = require_string(params, "episode")?;
    let source = require_string(params, "source")?;
    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    let source_arg = format!("--source={source}");
    run_nextframe_cli(&[
        "source-transcribe",
        project_name.as_str(),
        episode_name.as_str(),
        source_arg.as_str(),
    ])
}

pub(crate) fn normalize_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(value)
        .to_string()
}

pub(crate) fn resolve_project_episode_names(project: &str, episode: &str) -> (String, String) {
    (normalize_name(project), normalize_name(episode))
}

fn resolve_episode_path(project: &str, episode: &str) -> PathBuf {
    if looks_like_path(episode) {
        return PathBuf::from(episode);
    }
    if looks_like_path(project) {
        return PathBuf::from(project).join(normalize_name(episode));
    }

    let (project_name, episode_name) = resolve_project_episode_names(project, episode);
    projects_root().join(project_name).join(episode_name)
}

fn looks_like_path(value: &str) -> bool {
    value.contains(std::path::MAIN_SEPARATOR) || value.contains('/') || value.contains('\\')
}

fn required_u64_flag(params: &Value, key: &str, flag: &str) -> Result<String, String> {
    Ok(format!("--{flag}={}", require_u64(params, key)?))
}

fn optional_u64_flag(params: &Value, key: &str, flag: &str) -> Result<Option<String>, String> {
    optional_u64(params, key).map(|value| value.map(|value| format!("--{flag}={value}")))
}

fn optional_string_flag(params: &Value, key: &str, flag: &str) -> Result<Option<String>, String> {
    let Some(value) = params.get(key) else {
        return Ok(None);
    };
    let value = value.as_str().ok_or_else(|| {
        format!(
            "failed to read params.{key}: params.{key} must be a string. Fix: provide params.{key} as a JSON string."
        )
    })?;
    Ok(Some(format!("--{flag}={value}")))
}

fn require_u64(params: &Value, key: &str) -> Result<u64, String> {
    require_value(params, key)?.as_u64().ok_or_else(|| {
        format!(
            "failed to read params.{key}: params.{key} must be an unsigned integer. Fix: provide params.{key} as a whole number."
        )
    })
}

fn optional_u64(params: &Value, key: &str) -> Result<Option<u64>, String> {
    match params.get(key) {
        Some(value) => value.as_u64().map(Some).ok_or_else(|| {
            format!(
                "failed to read params.{key}: params.{key} must be an unsigned integer. Fix: provide params.{key} as a whole number."
            )
        }),
        None => Ok(None),
    }
}

fn cli_error_message(stdout: &str, stderr: &str) -> String {
    let stderr = stderr.trim();
    if !stderr.is_empty() {
        return stderr.to_string();
    }

    let stdout = stdout.trim();
    if let Ok(value) = serde_json::from_str::<Value>(stdout) {
        if let Some(error) = value.get("error") {
            if let Some(message) = error.get("message").and_then(Value::as_str) {
                let fix = error.get("fix").and_then(Value::as_str).unwrap_or("");
                return if fix.is_empty() {
                    message.to_string()
                } else {
                    format!("{message}. Fix: {fix}")
                };
            }
        }
    }

    "failed to run nextframe CLI. Fix: inspect the command output and retry.".to_string()
}
