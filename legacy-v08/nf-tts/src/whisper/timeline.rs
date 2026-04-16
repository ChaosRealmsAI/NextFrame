//! whisper timeline models
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::backend::WordBoundary;

use super::aligner::{FfaOutput, FfaUnit};

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
    pub fn to_boundaries(&self) -> Vec<WordBoundary> {
        self.segments
            .iter()
            .map(|segment| WordBoundary {
                text: segment.text.clone(),
                offset_ms: segment.start_ms,
                duration_ms: segment.end_ms.saturating_sub(segment.start_ms),
            })
            .collect()
    }

    pub fn write_json(&self, audio_path: &Path) -> Result<String> {
        let json_path = audio_path.with_extension("timeline.json");
        let content =
            serde_json::to_string_pretty(self).context("failed to serialize timeline JSON")?;
        std::fs::write(&json_path, &content)
            .with_context(|| format!("failed to write {}", json_path.display()))?;
        Ok(json_path.to_string_lossy().to_string())
    }
}

pub(super) fn detect_language(text: &str) -> Option<&'static str> {
    let mut cjk = 0u32;
    let mut jp = 0u32;
    let mut kr = 0u32;
    let mut total = 0u32;

    for ch in text.chars() {
        if !ch.is_alphabetic() {
            continue;
        }
        total += 1;
        match ch as u32 {
            0x4E00..=0x9FFF => cjk += 1,
            0x3040..=0x30FF => jp += 1,
            0xAC00..=0xD7AF | 0x1100..=0x11FF => kr += 1,
            _ => {}
        }
    }

    if total == 0 {
        return None;
    }
    if jp > 0 {
        return Some("ja");
    }
    if kr > 0 {
        return Some("ko");
    }
    if cjk * 100 / total > 30 {
        return Some("zh");
    }
    Some("en")
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
    let mut last_end_ms = 0u64;

    for (seg_text, expected_count) in segments_raw {
        let mut taken = Vec::with_capacity(expected_count);
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
    if !leftover.is_empty() {
        if let Some(last_segment) = segments.last_mut() {
            for unit in leftover {
                last_segment.end_ms = last_segment.end_ms.max(unit.end_ms);
                last_segment.words.push(TimelineWord {
                    word: unit.text,
                    start_ms: unit.start_ms,
                    end_ms: unit.end_ms.max(unit.start_ms),
                });
            }
        }
    }

    Timeline { segments }
}

#[cfg(test)]
mod tests {
    use super::{build_timeline, content_count, detect_language, split_segments};
    use crate::whisper::aligner::{FfaOutput, FfaUnit};

    fn unit(text: &str, start_ms: u64, end_ms: u64) -> FfaUnit {
        FfaUnit {
            text: text.into(),
            start_ms,
            end_ms,
        }
    }

    #[test]
    fn detect_language_chinese() {
        assert_eq!(detect_language("你好世界"), Some("zh"));
    }

    #[test]
    fn detect_language_english() {
        assert_eq!(detect_language("hello world"), Some("en"));
    }

