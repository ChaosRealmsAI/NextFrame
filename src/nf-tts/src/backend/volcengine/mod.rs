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

/// 可用的豆包音色（与火山引擎控制台实际开通的声音同步）
const VOICES: &[(&str, &str, &str)] = &[
    ("zh_female_vv_uranus_bigtts", "zh-CN", "Female"),
    ("zh_female_xiaohe_uranus_bigtts", "zh-CN", "Female"),
    ("zh_male_m191_uranus_bigtts", "zh-CN", "Male"),
    ("zh_male_taocheng_uranus_bigtts", "zh-CN", "Male"),
    ("en_male_tim_uranus_bigtts", "en-US", "Male"),
    ("saturn_zh_female_cancan_tob", "zh-CN", "Female"),
    ("saturn_zh_female_keainvsheng_tob", "zh-CN", "Female"),
    ("saturn_zh_female_tiaopigongzhu_tob", "zh-CN", "Female"),
    ("saturn_zh_male_shuanglangshaonian_tob", "zh-CN", "Male"),
    ("saturn_zh_male_tiancaitongzhuo_tob", "zh-CN", "Male"),
];

pub struct VolcengineBackend {
    app_id: String,
    access_token: String,
    resource_id: String,
}

impl VolcengineBackend {
    pub fn new() -> Self {
        Self {
            app_id: std::env::var("VOLC_TTS_APP_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_APP_ID.to_string()),
            access_token: std::env::var("VOLC_TTS_ACCESS_TOKEN")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_ACCESS_TOKEN.to_string()),
            resource_id: DEFAULT_RESOURCE_ID.to_string(),
        }
    }
}

impl Default for VolcengineBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Backend for VolcengineBackend {
    fn max_concurrency(&self) -> usize {
        2
    }

    async fn list_voices(&self, lang: Option<&str>) -> Result<Vec<Voice>> {
        let voices: Vec<Voice> = VOICES
            .iter()
            .map(|(name, locale, gender)| Voice {
                name: (*name).to_string(),
                short_name: (*name).to_string(),
                locale: (*locale).to_string(),
                language: locale.split('-').next().unwrap_or("zh").to_string(),
                gender: (*gender).to_string(),
            })
            .collect();

        match lang {
            Some(lang) => {
                let lang = lang.to_lowercase();
                Ok(voices
                    .into_iter()
                    .filter(|voice| {
                        voice.locale.to_lowercase().starts_with(&lang)
                            || voice.language.to_lowercase() == lang
                    })
                    .collect())
            }
            None => Ok(voices),
        }
    }

    async fn synthesize(&self, text: &str, params: &SynthParams) -> Result<SynthResult> {
        if text.trim().is_empty() {
            bail!("输入文本为空");
        }

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
