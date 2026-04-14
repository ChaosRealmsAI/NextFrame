//! utility path helpers
use std::env;
use std::fs;
use std::path::PathBuf;

pub fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| {
            let home_drive = env::var_os("HOMEDRIVE")?;
            let home_path = env::var_os("HOMEPATH")?;
            Some(PathBuf::from(home_drive).join(home_path))
        })
}

pub(crate) fn expand_home_dir(path: &str) -> PathBuf {
    if path == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(path));
    }

    if let Some(stripped) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = home_dir() {
            return home.join(stripped);
        }
    }

    PathBuf::from(path)
}

pub(crate) fn home_root() -> Result<PathBuf, String> {
    home_dir()
        .map(canonical_or_raw)
        .ok_or_else(|| "home directory is unavailable".to_string())
}

pub(crate) fn canonical_or_raw(path: PathBuf) -> PathBuf {
    fs::canonicalize(&path).unwrap_or(path)
}
