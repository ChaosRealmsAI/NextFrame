//! cache module exports
use anyhow::Result;
use std::path::{Path, PathBuf};

/// Cache keyed by blake3 hash of (text + voice + rate + pitch + volume).
pub struct Cache {
    dir: PathBuf,
}

impl Cache {
    pub fn new(dir: &Path) -> Result<Self> {
        let cache_dir = dir.join(".vox-cache");
        std::fs::create_dir_all(&cache_dir)?;
        Ok(Self { dir: cache_dir })
    }

    /// Generate cache key from synthesis parameters.
    pub fn key(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
        let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
        blake3::hash(input.as_bytes()).to_hex().to_string()
    }

    /// Check if cached audio exists, return path if so.
    pub fn get(&self, key: &str) -> Option<PathBuf> {
        let path = self.dir.join(format!("{key}.mp3"));
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }

    /// Store audio data in cache.
    pub fn put(&self, key: &str, data: &[u8]) -> Result<PathBuf> {
        let path = self.dir.join(format!("{key}.mp3"));
        std::fs::write(&path, data)?;
        Ok(path)
    }
}
