//! `nf validate <source.json>` — minimal structural check; engine owns deep validation.

use std::path::Path;

pub fn run(source: &Path) -> anyhow::Result<serde_json::Value> {
    if !source.exists() {
        return Err(anyhow::anyhow!("source not found: {}", source.display()));
    }
    let bytes = std::fs::read(source)?;
    let parsed: serde_json::Value = serde_json::from_slice(&bytes)?;
    let has_viewport = parsed.get("viewport").is_some();
    Ok(serde_json::json!({
        "ok": true,
        "command": "validate",
        "source": source.display().to_string(),
        "has_viewport": has_viewport,
        "bytes": bytes.len(),
        "status": "walking-stub",
    }))
}
