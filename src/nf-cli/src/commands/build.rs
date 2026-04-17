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
    let status = Command::new("node")
        .arg(&engine_cli)
        .arg("build")
        .arg(source)
        .arg("-o")
        .arg(output)
        .status()?;
    if !status.success() {
        return Err(anyhow::anyhow!(
            "engine exited non-zero: {}",
            status.code().unwrap_or(-1)
        ));
    }
    let bytes = std::fs::metadata(output).map(|m| m.len()).unwrap_or(0);
    Ok(serde_json::json!({
        "ok": true,
        "command": "build",
        "source": source.display().to_string(),
        "output": output.display().to_string(),
        "bytes": bytes,
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
