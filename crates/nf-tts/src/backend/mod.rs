//! backend module exports
pub(crate) mod edge;
pub(crate) mod volcengine;

use std::sync::Arc;

use anyhow::{bail, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub const DEFAULT_BACKEND: &str = "edge";
pub const DEFAULT_VOICE: &str = "en-US-EmmaMultilingualNeural";

/// A voice available from a backend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voice {
    pub name: String,
    pub short_name: String,
    pub locale: String,
    pub language: String,
    pub gender: String,
}

/// Parameters for a single synthesis job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthParams {
    pub voice: String,
    // ── Edge TTS params ──
    #[serde(default = "default_rate")]
    pub rate: String,
    #[serde(default = "default_volume")]
    pub volume: String,
    #[serde(default = "default_pitch")]
    pub pitch: String,
    // ── Volcengine params ──
    /// Emotion: happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story
    #[serde(default)]
    pub emotion: Option<String>,
    /// Emotion intensity: 1-5
    #[serde(default)]
    pub emotion_scale: Option<f32>,
    /// Speech rate: -50 (0.5x) to 100 (2x), 0=normal
    #[serde(default)]
    pub speech_rate: Option<i32>,
    /// Volume: -50 (0.5x) to 100 (2x), 0=normal
    #[serde(default)]
    pub loudness_rate: Option<i32>,
    /// Pitch shift: -12 to 12 semitones
    #[serde(default)]
    pub volc_pitch: Option<i32>,
    /// TTS 2.0 emotional or style context, for example "speak in an especially cheerful tone"
    #[serde(default)]
    pub context_text: Option<String>,
    /// Dialect for vivi voice: dongbei/shaanxi/sichuan
    #[serde(default)]
    pub dialect: Option<String>,
}

fn default_rate() -> String {
    "+0%".into()
}
fn default_volume() -> String {
    "+0%".into()
}
fn default_pitch() -> String {
    "+0Hz".into()
}

impl Default for SynthParams {
    fn default() -> Self {
        Self {
            voice: DEFAULT_VOICE.into(),
            rate: default_rate(),
            volume: default_volume(),
            pitch: default_pitch(),
            emotion: None,
            emotion_scale: None,
            speech_rate: None,
            loudness_rate: None,
            volc_pitch: None,
            context_text: None,
            dialect: None,
        }
    }
}

/// Word/sentence boundary timing info from TTS service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordBoundary {
    pub text: String,
    pub offset_ms: u64,
    pub duration_ms: u64,
}

/// Result from a synthesis call.
#[derive(Debug)]
pub struct SynthResult {
    pub audio: Vec<u8>,
    pub duration_ms: Option<u64>,
    pub boundaries: Vec<WordBoundary>,
}

/// The core trait every TTS backend must implement.
#[async_trait]
pub trait Backend: Send + Sync {
    /// Maximum safe concurrency for this backend.
    fn max_concurrency(&self) -> usize;

    /// List available voices, optionally filtered by language.
    async fn list_voices(&self, lang: Option<&str>) -> Result<Vec<Voice>>;

    /// Synthesize a single text into audio bytes.
    async fn synthesize(&self, text: &str, params: &SynthParams) -> Result<SynthResult>;
}

pub fn create_backend(name: &str) -> Result<Arc<dyn Backend>> {
    match name {
        DEFAULT_BACKEND => Ok(Arc::new(edge::EdgeBackend::new())),
        "volcengine" => Ok(Arc::new(volcengine::VolcengineBackend::new())),
        other => bail!("Unsupported backend: {other}. Available: edge, volcengine"),
    }
}
