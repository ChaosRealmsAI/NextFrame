//! `nf anchors <source> [--rename old=new] [--write]`
//!
//! - No `--rename` → engine `anchors` command → list of anchors + referenced_by.
//! - With `--rename old=new` → engine `rename-anchor` command → patched JSON
//!   (or writes back in place if `--write`).

use std::path::Path;

use serde_json::json;

use crate::engine;
use crate::error::CliError;
use crate::io_json;

pub fn run(source: &Path, rename: Option<&str>, write: bool) -> Result<(), CliError> {
    if !source.is_file() {
        return Err(CliError::UserInput {
            code: "E_SOURCE_MISSING",
            message: format!("source file not found: {}", source.display()),
            hint: Some("Provide a path to an existing timeline source JSON.".into()),
        });
    }

    match rename {
        None => {
            let args = json!({ "source": source.to_string_lossy() });
            let result = engine::run_engine_cmd_last("anchors", &args)?;
            io_json::emit_ok(&result);
            Ok(())
        }
        Some(spec) => {
            let (from, to) = parse_rename(spec)?;
            let args = json!({
                "source": source.to_string_lossy(),
                "from": from,
                "to": to,
                "write": write,
            });
            let result = engine::run_engine_cmd_last("rename-anchor", &args)?;
            io_json::emit_ok(&result);
            Ok(())
        }
    }
}

fn parse_rename(spec: &str) -> Result<(String, String), CliError> {
    let mut it = spec.splitn(2, '=');
    let from = it.next().unwrap_or("").trim();
    let to = it.next().unwrap_or("").trim();
    if from.is_empty() || to.is_empty() {
        return Err(CliError::UserInput {
            code: "E_RENAME_FORMAT",
            message: format!("invalid --rename value '{spec}'"),
            hint: Some("Use --rename old=new.".into()),
        });
    }
    Ok((from.to_string(), to.to_string()))
}
