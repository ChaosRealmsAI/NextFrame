use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct UserPlugin {
    pub name: String,
    pub kind: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub manifest_path: PathBuf,
    pub entry_path: PathBuf,
    pub source_text: String,
}

#[derive(Debug, Clone)]
pub struct PluginCatalog {
    pub root: PathBuf,
    pub plugins: Vec<UserPlugin>,
    pub warnings: Vec<String>,
    kind_to_index: HashMap<String, usize>,
}

impl PluginCatalog {
    pub fn empty(root: PathBuf) -> Self {
        Self {
            root,
            plugins: Vec::new(),
            warnings: Vec::new(),
            kind_to_index: HashMap::new(),
        }
    }

    pub fn source_for_kind(&self, kind: &str) -> Option<&str> {
        self.kind_to_index
            .get(kind)
            .and_then(|idx| self.plugins.get(*idx))
            .map(|plugin| plugin.source_text.as_str())
    }
}

#[derive(Debug, Default, Deserialize)]
struct PluginManifest {
    name: Option<String>,
    kind: Option<String>,
    version: Option<String>,
    description: Option<String>,
    entry: Option<String>,
    main: Option<String>,
    track: Option<String>,
}

pub fn nextframe_home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".nextframe");
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".nextframe");
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".nextframe")
}

pub fn plugins_root_dir() -> PathBuf {
    nextframe_home_dir().join("plugins")
}

pub fn scan_user_plugins() -> PluginCatalog {
    let root = plugins_root_dir();
    let mut catalog = PluginCatalog::empty(root.clone());
    let Ok(entries) = fs::read_dir(&root) else {
        return catalog;
    };

    let mut dirs = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    dirs.sort();

    for dir in dirs {
        match load_user_plugin(&dir) {
            Ok(plugin) => {
                if let Some(existing_idx) = catalog.kind_to_index.get(&plugin.kind).copied() {
                    let existing = catalog
                        .plugins
                        .get(existing_idx)
                        .map(|p| p.entry_path.display().to_string())
                        .unwrap_or_else(|| "<unknown>".to_string());
                    catalog.warnings.push(format!(
                        "skip duplicate plugin kind '{}' at {} (already loaded from {})",
                        plugin.kind,
                        plugin.entry_path.display(),
                        existing
                    ));
                    continue;
                }
                let idx = catalog.plugins.len();
                catalog.kind_to_index.insert(plugin.kind.clone(), idx);
                catalog.plugins.push(plugin);
            }
            Err(err) => {
                catalog.warnings.push(format!(
                    "skip plugin {}: {err}",
                    dir.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("<unknown>")
                ));
            }
        }
    }

    catalog
}

fn load_user_plugin(dir: &Path) -> Result<UserPlugin> {
    let dir_name = dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .filter(|name| !name.trim().is_empty())
        .context("plugin dir has no valid name")?;

    let manifest_path = dir.join("manifest.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .with_context(|| format!("read {}", manifest_path.display()))?;
    let manifest: PluginManifest =
        serde_json::from_str(&manifest_text).context("manifest.json not valid JSON")?;

    let entry_rel = non_empty(manifest.entry.as_deref())
        .or_else(|| non_empty(manifest.main.as_deref()))
        .or_else(|| non_empty(manifest.track.as_deref()))
        .unwrap_or("track.js");
    let entry_path = dir.join(entry_rel);
    let source_text = fs::read_to_string(&entry_path)
        .with_context(|| format!("read {}", entry_path.display()))?;

    let name = non_empty(manifest.name.as_deref())
        .map(str::to_string)
        .unwrap_or_else(|| dir_name.clone());
    let kind = non_empty(manifest.kind.as_deref())
        .map(str::to_string)
        .unwrap_or_else(|| name.clone());

    Ok(UserPlugin {
        name,
        kind,
        version: non_empty(manifest.version.as_deref()).map(str::to_string),
        description: non_empty(manifest.description.as_deref()).map(str::to_string),
        manifest_path,
        entry_path,
        source_text,
    })
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{scan_user_plugins, PluginCatalog};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("nf-shell-{label}-{stamp}"))
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn scan_user_plugins_reads_valid_plugin() -> Result<(), Box<dyn std::error::Error>> {
        let _guard = env_lock().lock().map_err(|_| "env lock poisoned")?;
        let home = unique_temp_dir("plugins-home");
        let plugin_dir = home.join(".nextframe").join("plugins").join("hello-world");
        fs::create_dir_all(&plugin_dir)?;
        fs::write(
            plugin_dir.join("manifest.json"),
            r#"{"name":"hello-world","kind":"hello-world"}"#,
        )?;
        fs::write(
            plugin_dir.join("track.js"),
            "export function describe(){return {kind:'hello-world'}}\nexport function sample(){return {}}\nexport function render(){return '<div>Hello</div>'}\n",
        )?;

        let prev_home = std::env::var_os("HOME");
        std::env::set_var("HOME", &home);
        let catalog = scan_user_plugins();
        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        assert_eq!(catalog.plugins.len(), 1);
        assert_eq!(catalog.plugins[0].kind, "hello-world");
        assert!(catalog.source_for_kind("hello-world").is_some());
        let _ = fs::remove_dir_all(home);
        Ok(())
    }

    #[test]
    fn duplicate_kinds_are_reported() -> Result<(), Box<dyn std::error::Error>> {
        let _guard = env_lock().lock().map_err(|_| "env lock poisoned")?;
        let home = unique_temp_dir("plugins-duplicate");
        let root = home.join(".nextframe").join("plugins");
        for name in ["one", "two"] {
            let plugin_dir = root.join(name);
            fs::create_dir_all(&plugin_dir)?;
            fs::write(
                plugin_dir.join("manifest.json"),
                r#"{"name":"hello","kind":"hello-world"}"#,
            )?;
            fs::write(
                plugin_dir.join("track.js"),
                "export function describe(){return {kind:'hello-world'}}\nexport function sample(){return {}}\nexport function render(){return '<div>Hello</div>'}\n",
            )?;
        }

        let prev_home = std::env::var_os("HOME");
        std::env::set_var("HOME", &home);
        let catalog = scan_user_plugins();
        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        assert_eq!(catalog.plugins.len(), 1);
        assert!(!catalog.warnings.is_empty());
        let _ = fs::remove_dir_all(home);
        Ok(())
    }

    #[test]
    fn empty_catalog_preserves_root() {
        let catalog = PluginCatalog::empty(PathBuf::from("/tmp/nextframe/plugins"));
        assert_eq!(catalog.root, PathBuf::from("/tmp/nextframe/plugins"));
        assert!(catalog.plugins.is_empty());
    }
}
