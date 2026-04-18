//! Engine subprocess bridge.
//!
//! Spawns `node <engine.js> --cmd '<json>'` — the engine is a one-shot command
//! runner (see src/nf-core-engine/src/cli.ts). Stdout is a sequence of JSON
//! lines; last line terminates the exchange.
//!
//! Engine lookup precedence (first that exists wins):
//!   1. env NF_ENGINE_PATH (developer override)
//!   2. relative to CARGO_MANIFEST_DIR: ../nf-core-engine/dist/engine.js
//!      (nf-cli lives at <repo>/src/nf-cli/ → engine lives at <repo>/src/nf-core-engine/dist/)
//!   3. /usr/local/lib/nextframe/engine.js (post-install)

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::error::CliError;

/// Resolve the engine.js path, trying each candidate in precedence order.
pub fn resolve_engine_path() -> Result<PathBuf, CliError> {
    if let Ok(p) = std::env::var("NF_ENGINE_PATH") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            return Ok(pb);
        }
        return Err(CliError::engine_not_found(&p));
    }

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let rel = Path::new(manifest_dir)
        .parent()
        .map(|p| p.join("nf-core-engine").join("dist").join("engine.js"));
    if let Some(candidate) = rel {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let installed = PathBuf::from("/usr/local/lib/nextframe/engine.js");
    if installed.is_file() {
        return Ok(installed);
    }

    Err(CliError::engine_not_found(
        "env NF_ENGINE_PATH / ../nf-core-engine/dist/engine.js / /usr/local/lib/nextframe/engine.js",
    ))
}

/// Send a single `{cmd, args}` command to the engine and collect every stdout line.
///
/// Returns the parsed JSON lines in order. Callers decide whether to pass-through
/// (build's streaming events) or cherry-pick the final event.
pub fn run_engine_cmd(cmd: &str, args: &Value) -> Result<Vec<Value>, CliError> {
    let engine_path = resolve_engine_path()?;
    let payload = serde_json::json!({ "cmd": cmd, "args": args });
    let payload_str = serde_json::to_string(&payload).map_err(|e| CliError::Internal {
        code: "E_CMD_SERIALIZE",
        message: format!("could not serialize engine command: {e}"),
        hint: None,
    })?;

    let output = Command::new("node")
        .arg(&engine_path)
        .arg("--cmd")
        .arg(&payload_str)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| CliError::engine_spawn(format!("could not spawn node: {e}")))?;

    if !output.stdout.is_empty() {
        // parse lines below
    } else if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(CliError::Internal {
            code: "E_ENGINE_EXIT",
            message: format!("engine exited with no stdout: {stderr}"),
            hint: Some("Check node version (>=18) and engine.js integrity.".into()),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut lines: Vec<Value> = Vec::new();
    for raw in stdout.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let parsed: Value = serde_json::from_str(line)
            .map_err(|_| CliError::engine_stdout_parse(line.to_string()))?;
        lines.push(parsed);
    }

    // If engine emitted {"error": {...}} treat as spec violation.
    if let Some(last) = lines.last() {
        if let Some(err_obj) = last.get("error") {
            return Err(CliError::from_engine_error(err_obj));
        }
    }

    Ok(lines)
}

/// Convenience: return the last event as Value (for commands expecting one result).
pub fn run_engine_cmd_last(cmd: &str, args: &Value) -> Result<Value, CliError> {
    let mut lines = run_engine_cmd(cmd, args)?;
    lines.pop().ok_or_else(|| CliError::Internal {
        code: "E_ENGINE_EMPTY",
        message: "engine produced no stdout".into(),
        hint: Some("Engine should emit at least one event.".into()),
    })
}
