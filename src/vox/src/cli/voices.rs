use anyhow::Result;

use crate::backend;
use crate::config::VoxConfig;

pub async fn run(lang: Option<String>, backend_name: Option<String>) -> Result<()> {
    let config = VoxConfig::load();
    let backend_name = config.resolve_backend(backend_name);
    let backend = backend::create_backend(&backend_name)?;
    let voices = backend.list_voices(lang.as_deref()).await?;
    println!("{}", serde_json::to_string_pretty(&voices)?);
    Ok(())
}
