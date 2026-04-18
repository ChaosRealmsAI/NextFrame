//! `nf schema <track-name|path>`
//!
//! Prints the JSON Schema returned by a Track's `describe()`.
//!
//! Strategy: run `node -e` with a tiny loader that dynamic-imports the track
//! file and JSON-serializes `describe()`. Avoids plumbing through the engine
//! because this is a pure one-off track import (no timeline resolution needed).

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::error::CliError;
use crate::io_json;

pub fn run(track: &str) -> Result<(), CliError> {
    let track_path = resolve_track_path(track)?;

    // node -e loader — prints a single JSON object: describe()'s return.
    let loader = format!(
        "import({path:?}).then(m => {{ const d = typeof m.describe === 'function' ? m.describe() : null; process.stdout.write(JSON.stringify(d||{{}})); }}).catch(e => {{ process.stdout.write(JSON.stringify({{__err:String(e.stack||e.message||e)}})); process.exit(2); }});",
        path = track_path.to_string_lossy()
    );

    let output = Command::new("node")
        .arg("--input-type=module")
        .arg("-e")
        .arg(&loader)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| CliError::engine_spawn(format!("could not spawn node: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let trimmed = stdout.trim();
    let parsed: Value = serde_json::from_str(trimmed).map_err(|_| CliError::Internal {
        code: "E_SCHEMA_PARSE",
        message: format!("track describe() output not JSON: {trimmed}"),
        hint: Some("Track must export a describe() returning a JSON-serializable object.".into()),
    })?;

    if let Some(err) = parsed.get("__err").and_then(|v| v.as_str()) {
        return Err(CliError::SpecViolation {
            code: "E_TRACK_LOAD".into(),
            message: format!("could not load track: {err}"),
            hint: Some("Check the path and that the file exports describe().".into()),
            location: None,
        });
    }

    io_json::emit_ok(&parsed);
    Ok(())
}

/// Resolve a track spec into an absolute .js path.
///
/// - if `track` ends with `.js` or contains `/` treat as path (relative to cwd)
/// - else treat as id, look up `src/nf-tracks/official/<id>.js` under the repo
///   (search upward from cwd until a directory containing `src/nf-tracks` is found).
fn resolve_track_path(track: &str) -> Result<PathBuf, CliError> {
    if track.ends_with(".js") || track.contains('/') {
        let p = PathBuf::from(track);
        if !p.is_file() {
            return Err(CliError::UserInput {
                code: "E_TRACK_PATH",
                message: format!("track file not found: {}", p.display()),
                hint: Some("Provide a path to a Track .js file or a known track id.".into()),
            });
        }
        return p
            .canonicalize()
            .map_err(|e| CliError::io_read(&p.to_string_lossy(), e));
    }

    // Lookup by id → search upward for src/nf-tracks/official/<track>.js
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
            .join("official")
            .join(format!("{track}.js"));
        if candidate.is_file() {
            return Ok(candidate);
        }
        cur = dir.parent();
    }

    Err(CliError::UserInput {
        code: "E_TRACK_ID",
        message: format!(
            "unknown track id '{track}' (searched src/nf-tracks/official/ upward from cwd)"
        ),
        hint: Some("Provide the path to the track .js file instead.".into()),
    })
}
