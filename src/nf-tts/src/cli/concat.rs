//! cli audio concatenation command
use anyhow::{anyhow, Result};
use std::path::Path;

pub fn run(files: Vec<String>, output: String) -> Result<()> {
    if files.is_empty() {
        return Err(anyhow!("No input files specified"));
    }

    let mut combined = Vec::new();
    for f in &files {
        let path = Path::new(f);
        if !path.exists() {
            return Err(anyhow!("File not found: {f}"));
        }
        let data = std::fs::read(path)?;
        combined.extend(data);
    }

    let out_path = Path::new(&output);
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(out_path, &combined)?;

    println!(
        "{}",
        serde_json::to_string(&serde_json::json!({
            "status": "done",
            "file": output,
            "inputs": files.len(),
            "size_bytes": std::fs::metadata(out_path)?.len(),
        }))?
    );

    Ok(())
}
