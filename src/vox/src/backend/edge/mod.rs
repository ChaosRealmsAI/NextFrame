mod drm;
mod ssml;
mod ws;

use anyhow::Result;
use async_trait::async_trait;

use super::{Backend, SynthParams, SynthResult, Voice};

pub struct EdgeBackend;

impl EdgeBackend {
    pub fn new() -> Self {
        Self
    }
}

impl Default for EdgeBackend {
    fn default() -> Self {
        Self::new()
    }
}

const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL: &str = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const CHROMIUM_FULL_VERSION: &str = "143.0.3650.75";

#[async_trait]
impl Backend for EdgeBackend {
    fn max_concurrency(&self) -> usize {
        3
    }

    async fn list_voices(&self, lang: Option<&str>) -> Result<Vec<Voice>> {
        let voices = ws::fetch_voices_list().await?;
        match lang {
            Some(l) => {
                let l = l.to_lowercase();
                Ok(voices
                    .into_iter()
                    .filter(|v| {
                        v.locale.to_lowercase().starts_with(&l) || v.language.to_lowercase() == l
                    })
                    .collect())
            }
            None => Ok(voices),
        }
    }

    async fn synthesize(&self, text: &str, params: &SynthParams) -> Result<SynthResult> {
        ws::synthesize(text, params).await
    }
}
