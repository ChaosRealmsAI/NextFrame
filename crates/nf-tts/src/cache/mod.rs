//! cache module exports
use crate::backend::SynthParams;
use anyhow::Result;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Cache keyed by blake3 hash of the backend, text, and synthesis parameters.
pub struct Cache {
    dir: PathBuf,
}

#[derive(Debug, Serialize)]
struct CacheKeyPayload<'a> {
    backend: &'a str,
    text: &'a str,
    params: &'a SynthParams,
}

impl Cache {
    pub fn new(dir: &Path) -> Result<Self> {
        let cache_dir = dir.join(".vox-cache");
        std::fs::create_dir_all(&cache_dir)?;
        Ok(Self { dir: cache_dir })
    }

    /// Generate cache key from synthesis parameters.
    pub fn key(backend: &str, text: &str, params: &SynthParams) -> String {
        let payload = CacheKeyPayload {
            backend,
            text,
            params,
        };
        let input =
            serde_json::to_vec(&payload).unwrap_or_else(|_| format!("{payload:?}").into_bytes());
        blake3::hash(&input).to_hex().to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_params() -> SynthParams {
        SynthParams {
            voice: "voice-a".to_string(),
            rate: "+0%".to_string(),
            volume: "+0%".to_string(),
            pitch: "+0Hz".to_string(),
            emotion: None,
            emotion_scale: None,
            speech_rate: None,
            loudness_rate: None,
            volc_pitch: None,
            context_text: None,
            dialect: None,
        }
    }

    #[test]
    fn cache_key_includes_backend_text_and_all_synth_params() {
        let base = base_params();
        let base_key = Cache::key("edge", "hello", &base);

        assert_eq!(base_key, Cache::key("edge", "hello", &base));
        assert_ne!(base_key, Cache::key("volcengine", "hello", &base));
        assert_ne!(base_key, Cache::key("edge", "goodbye", &base));

        let mut changed = base.clone();
        changed.voice = "voice-b".to_string();
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.rate = "+10%".to_string();
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.volume = "+10%".to_string();
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.pitch = "+10Hz".to_string();
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.emotion = Some("happy".to_string());
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.emotion_scale = Some(3.0);
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.speech_rate = Some(20);
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.loudness_rate = Some(20);
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.volc_pitch = Some(3);
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base.clone();
        changed.context_text = Some("speak brightly".to_string());
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));

        let mut changed = base;
        changed.dialect = Some("dongbei".to_string());
        assert_ne!(base_key, Cache::key("edge", "hello", &changed));
    }
}
