//! `nf validate <source>`
//!
//! Engine does schema + expr + anchor + track-ABI static check and emits
//! `{"event":"validate.ok",...}` on success.

use std::path::Path;

use serde_json::json;

use crate::engine;
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

    let args = json!({ "source": source.to_string_lossy() });
    let result = engine::run_engine_cmd_last("validate", &args)?;
    io_json::emit_ok(&result);
    Ok(())
}
