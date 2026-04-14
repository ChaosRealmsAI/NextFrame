//! 火山引擎（豆包）TTS backend — seed-tts-2.0
//!
//! 官方 WebSocket API v3，音质远超 Edge TTS，但按量计费（约 ¥2/万字）。
//! 需要环境变量 VOLC_TTS_APP_ID + VOLC_TTS_ACCESS_TOKEN，或使用内置默认值。

mod audio;
mod client;

use anyhow::{bail, Result};
use async_trait::async_trait;
use tokio::time::{timeout, Duration};

use super::{Backend, SynthParams, SynthResult, Voice};
use audio::{detect_sentence_boundaries, get_audio_duration_ms, split_sentences};

const DEFAULT_APP_ID: &str = "1997023739";
const DEFAULT_ACCESS_TOKEN: &str = "RXQjJw1vScxdoZUH9eVK3wKvGXArk-j0";
const DEFAULT_RESOURCE_ID: &str = "seed-tts-2.0";
pub(crate) const DEFAULT_VOICE: &str = "zh_female_vv_uranus_bigtts";

        let timeout_secs = (60 + text.chars().count() as u64 / 10).min(180);
        let audio = timeout(
            Duration::from_secs(timeout_secs),
            self.synthesize_inner(text, params),
        )
        .await
        .map_err(|_| anyhow::anyhow!("火山引擎请求超时（>{timeout_secs}s）"))??;

        if audio.is_empty() {
            bail!("未收到音频数据");
        }

        let sentences = split_sentences(text);
        let boundaries = if sentences.len() > 1 {
            detect_sentence_boundaries(&audio, &sentences).unwrap_or_default()
        } else {
            Vec::new()
        };

        Ok(SynthResult {
            duration_ms: Some(get_audio_duration_ms(&audio)),
            audio,
            boundaries,
        })
    }
}
