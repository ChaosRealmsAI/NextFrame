//! `nf build <src> -o <out>` → shell out to the TypeScript engine.

use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

pub fn run(source: &Path, output: &Path) -> anyhow::Result<serde_json::Value> {
    if !source.exists() {
        return Err(anyhow::anyhow!("source not found: {}", source.display()));
    }
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let engine_cli = engine_cli_path()?;
    let engine_output = Command::new("node")
        .arg(&engine_cli)
        .arg("build")
        .arg(source)
        .arg("-o")
        .arg(output)
        .output()?;
    let stdout = String::from_utf8(engine_output.stdout).map_err(|err| anyhow::anyhow!(err))?;
    let stderr = String::from_utf8(engine_output.stderr).map_err(|err| anyhow::anyhow!(err))?;
    if !engine_output.status.success() {
        let error = parse_json_output(&stderr)
            .or_else(|_| parse_json_output(&stdout))
            .ok()
            .and_then(|payload| {
                payload
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| String::from("engine build failed"));
        return Err(anyhow::anyhow!(
            "{error}; exit_code={}; stderr={stderr}",
            engine_output.status.code().unwrap_or(-1)
        ));
    }
    let bytes = std::fs::metadata(output).map(|m| m.len()).unwrap_or(0);
    Ok(serde_json::json!({
        "ok": true,
        "command": "build",
        "source": source.display().to_string(),
        "output": output.display().to_string(),
        "bytes": bytes,
        "engine_cli": engine_cli.display().to_string(),
    }))
}

fn engine_cli_path() -> anyhow::Result<std::path::PathBuf> {
    for candidate in engine_cli_candidates() {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(anyhow::anyhow!(
        "engine cli not found in dist or source-runner locations"
    ))
}

fn engine_cli_candidates() -> [PathBuf; 2] {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    [
        repo_root.join("src/nf-core-engine/dist/cli.js"),
        repo_root.join("src/nf-core-engine/scripts/cli.mjs"),
    ]
}

fn parse_json_output(text: &str) -> anyhow::Result<serde_json::Value> {
    let line = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("stdout did not contain JSON"))?;
    serde_json::from_str(line).map_err(|err| anyhow::anyhow!(err))
}
