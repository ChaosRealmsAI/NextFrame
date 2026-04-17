//! source.json atomic writes + file-watcher trait. Shell is the single writer.

use std::path::{Path, PathBuf};

pub trait SourceWatcher {
    fn watch(&mut self, path: &Path) -> anyhow::Result<()>;
    fn stop(&mut self) -> anyhow::Result<()>;
}

pub struct StubWatcher;

impl SourceWatcher for StubWatcher {
    fn watch(&mut self, _path: &Path) -> anyhow::Result<()> {
        Ok(())
    }

    fn stop(&mut self) -> anyhow::Result<()> {
        Ok(())
    }
}

/// Atomic rename write: write to sibling tmp then rename over target.
pub fn atomic_write(target: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    let parent = target.parent().ok_or_else(|| {
        anyhow::anyhow!("source path has no parent: {}", target.display())
    })?;
    let mut tmp: PathBuf = parent.to_path_buf();
    let name = target
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("source path has no file name"))?;
    tmp.push(format!(".{}.tmp", name.to_string_lossy()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, target)?;
    Ok(())
}
