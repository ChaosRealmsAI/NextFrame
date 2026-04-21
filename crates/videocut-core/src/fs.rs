//! Filesystem helpers shared across workspace crates.

use std::fs;
use std::path::Path;

use anyhow::{Context, Result};

/// Remove a file, symlink, or directory if it already exists.
pub fn remove_existing_path(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_dir() {
                fs::remove_dir_all(path).with_context(|| format!("remove {}", path.display()))?;
            } else {
                fs::remove_file(path).with_context(|| format!("remove {}", path.display()))?;
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("stat {}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_existing_path_ignores_missing_targets() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let missing = temp.path().join("missing.txt");

        remove_existing_path(&missing)?;

        assert!(!missing.exists());
        Ok(())
    }

    #[test]
    fn remove_existing_path_removes_files_and_directories() -> Result<()> {
        let temp = tempfile::tempdir()?;

        let file = temp.path().join("file.txt");
        fs::write(&file, "content")?;
        remove_existing_path(&file)?;
        assert!(!file.exists());

        let directory = temp.path().join("dir");
        fs::create_dir_all(&directory)?;
        fs::write(directory.join("nested.txt"), "content")?;
        remove_existing_path(&directory)?;
        assert!(!directory.exists());

        Ok(())
    }
}
