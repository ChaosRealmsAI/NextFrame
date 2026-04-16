//! Python interpreter resolution shared by helper-script wrappers.

use std::path::Path;

/// Resolve the Python interpreter path for a helper script.
pub fn python_bin(env_var_name: &str, preferred_path: &Path) -> String {
    if let Ok(bin) = std::env::var(env_var_name) {
        return bin;
    }

    if preferred_path.exists() {
        return preferred_path.display().to_string();
    }

    "python3".to_string()
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, OnceLock};

    use super::*;

    fn env_lock() -> &'static Mutex<()> {
        static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        ENV_LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn python_bin_prefers_env_var() -> anyhow::Result<()> {
        let _guard = env_lock()
            .lock()
            .map_err(|_| anyhow::anyhow!("poisoned lock"))?;
        let temp = tempfile::tempdir()?;
        let preferred = temp.path().join("python3");

        unsafe {
            // SAFETY: tests serialize environment mutation with `env_lock`, so process-global env mutation is synchronized here.
            std::env::set_var("VIDEOCUT_CORE_TEST_PYTHON_BIN", "custom-python");
        }
        let resolved = python_bin("VIDEOCUT_CORE_TEST_PYTHON_BIN", &preferred);
        unsafe {
            // SAFETY: tests serialize environment mutation with `env_lock`, so removing the env var cannot race other tests here.
            std::env::remove_var("VIDEOCUT_CORE_TEST_PYTHON_BIN");
        }

        assert_eq!(resolved, "custom-python");
        Ok(())
    }

    #[test]
    fn python_bin_uses_existing_preferred_path() -> anyhow::Result<()> {
        let _guard = env_lock()
            .lock()
            .map_err(|_| anyhow::anyhow!("poisoned lock"))?;
        let temp = tempfile::tempdir()?;
        let preferred = temp.path().join("python3");
        std::fs::write(&preferred, "#!/usr/bin/env python3")?;

        let resolved = python_bin("VIDEOCUT_CORE_TEST_PYTHON_BIN", &preferred);

        assert_eq!(resolved, preferred.display().to_string());
        Ok(())
    }

    #[test]
    fn python_bin_falls_back_to_python3() {
        let preferred = Path::new("/definitely/missing/python3");
        let resolved = python_bin("VIDEOCUT_CORE_TEST_PYTHON_BIN", preferred);

        assert_eq!(resolved, "python3");
    }
}
