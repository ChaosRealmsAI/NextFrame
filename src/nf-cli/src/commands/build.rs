//! `nf build <source> -o <out> [--pretty]`
//!
//! Spawns the engine with `{cmd:"build",args:{source,out,pretty}}`. The engine
//! writes the HTML file itself and emits one terminal `{"event":"build.done",...}`
//! payload; we wrap it into the CLI success envelope.

use std::path::Path;

use serde_json::{json, Value};

use crate::engine;
use crate::error::CliError;
use crate::io_json;

pub fn run(source: &Path, out: &Path, pretty: bool) -> Result<(), CliError> {
    if !source.is_file() {
        return Err(CliError::UserInput {
            code: "E_SOURCE_MISSING",
            message: format!("source file not found: {}", source.display()),
            hint: Some("Provide a path to an existing timeline source JSON.".into()),
        });
    }

    let args = json!({
        "source": source.to_string_lossy(),
        "out": out.to_string_lossy(),
        "pretty": pretty,
    });

    let events = engine::run_engine_cmd("build", &args)?;

    // Pass through every intermediate event; envelope the terminal one.
    let mut terminal: Option<Value> = None;
    for ev in events {
        if ev.get("event").and_then(|v| v.as_str()) == Some("build.done") {
            terminal = Some(ev);
        } else if let Ok(s) = serde_json::to_string(&ev) {
            io_json::emit_raw_line(&s);
        }
    }

    match terminal {
        Some(done) => {
            io_json::emit_ok(&done);
            Ok(())
        }
        None => Err(CliError::Internal {
            code: "E_BUILD_NO_DONE",
            message: "engine did not emit build.done".into(),
            hint: Some("Engine contract broken — check engine.js build.".into()),
        }),
    }
}
