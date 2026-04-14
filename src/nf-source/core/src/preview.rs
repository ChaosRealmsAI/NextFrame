//! Preview timeline schemas and word-timestamp remapping helpers.

use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

use crate::sentence::Sentences;
use crate::time::seconds_to_millis;

/// Self-contained preview manifest consumed by the generated HTML page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PreviewTimelines {
    pub version: String,
    pub title: String,
    pub subtitle: String,
    pub accent: String,
    pub theme: String,
    pub clips: Vec<PreviewClip>,
}

/// One preview clip entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PreviewClip {
    pub clip_num: u32,
    pub title: String,
    pub file: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub duration_sec: f64,
    pub from_id: u32,
    pub to_id: u32,
    pub words: Vec<PreviewWord>,
}

/// One word remapped into clip-local milliseconds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PreviewWord {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

impl PreviewTimelines {
    /// Write `timelines.json` to disk.
    pub fn write_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).context("serialize preview timelines")?,
        )
        .with_context(|| format!("write {}", path.display()))
    }
}

/// Collect and remap words from a sentence-id range into clip-local milliseconds.
pub fn remap_words_to_clip_ms(
    sentences: &Sentences,
    from_id: u32,
    to_id: u32,
    clip_start_sec: f64,
    clip_duration_sec: f64,
) -> Result<Vec<PreviewWord>> {
    if from_id > to_id {
        bail!("invalid clip sentence range: {from_id}..{to_id}");
    }

    let mut remapped = Vec::new();
    let clip_duration_ms = seconds_to_millis(clip_duration_sec);

    for sentence_id in from_id..=to_id {
        let sentence = sentences
            .sentence_by_id(sentence_id)
            .with_context(|| format!("sentence id {} not found", sentence_id))?;

        for word in &sentence.words {
            let start_ms = shift_to_clip_ms(word.start, clip_start_sec, clip_duration_ms);
            let end_ms = shift_to_clip_ms(word.end, clip_start_sec, clip_duration_ms);

            remapped.push(PreviewWord {
                text: word.text.clone(),
                start_ms,
                end_ms: end_ms.max(start_ms),
            });
        }
    }

    Ok(remapped)
}

fn shift_to_clip_ms(source_sec: f64, clip_start_sec: f64, clip_duration_ms: u64) -> u64 {
    if source_sec <= clip_start_sec {
        return 0;
    }

    seconds_to_millis(source_sec - clip_start_sec).min(clip_duration_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Sentence, SentenceSource, Word};

    fn sample_sentences() -> Sentences {
        Sentences {
            version: "1".to_string(),
            source: SentenceSource::WhisperTimestamped,
            model: "base.en".to_string(),
            language: "en".to_string(),
            audio_duration_sec: 20.0,
            total_sentences: 2,
            sentences: vec![
                Sentence {
                    id: 1,
                    start: 0.5,
                    end: 1.1,
                    text: "Hello world.".to_string(),
                    words: vec![
                        Word {
                            text: "Hello".to_string(),
                            start: 0.5,
                            end: 0.8,
                        },
                        Word {
                            text: "world.".to_string(),
                            start: 0.8,
                            end: 1.1,
                        },
                    ],
                },
                Sentence {
                    id: 2,
                    start: 2.0,
                    end: 2.8,
                    text: "This is splice.".to_string(),
                    words: vec![
                        Word {
                            text: "This".to_string(),
                            start: 2.0,
                            end: 2.2,
                        },
                        Word {
                            text: "is".to_string(),
                            start: 2.2,
                            end: 2.4,
                        },
                        Word {
                            text: "splice.".to_string(),
                            start: 2.4,
                            end: 2.8,
                        },
                    ],
                },
            ],
        }
    }

    #[test]
    fn remap_words_rounds_to_clip_local_millis() -> Result<()> {
        let words = remap_words_to_clip_ms(&sample_sentences(), 1, 2, 0.06, 2.74)?;

        assert_eq!(words[0].start_ms, 440);
        assert_eq!(words[0].end_ms, 740);
        assert_eq!(words[4].start_ms, 2340);
        assert_eq!(words[4].end_ms, 2740);
        Ok(())
    }

    #[test]
    fn remap_words_errors_on_missing_sentence() {
        let result = remap_words_to_clip_ms(&sample_sentences(), 1, 3, 0.0, 5.0);
        assert!(result.is_err());
        let Err(error) = result else {
            return;
        };
        assert!(error.to_string().contains("sentence id 3 not found"));
    }

    #[test]
    fn shift_to_clip_ms_clamps_before_clip_and_after_clip() {
        assert_eq!(shift_to_clip_ms(0.5, 1.0, 2500), 0);
        assert_eq!(shift_to_clip_ms(4.0, 1.0, 2500), 2500);
    }
}
