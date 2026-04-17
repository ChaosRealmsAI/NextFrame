//! `nf build <src> -o <out>` → shell out to the TypeScript engine.

use std::path::Path;
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
    let candidates = [
        "src/nf-core-engine/dist/cli.js",
        "../src/nf-core-engine/dist/cli.js",
        "../../src/nf-core-engine/dist/cli.js",
    ];
    for c in candidates.iter() {
        let p = std::path::PathBuf::from(c);
        if p.exists() {
            return Ok(p);
        }
    }
    Err(anyhow::anyhow!(
        "engine cli not found — run `npm run build` in src/nf-core-engine"
    ))
}
