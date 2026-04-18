//! `nf new [-o out] [--ratio 16:9|9:16|1:1]`
//!
//! Writes a minimal demo timeline source.json (1 anchor, 1 scene track, 1 clip)
//! that's immediately `nf validate` / `nf build`-able (given the scene track
//! resolves locally).

use std::path::{Path, PathBuf};

use serde_json::json;

use crate::error::CliError;
use crate::io_json;

pub fn run(out: Option<&Path>, ratio: &str) -> Result<(), CliError> {
    let (w, h) = match ratio {
        "16:9" => (1920u32, 1080u32),
        "9:16" => (1080u32, 1920u32),
        "1:1" => (1080u32, 1080u32),
        _ => {
            return Err(CliError::UserInput {
                code: "E_RATIO",
                message: format!("unknown ratio '{ratio}'"),
                hint: Some("Use 16:9, 9:16, or 1:1.".into()),
            });
        }
    };

    let template = json!({
        "meta": {
            "name": "untitled",
            "description": "minimal nf timeline — scaffolded by `nf new`"
        },
        "viewport": { "ratio": ratio, "w": w, "h": h },
        "duration": "main.end",
        "anchors": {
            "main": { "begin": "0", "end": "main.begin + 3s", "filler": "manual" }
        },
        "tracks": [
            {
                "id": "scene-main",
                "kind": "scene",
                "src": "src/nf-tracks/official/scene.js",
                "clips": [
                    {
                        "id": "hello",
                        "begin": "main.begin",
                        "end": "main.end",
                        "params": {
                            "layout": "hero",
                            "title": "Hello NextFrame",
                            "subtitle": "edit me",
                            "bg_color": "#0d1117",
                            "accent_color": "#bc8cff"
                        }
                    }
                ]
            }
        ]
    });

    let pretty = match serde_json::to_string_pretty(&template) {
        Ok(s) => s,
        Err(e) => {
            return Err(CliError::Internal {
                code: "E_TEMPLATE",
                message: format!("could not serialize template: {e}"),
                hint: None,
            });
        }
    };

    let target: PathBuf = out.map(PathBuf::from).unwrap_or_else(|| PathBuf::from("./timeline.json"));

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| CliError::io_write(&parent.to_string_lossy(), e))?;
        }
    }

    std::fs::write(&target, &pretty)
        .map_err(|e| CliError::io_write(&target.to_string_lossy(), e))?;

    io_json::emit_ok(&json!({ "out": target.to_string_lossy() }));
    Ok(())
}
