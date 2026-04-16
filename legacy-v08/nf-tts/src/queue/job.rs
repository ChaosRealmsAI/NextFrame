//! queue job definitions
use serde::{Deserialize, Serialize};

use crate::backend::SynthParams;

/// A single synthesis job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    /// Job index (for ordering output).
    #[serde(default)]
    pub id: usize,

    /// Text to synthesize.
    pub text: String,

    /// Voice name (optional, falls back to default).
    #[serde(default)]
    pub voice: Option<String>,

    /// Speech rate, e.g. "+20%", "-10%". Edge only.
    #[serde(default)]
    pub rate: Option<String>,

    /// Volume, e.g. "+0%". Edge only.
    #[serde(default)]
    pub volume: Option<String>,

    /// Pitch, e.g. "+0Hz". Edge only.
    #[serde(default)]
    pub pitch: Option<String>,

    /// Backend to use (optional, defaults to "edge").
    #[serde(default)]
    pub backend: Option<String>,

    /// Custom output filename (optional).
    #[serde(default)]
    pub filename: Option<String>,

    /// Emotion (volcengine).
    #[serde(default)]
    pub emotion: Option<String>,

    /// Emotion intensity 1-5 (volcengine).
    #[serde(default)]
    pub emotion_scale: Option<f32>,

    /// Speech speed -50~100 (volcengine).
    #[serde(default)]
    pub speech_rate: Option<i32>,

    /// Volume -50~100 (volcengine).
    #[serde(default)]
    pub loudness_rate: Option<i32>,

    /// Pitch shift -12~12 (volcengine).
    #[serde(default)]
    pub volc_pitch: Option<i32>,

    /// TTS 2.0 context text (volcengine).
    #[serde(default)]
    pub context_text: Option<String>,

    /// Dialect: dongbei/shaanxi/sichuan (volcengine vivi).
    #[serde(default)]
    pub dialect: Option<String>,
}

impl Job {
    pub(crate) fn to_synth_params(&self, default_voice: &str) -> SynthParams {
        SynthParams {
            voice: self
                .voice
                .clone()
                .unwrap_or_else(|| default_voice.to_string()),
            rate: self.rate.clone().unwrap_or_else(|| "+0%".to_string()),
            volume: self.volume.clone().unwrap_or_else(|| "+0%".to_string()),
            pitch: self.pitch.clone().unwrap_or_else(|| "+0Hz".to_string()),
            emotion: self.emotion.clone(),
            emotion_scale: self.emotion_scale,
            speech_rate: self.speech_rate,
            loudness_rate: self.loudness_rate,
            volc_pitch: self.volc_pitch,
            context_text: self.context_text.clone(),
            dialect: self.dialect.clone(),
        }
    }

    pub(crate) fn backend_name(&self, default_backend: &str) -> String {
        self.backend
            .clone()
            .unwrap_or_else(|| default_backend.to_string())
    }
}
