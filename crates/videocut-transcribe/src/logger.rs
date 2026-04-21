//! Timestamped log writer for transcription and import commands.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};

/// Line-oriented logger that writes to stderr and `log.txt`.
pub struct Logger {
    file: Mutex<File>,
}

impl Logger {
    /// Create a new logger writing to `log.txt`.
    pub fn new(path: &Path) -> Result<Self> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .with_context(|| format!("open {}", path.display()))?;
        Ok(Self {
            file: Mutex::new(file),
        })
    }

    /// Write one timestamped log line.
    pub fn log(&self, message: &str) {
        let line = format!("[{}] {}", hhmmss(), message);
        eprintln!("{line}");
        if let Ok(mut file) = self.file.lock() {
            let _ = writeln!(file, "{line}");
            let _ = file.flush();
        }
    }
}

fn hhmmss() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let hours = (seconds / 3600) % 24;
    let minutes = (seconds / 60) % 60;
    let secs = seconds % 60;
    format!("{hours:02}:{minutes:02}:{secs:02}")
}
