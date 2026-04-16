//! cli config commands
use crate::config::VoxConfig;
use anyhow::Result;

pub fn run_set(key: &str, value: &str) -> Result<()> {
    let mut config = VoxConfig::load();
    match key {
        "voice" => config.default_voice = Some(value.to_owned()),
        "dir" => config.default_dir = Some(value.to_owned()),
        "backend" => config.default_backend = Some(value.to_owned()),
        _ => {
            // Treat as alias: "alias.narrator" = "zh-CN-YunxiNeural"
            if let Some(alias_name) = key.strip_prefix("alias.") {
                config
                    .aliases
                    .insert(alias_name.to_owned(), value.to_owned());
            } else {
                anyhow::bail!(
                    "Unknown config key: {key}. Valid: voice, dir, backend, alias.<name>"
                );
            }
        }
    }
    config.save()?;
    crate::output::write_stdout_line(format_args!(
        "{}",
        serde_json::to_string(&serde_json::json!({"status": "ok", "key": key}))?
    ));
    Ok(())
}

pub fn run_get(key: Option<String>) -> Result<()> {
    let config = VoxConfig::load();
    match key.as_deref() {
        Some("voice") => crate::output::write_stdout_line(format_args!(
            "{}",
            config.default_voice.unwrap_or_default()
        )),
        Some("dir") => crate::output::write_stdout_line(format_args!(
            "{}",
            config.default_dir.unwrap_or_default()
        )),
        Some("backend") => crate::output::write_stdout_line(format_args!(
            "{}",
            config.default_backend.unwrap_or_default()
        )),
        Some(k) if k.starts_with("alias.") => {
            if let Some(name) = k.strip_prefix("alias.") {
                crate::output::write_stdout_line(format_args!(
                    "{}",
                    config.aliases.get(name).cloned().unwrap_or_default()
                ));
            }
        }
        Some(k) => anyhow::bail!("Unknown key: {k}"),
        None => {
            // Print all config as JSON
            crate::output::write_stdout_line(format_args!(
                "{}",
                serde_json::to_string_pretty(&config)?
            ));
        }
    }
    Ok(())
}
