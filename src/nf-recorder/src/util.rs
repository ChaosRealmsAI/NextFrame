//! util helpers
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEMP_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn absolute_path(path: &Path) -> Result<PathBuf, String> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        env::current_dir()
            .map_err(|err| format!("failed to inspect current directory: {err}"))
            .map(|cwd| cwd.join(path))
    }
}

pub fn create_temp_dir() -> Result<PathBuf, String> {
    let unique = format!(
        "recorder-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        TEMP_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let dir = env::temp_dir().join(unique);
    fs::create_dir_all(&dir)
        .map_err(|err| format!("failed to create temp dir {}: {err}", dir.display()))?;
    Ok(dir)
}

pub fn auto_jobs(dpr: f64) -> usize {
    let cpus = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(4);
    let free_mb = free_memory_mb().unwrap_or(2048.0);
    let total_mb = total_memory_mb().unwrap_or(free_mb);
    let mem_per_job = if dpr >= 2.0 { 400.0 } else { 200.0 };
    let by_mem = ((free_mb * 0.7) / mem_per_job).floor().max(1.0) as usize;
    let by_cpu = cpus.saturating_sub(2).max(1);
    let jobs = by_mem.min(by_cpu).max(1);
    println!(
        "  system: {cpus} cores, {:.0}MB total, {:.0}MB free -> {jobs} jobs",
        total_mb, free_mb
    );
    jobs
}

pub fn total_memory_mb() -> Option<f64> {
    let output = std::process::Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()?;
    let bytes = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .ok()?;
    Some(bytes / 1024.0 / 1024.0)
}

pub fn free_memory_mb() -> Option<f64> {
    let output = std::process::Command::new("vm_stat").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let page_size = text
        .lines()
        .find_map(|line| {
            line.split("page size of ")
                .nth(1)
                .and_then(|rest| rest.split(" bytes").next())
                .and_then(|value| value.trim().parse::<f64>().ok())
        })
        .unwrap_or(16384.0);
    let pages = text
        .lines()
        .filter_map(|line| {
            let key = if line.contains("Pages free") || line.contains("Pages speculative") {
                Some(line)
            } else {
                None
            }?;
            key.split(':')
                .nth(1)
                .map(|value| value.replace('.', "").trim().to_string())
                .and_then(|value| value.parse::<f64>().ok())
        })
        .sum::<f64>();
    Some(pages * page_size / 1024.0 / 1024.0)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn absolute_path_converts_relative_paths() -> Result<(), String> {
        let relative = Path::new("relative/path.html");
        let absolute = absolute_path(relative)?;

        assert_eq!(
            absolute,
            env::current_dir()
                .map_err(|err| err.to_string())?
                .join(relative)
        );
        assert!(absolute.is_absolute());
        Ok(())
    }

    #[test]
    fn absolute_path_preserves_absolute_paths() -> Result<(), String> {
        let path = env::temp_dir().join("already-absolute.html");

        assert_eq!(absolute_path(&path)?, path);
        Ok(())
    }

    #[test]
    fn auto_jobs_returns_positive_count() {
        assert!(auto_jobs(1.0) > 0);
    }

    #[test]
    fn create_temp_dir_creates_directory() -> Result<(), String> {
        let dir = create_temp_dir()?;

        assert!(dir.exists());
        assert!(dir.is_dir());

        fs::remove_dir_all(dir).map_err(|err| err.to_string())?;
        Ok(())
    }
}
