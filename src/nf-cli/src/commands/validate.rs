//! `nf validate <source.json>` — delegate to the TypeScript engine validate command.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};
use serde_json::{json, Value};

use crate::commands::CommandOutput;

pub fn run(source: &Path) -> Result<CommandOutput> {
    if !source.exists() {
        return Ok(CommandOutput::json_with_exit(
            json!({
                "ok": false,
                "command": "validate",
                "source": source.display().to_string(),
                "error": "source not found",
            }),
            1,
        ));
    }

    let engine_cli = match engine_cli_path() {
        Ok(path) => path,
        Err(err) => {
            return Ok(CommandOutput::json_with_exit(
                json!({
                    "ok": false,
                    "command": "validate",
                    "source": source.display().to_string(),
                    "error": err.to_string(),
                }),
                1,
            ));
        }
    };

    let bytes = fs::read(source)?;
    let rust_checks = rust_checks(&engine_cli, &bytes);
    let output = Command::new("node")
        .arg(&engine_cli)
        .arg("validate")
        .arg(source)
        .output()
        .with_context(|| format!("spawn node validate via {}", engine_cli.display()))?;
    let stdout = String::from_utf8(output.stdout).context("validate stdout was not utf-8")?;
    let stderr = String::from_utf8(output.stderr).context("validate stderr was not utf-8")?;

    let mut payload = parse_json_output(&stdout).unwrap_or_else(|_| {
        json!({
            "ok": false,
            "command": "validate",
            "source": source.display().to_string(),
            "error": "engine validate did not emit JSON",
            "stderr": stderr,
        })
    });
    if let Some(object) = payload.as_object_mut() {
        object.insert(
            String::from("command"),
            Value::String(String::from("validate")),
        );
        object.insert(
            String::from("source"),
            Value::String(source.display().to_string()),
        );
        object.insert(String::from("engine"), Value::String(String::from("ts")));
        object.insert(
            String::from("engine_cli"),
            Value::String(engine_cli.display().to_string()),
        );
        object.insert(String::from("rust_checks"), rust_checks);
        if !stderr.trim().is_empty() {
            object.insert(String::from("stderr"), Value::String(stderr.clone()));
        }
    }

    let exit_code = if output.status.success() {
        0
    } else {
        output.status.code().unwrap_or(1)
    };
    Ok(CommandOutput::json_with_exit(payload, exit_code))
}

fn rust_checks(engine_cli: &Path, bytes: &[u8]) -> Value {
    let parse_result = serde_json::from_slice::<Value>(bytes);
    let (has_viewport, parse_error) = match parse_result {
        Ok(value) => (value.get("viewport").is_some(), None),
        Err(err) => (false, Some(err.to_string())),
    };
    json!({
        "source_exists": true,
        "bytes": bytes.len(),
        "has_viewport": has_viewport,
        "parse_error": parse_error,
        "engine_cli_exists": engine_cli.is_file(),
    })
}

fn engine_cli_path() -> Result<PathBuf> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("src/nf-core-engine/dist/cli.js");
    if path.is_file() {
        return Ok(path);
    }
    anyhow::bail!(
        "engine cli not built: expected {}. Run `cd src/nf-core-engine && npm run build` first",
        path.display()
    )
}

fn parse_json_output(stdout: &str) -> Result<Value> {
    let line = stdout
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .context("stdout did not contain JSON")?;
    serde_json::from_str(line).context("parse validate JSON")
}