    #[test]
    fn detect_language_japanese() {
        assert_eq!(detect_language("こんにちは"), Some("ja"));
    }

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
        let segments = split_segments("今天天气真不错，我们一起去公园散步吧。", true);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].0, "今天天气真不错，");
        assert_eq!(segments[0].1, 7);
        assert_eq!(segments[1].0, "我们一起去公园散步吧。");
        assert_eq!(segments[1].1, 10);
    }

    #[test]
    fn split_segments_english_no_comma_split() {
        let segments = split_segments("Hello, world. How are you?", false);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].0, "Hello, world.");
        assert_eq!(segments[0].1, 2);
        assert_eq!(segments[1].0, "How are you?");
        assert_eq!(segments[1].1, 3);
    }

    #[test]
    fn build_timeline_preserves_punctuation_chinese() {
        let ffa = FfaOutput {
            duration_ms: 3200,
            language: "zh".into(),
            units: vec![
                unit("今", 0, 100),
                unit("天", 100, 200),
                unit("天", 200, 300),
                unit("气", 300, 400),
                unit("真", 400, 500),
                unit("不", 500, 600),
                unit("错", 600, 700),
                unit("我", 800, 900),
                unit("们", 900, 1000),
                unit("一", 1000, 1100),
                unit("起", 1100, 1200),
                unit("去", 1200, 1300),
                unit("公", 1300, 1400),
                unit("园", 1400, 1500),
                unit("散", 1500, 1600),
                unit("步", 1600, 1700),
                unit("吧", 1700, 1800),
            ],
        };
        let timeline = build_timeline(ffa, "今天天气真不错，我们一起去公园散步吧。");
        assert_eq!(timeline.segments.len(), 2);
        assert_eq!(timeline.segments[0].text, "今天天气真不错，");
        assert_eq!(timeline.segments[0].start_ms, 0);
        assert_eq!(timeline.segments[0].end_ms, 700);
        assert_eq!(timeline.segments[0].words.len(), 7);
        assert_eq!(timeline.segments[0].words[0].word, "今");
        assert_eq!(timeline.segments[1].text, "我们一起去公园散步吧。");
        assert_eq!(timeline.segments[1].start_ms, 800);
        assert_eq!(timeline.segments[1].end_ms, 1800);
        assert_eq!(timeline.segments[1].words.len(), 10);
    }

    #[test]
    fn build_timeline_handles_missing_units_gracefully() {
        let ffa = FfaOutput {
            duration_ms: 2000,
            language: "zh".into(),
            units: vec![unit("你", 0, 200), unit("好", 200, 400)],
        };
        let timeline = build_timeline(ffa, "你好世界。");
        assert_eq!(timeline.segments.len(), 1);
        assert_eq!(timeline.segments[0].text, "你好世界。");
        assert_eq!(timeline.segments[0].start_ms, 0);
        assert_eq!(timeline.segments[0].end_ms, 400);
        assert_eq!(timeline.segments[0].words.len(), 2);
    }

    #[test]
    fn build_timeline_english_word_units() {
        let ffa = FfaOutput {
            duration_ms: 2500,
            language: "en".into(),
            units: vec![
                unit("hello", 100, 500),
                unit("world", 600, 1000),
                unit("how", 1200, 1400),
                unit("are", 1400, 1600),
                unit("you", 1600, 1900),
            ],
        };
        let timeline = build_timeline(ffa, "Hello, world. How are you?");
        assert_eq!(timeline.segments.len(), 2);
        assert_eq!(timeline.segments[0].text, "Hello, world.");
        assert_eq!(timeline.segments[0].start_ms, 100);
        assert_eq!(timeline.segments[0].end_ms, 1000);
        assert_eq!(timeline.segments[0].words.len(), 2);
        assert_eq!(timeline.segments[1].text, "How are you?");
        assert_eq!(timeline.segments[1].start_ms, 1200);
        assert_eq!(timeline.segments[1].end_ms, 1900);
        assert_eq!(timeline.segments[1].words.len(), 3);
    }

    #[test]
    fn build_timeline_to_boundaries_roundtrip() {
        let ffa = FfaOutput {
            duration_ms: 2000,
            language: "zh".into(),
            units: vec![
                unit("你", 0, 400),
                unit("好", 400, 800),
                unit("世", 1200, 1600),
                unit("界", 1600, 2000),
            ],
        };
        let timeline = build_timeline(ffa, "你好，世界。");
        let boundaries = timeline.to_boundaries();
        assert_eq!(boundaries.len(), 2);
        assert_eq!(boundaries[0].text, "你好，");
        assert_eq!(boundaries[0].offset_ms, 0);
        assert_eq!(boundaries[0].duration_ms, 800);
        assert_eq!(boundaries[1].text, "世界。");
        assert_eq!(boundaries[1].offset_ms, 1200);
        assert_eq!(boundaries[1].duration_ms, 800);
    }

    #[test]
    fn build_timeline_leftover_units_attach_to_last_segment() {
        let ffa = FfaOutput {
            duration_ms: 1500,
            language: "zh".into(),
            units: vec![
                unit("你", 0, 300),
                unit("好", 300, 600),
                unit("世", 700, 1000),
                unit("界", 1000, 1300),
                unit("！", 1300, 1500),
            ],
        };
        let timeline = build_timeline(ffa, "你好世界");
        assert_eq!(timeline.segments.len(), 1);
        assert_eq!(timeline.segments[0].words.len(), 5);
        assert_eq!(timeline.segments[0].end_ms, 1500);
    }

    #[test]
    fn build_timeline_empty_units_empty_timeline() {
        let ffa = FfaOutput {
            duration_ms: 0,
            language: "zh".into(),
            units: vec![],
        };
        let timeline = build_timeline(ffa, "你好世界");
        assert_eq!(timeline.segments.len(), 1);
        assert_eq!(timeline.segments[0].words.len(), 0);
    }

    #[test]
    fn build_timeline_multi_segment_zh_long() {
        let ffa = FfaOutput {
            duration_ms: 15_744,
            language: "zh".into(),
            units: vec![
                unit("人", 220, 421),
                unit("工", 421, 601),
                unit("智", 601, 721),
                unit("能", 721, 841),
                unit("的", 841, 941),
                unit("发", 941, 1081),
                unit("展", 1081, 1222),
                unit("速", 1222, 1401),
                unit("度", 1401, 1521),
                unit("大", 4146, 4206),
                unit("模", 4206, 4387),
                unit("型", 4387, 4727),
                unit("让", 4727, 4868),
                unit("机", 4868, 5028),
                unit("器", 5028, 5188),
                unit("强", 5188, 5388),
                unit("大", 5388, 5588),
            ],
        };
        let timeline = build_timeline(ffa, "人工智能的发展速度，大模型让机器强大。");
        assert_eq!(timeline.segments.len(), 2);
        assert_eq!(timeline.segments[0].text, "人工智能的发展速度，");
        assert_eq!(timeline.segments[0].start_ms, 220);
        assert_eq!(timeline.segments[0].end_ms, 1521);
        assert_eq!(timeline.segments[0].words.len(), 9);
        assert_eq!(timeline.segments[1].start_ms, 4146);
        assert_eq!(timeline.segments[1].end_ms, 5588);
        assert_eq!(timeline.segments[1].text, "大模型让机器强大。");
        assert_eq!(timeline.segments[1].words.len(), 8);
    }

    #[test]
    fn build_timeline_accepts_leading_silence() {
        let ffa = FfaOutput {
            duration_ms: 1500,
            language: "zh".into(),
            units: vec![unit("你", 300, 600), unit("好", 600, 900)],
        };
        let timeline = build_timeline(ffa, "你好");
        assert_eq!(timeline.segments[0].start_ms, 300);
        assert_eq!(timeline.segments[0].end_ms, 900);
    }

    #[test]
    fn split_segments_handles_trailing_no_terminator() {
        let segments = split_segments("没有句号的一句话", true);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].0, "没有句号的一句话");
        assert_eq!(segments[0].1, 8);
    }

    #[test]
    fn split_segments_empty_between_punct() {
        let segments = split_segments("嗯。。，啊。", true);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].0, "嗯。");
        assert_eq!(segments[1].0, "啊。");
    }
}
