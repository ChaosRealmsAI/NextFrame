//! `nf lint-track <file>`
//!
//! Delegates to `node src/nf-tracks/scripts/check-abi.mjs <file>` (not via engine
//! — the ABI checker is a standalone node script per modules.json). Pass-through
//! stdout.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::error::CliError;
use crate::io_json;

pub fn run(file: &Path) -> Result<(), CliError> {
    if !file.is_file() {
        return Err(CliError::UserInput {
            code: "E_TRACK_FILE",
            message: format!("track file not found: {}", file.display()),
            hint: Some("Provide a path to a Track .js file.".into()),
        });
    }

    let script = resolve_check_abi_script()?;

    let output = Command::new("node")
        .arg(&script)
        .arg(file)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| CliError::engine_spawn(format!("could not spawn node: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut last: Option<Value> = None;
    for line in stdout.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(l) {
            Ok(v) => {
                if v.get("error").is_some() || v.get("event").is_some() {
                    last = Some(v);
                }
            }
            Err(_) => continue,
        }
    }

    match last {
        Some(v) => {
            if let Some(err) = v.get("error") {
                return Err(CliError::from_engine_error(err));
            }
            if v.get("event").and_then(|x| x.as_str()) == Some("lint-track.fail") {
                let gate = v
                    .get("failed_gate")
                    .and_then(|x| x.as_str())
                    .unwrap_or("unknown");
                let details = v
                    .get("details")
                    .and_then(|x| x.as_str())
                    .unwrap_or("no details");
                return Err(CliError::SpecViolation {
                    code: "E_TRACK_ABI".into(),
                    message: format!("track failed gate '{gate}': {details}"),
                    hint: Some(
                        "Fix the track per nf-tracks ABI (zero imports / 3 exports / FM-T0).".into(),
                    ),
                    location: None,
                });
            }
            io_json::emit_ok(&v);
            Ok(())
        }
        None => Err(CliError::Internal {
            code: "E_LINT_NO_OUTPUT",
            message: "lint-track produced no parseable stdout".into(),
            hint: Some("check-abi.mjs contract broken.".into()),
        }),
    }
}

fn resolve_check_abi_script() -> Result<PathBuf, CliError> {
    // Search upward from cwd for src/nf-tracks/scripts/check-abi.mjs
    let cwd = std::env::current_dir().map_err(|e| CliError::Internal {
        code: "E_CWD",
        message: format!("could not read cwd: {e}"),
        hint: None,
    })?;
    let mut cur: Option<&Path> = Some(cwd.as_path());
    while let Some(dir) = cur {
        let candidate = dir
            .join("src")
            .join("nf-tracks")
            .join("scripts")
            .join("check-abi.mjs");
        if candidate.is_file() {
            return Ok(candidate);
        }
        cur = dir.parent();
    }

    // Fall back relative to CARGO_MANIFEST_DIR.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let rel = Path::new(manifest_dir)
        .parent()
        .map(|p| p.join("nf-tracks").join("scripts").join("check-abi.mjs"));
    if let Some(p) = rel {
        if p.is_file() {
            return Ok(p);
        }
    }

    Err(CliError::Internal {
        code: "E_LINT_SCRIPT",
        message: "could not locate src/nf-tracks/scripts/check-abi.mjs".into(),
        hint: Some("Ensure nf-tracks is on disk.".into()),
    })
}
