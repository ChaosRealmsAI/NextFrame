//! `nf open <source.json>` · spawn the NextFrame desktop shell (nf-shell)
//! attached to the given source. Replaces the removed `build` subcommand —
//! ADR-060: desktop shell is the sole preview surface, no HTML output.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::CliError;
use crate::io_json;

pub fn run(source: &Path) -> Result<(), CliError> {
    if !source.is_file() {
        return Err(CliError::UserInput {
            code: "E_SOURCE_MISSING",
            message: format!("source file not found: {}", source.display()),
            hint: Some("Provide a path to an existing timeline source JSON.".into()),
        });
    }

    let shell = resolve_nf_shell().ok_or_else(|| CliError::UserInput {
        code: "E_SHELL_NOT_FOUND",
        message: "nf-shell binary not found".into(),
        hint: Some(
            "Set NF_SHELL_PATH env var, or `cargo build --release -p nf-shell` so the sibling binary exists.".into(),
        ),
    })?;

    let source_abs = source
        .canonicalize()
        .map_err(|e| CliError::Internal {
            code: "E_CANON",
            message: format!("canonicalize source: {e}"),
            hint: None,
        })?;

    // Spawn detached — the shell outlives `nf open` so the CLI can return.
    let child = Command::new(&shell)
        .arg(&source_abs)
        .spawn()
        .map_err(|e| CliError::Internal {
            code: "E_SPAWN",
            message: format!("failed to spawn {}: {e}", shell.display()),
            hint: Some("Check the nf-shell binary is executable.".into()),
        })?;

    io_json::emit_ok(&serde_json::json!({
        "event": "open.spawned",
        "shell": shell.display().to_string(),
        "source": source_abs.display().to_string(),
        "pid": child.id(),
    }));
    Ok(())
}

/// Lookup precedence:
///   1. env NF_SHELL_PATH
///   2. sibling in workspace: <CARGO_MANIFEST_DIR>/../../target/release/nf-shell
///   3. same directory as current exe
///   4. `which nf-shell` on PATH
fn resolve_nf_shell() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("NF_SHELL_PATH") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let workspace_candidate = Path::new(manifest_dir)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("target").join("release").join("nf-shell"));
    if let Some(c) = workspace_candidate {
        if c.is_file() {
            return Some(c);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sibling = dir.join("nf-shell");
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }
    which_on_path("nf-shell")
}

fn which_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
