use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::backend::WordBoundary;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub segments: Vec<TimelineSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineSegment {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub words: Vec<TimelineWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineWord {
    pub word: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

impl Timeline {
    /// Convert to segment-level boundaries for SRT generation.
    pub fn to_boundaries(&self) -> Vec<WordBoundary> {
        self.segments
            .iter()
            .map(|s| WordBoundary {
                text: s.text.clone(),
                offset_ms: s.start_ms,
                duration_ms: s.end_ms.saturating_sub(s.start_ms),
            })
            .collect()
    }

    /// Write timeline JSON alongside an audio file. Returns the path.
    pub fn write_json(&self, audio_path: &Path) -> Result<String> {
        let json_path = audio_path.with_extension("timeline.json");
        let content =
            serde_json::to_string_pretty(self).context("failed to serialize timeline JSON")?;
        std::fs::write(&json_path, &content)
            .with_context(|| format!("failed to write {}", json_path.display()))?;
        Ok(json_path.to_string_lossy().to_string())
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct FfaOutput {
    #[allow(dead_code)]
    pub(super) duration_ms: u64,
    pub(super) language: String,
    pub(super) units: Vec<FfaUnit>,
}

#[derive(Debug, Deserialize)]
pub(super) struct FfaUnit {
    pub(super) text: String,
    pub(super) start_ms: u64,
    pub(super) end_ms: u64,
}

fn is_punct(c: char) -> bool {
    c.is_ascii_punctuation()
        || matches!(
            c,
            '，' | '。'
                | '！'
                | '？'
                | '；'
                | '：'
                | '、'
                | '\u{201C}'
                | '\u{201D}'
                | '\u{2018}'
                | '\u{2019}'
                | '（'
                | '）'
                | '【'
                | '】'
                | '《'
                | '》'
                | '…'
                | '—'
                | '～'
                | '·'
        )
}

fn is_segment_terminator(c: char) -> bool {
    matches!(
        c,
        '。' | '！' | '？' | '；' | '，' | '.' | '!' | '?' | ';' | '\n'
    )
}

fn is_char_language(lang: &str) -> bool {
    matches!(lang, "zh" | "ja" | "ko")
}

fn content_count(text: &str, is_char_lang: bool) -> usize {
    if is_char_lang {
        text.chars()
            .filter(|c| !is_punct(*c) && !c.is_whitespace())
            .count()
    } else {
        text.split_whitespace().count()
    }
}

fn split_segments(original: &str, is_char_lang: bool) -> Vec<(String, usize)> {
    let mut out = Vec::new();
    let mut buf = String::new();

    let flush = |buf: &mut String, out: &mut Vec<(String, usize)>| {
        let trimmed = buf.trim();
        if trimmed.is_empty() {
            buf.clear();
            return;
        }
        let count = content_count(trimmed, is_char_lang);
        if count > 0 {
            out.push((trimmed.to_string(), count));
        }
        buf.clear();
    };

    for c in original.chars() {
        buf.push(c);
        if is_segment_terminator(c) {
            flush(&mut buf, &mut out);
        }
    }
    flush(&mut buf, &mut out);
    out
}

pub(super) fn build_timeline(ffa: FfaOutput, original_text: &str) -> Timeline {
    let is_char_lang = is_char_language(&ffa.language);
    let segments_raw = split_segments(original_text, is_char_lang);
    let mut unit_iter = ffa.units.into_iter();
    let mut segments = Vec::with_capacity(segments_raw.len());
    let mut last_end_ms: u64 = 0;

    for (seg_text, expected_count) in segments_raw {
        let mut taken: Vec<FfaUnit> = Vec::with_capacity(expected_count);
        for _ in 0..expected_count {
            match unit_iter.next() {
                Some(unit) => taken.push(unit),
                None => break,
            }
        }

        let (start_ms, end_ms) = if taken.is_empty() {
            (last_end_ms, last_end_ms)
        } else {
            let start_ms = taken
                .first()
                .map(|unit| unit.start_ms)
                .unwrap_or(last_end_ms);
            let end_ms = taken
                .last()
                .map(|unit| unit.end_ms.max(unit.start_ms))
                .unwrap_or(last_end_ms);
            (start_ms, end_ms)
        };

        let words = taken
            .into_iter()
            .map(|unit| TimelineWord {
                word: unit.text,
                start_ms: unit.start_ms,
                end_ms: unit.end_ms.max(unit.start_ms),
            })
            .collect();

        last_end_ms = end_ms.max(last_end_ms);
        segments.push(TimelineSegment {
            text: seg_text,
            start_ms,
            end_ms,
            words,
        });
    }

    let leftover: Vec<FfaUnit> = unit_iter.collect();
    if let Some(last) = segments.last_mut() {
        for unit in leftover {
            last.end_ms = last.end_ms.max(unit.end_ms);
            last.words.push(TimelineWord {
                word: unit.text,
                start_ms: unit.start_ms,
                end_ms: unit.end_ms.max(unit.start_ms),
            });
        }
    }

    Timeline { segments }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_count_chinese() {
        assert_eq!(content_count("你好，世界！", true), 4);
    }

    #[test]
    fn content_count_english() {
        assert_eq!(content_count("hello, world!", false), 2);
        assert_eq!(content_count("  one   two three  ", false), 3);
    }

    #[test]
    fn split_segments_chinese_splits_on_comma_and_period() {
        let segs = split_segments("今天天气真不错，我们一起去公园散步吧。", true);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "今天天气真不错，");
        assert_eq!(segs[0].1, 7);
        assert_eq!(segs[1].0, "我们一起去公园散步吧。");
        assert_eq!(segs[1].1, 10);
    }

    #[test]
    fn split_segments_english_no_comma_split() {
        let segs = split_segments("Hello, world. How are you?", false);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "Hello, world.");
        assert_eq!(segs[0].1, 2);
        assert_eq!(segs[1].0, "How are you?");
        assert_eq!(segs[1].1, 3);
    }

    #[test]
    fn split_segments_handles_trailing_no_terminator() {
        let segs = split_segments("没有句号的一句话", true);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].0, "没有句号的一句话");
        assert_eq!(segs[0].1, 8);
    }

    #[test]
    fn split_segments_empty_between_punct() {
        let segs = split_segments("嗯。。，啊。", true);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "嗯。");
        assert_eq!(segs[1].0, "啊。");
    }
}
