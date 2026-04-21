//! whisper audio alignment entry points
use std::path::Path;

use anyhow::Result;

use super::parse::build_timeline;
use super::process::run_ffa;
use super::Timeline;

/// Align TTS audio to its original text.
///
/// Returns `Ok(Some(Timeline))` on success, `Ok(None)` only if the aligner
/// produced zero segments (e.g. silent audio), and `Err` on hard failure
/// (script missing, Python error, model download failure, etc.).
pub fn align_audio(audio_path: &Path, original_text: &str) -> Result<Option<Timeline>> {
    if original_text.trim().is_empty() {
        return Ok(None);
    }

    let ffa = run_ffa(audio_path, original_text)?;
    if ffa.units.is_empty() {
        return Ok(None);
    }

    let timeline = build_timeline(ffa, original_text);
    if timeline.segments.is_empty() {
        return Ok(None);
    }

    Ok(Some(timeline))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::whisper::parse::{FfaOutput, FfaUnit};

    fn unit(text: &str, s: u64, e: u64) -> FfaUnit {
        FfaUnit {
            text: text.into(),
            start_ms: s,
            end_ms: e,
        }
    }

    fn zh_timeline(units: Vec<FfaUnit>, text: &str) -> Timeline {
        build_timeline(
            FfaOutput {
                duration_ms: 0,
                language: "zh".into(),
                units,
            },
            text,
        )
    }

    #[test]
    fn build_timeline_preserves_punctuation_chinese() {
        let tl = zh_timeline(
            vec![
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
            "今天天气真不错，我们一起去公园散步吧。",
        );
        assert_eq!(tl.segments.len(), 2);
        assert_eq!(tl.segments[0].text, "今天天气真不错，");
        assert_eq!(tl.segments[0].start_ms, 0);
        assert_eq!(tl.segments[0].end_ms, 700);
        assert_eq!(tl.segments[0].words.len(), 7);
        assert_eq!(tl.segments[0].words[0].word, "今");
        assert_eq!(tl.segments[1].text, "我们一起去公园散步吧。");
        assert_eq!(tl.segments[1].start_ms, 800);
        assert_eq!(tl.segments[1].end_ms, 1800);
        assert_eq!(tl.segments[1].words.len(), 10);
    }

    #[test]
    fn build_timeline_handles_missing_units_gracefully() {
        let tl = zh_timeline(vec![unit("你", 0, 200), unit("好", 200, 400)], "你好世界。");
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].text, "你好世界。");
        assert_eq!(tl.segments[0].start_ms, 0);
        assert_eq!(tl.segments[0].end_ms, 400);
        assert_eq!(tl.segments[0].words.len(), 2);
    }

    #[test]
    fn build_timeline_english_word_units() {
        let tl = build_timeline(
            FfaOutput {
                duration_ms: 2500,
                language: "en".into(),
                units: vec![
                    unit("hello", 100, 500),
                    unit("world", 600, 1000),
                    unit("how", 1200, 1400),
                    unit("are", 1400, 1600),
                    unit("you", 1600, 1900),
                ],
            },
            "Hello, world. How are you?",
        );
        assert_eq!(tl.segments.len(), 2);
        assert_eq!(tl.segments[0].text, "Hello, world.");
        assert_eq!(tl.segments[0].start_ms, 100);
        assert_eq!(tl.segments[0].end_ms, 1000);
        assert_eq!(tl.segments[0].words.len(), 2);
        assert_eq!(tl.segments[1].text, "How are you?");
        assert_eq!(tl.segments[1].start_ms, 1200);
        assert_eq!(tl.segments[1].end_ms, 1900);
        assert_eq!(tl.segments[1].words.len(), 3);
    }

    #[test]
    fn build_timeline_to_boundaries_roundtrip() {
        let tl = zh_timeline(
            vec![
                unit("你", 0, 400),
                unit("好", 400, 800),
                unit("世", 1200, 1600),
                unit("界", 1600, 2000),
            ],
            "你好，世界。",
        );
        let bounds = tl.to_boundaries();
        assert_eq!(bounds.len(), 2);
        assert_eq!(bounds[0].text, "你好，");
        assert_eq!(bounds[0].offset_ms, 0);
        assert_eq!(bounds[0].duration_ms, 800);
        assert_eq!(bounds[1].text, "世界。");
        assert_eq!(bounds[1].offset_ms, 1200);
        assert_eq!(bounds[1].duration_ms, 800);
    }

    #[test]
    fn build_timeline_leftover_units_attach_to_last_segment() {
        let tl = zh_timeline(
            vec![
                unit("你", 0, 300),
                unit("好", 300, 600),
                unit("世", 700, 1000),
                unit("界", 1000, 1300),
                unit("！", 1300, 1500),
            ],
            "你好世界",
        );
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].words.len(), 5);
        assert_eq!(tl.segments[0].end_ms, 1500);
    }

    #[test]
    fn build_timeline_empty_units_empty_timeline() {
        let tl = zh_timeline(vec![], "你好世界");
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].words.len(), 0);
    }

    #[test]
    fn build_timeline_multi_segment_zh_long() {
        let tl = zh_timeline(
            vec![
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
            "人工智能的发展速度，大模型让机器强大。",
        );
        assert_eq!(tl.segments.len(), 2);
        assert_eq!(tl.segments[0].text, "人工智能的发展速度，");
        assert_eq!(tl.segments[0].start_ms, 220);
        assert_eq!(tl.segments[0].end_ms, 1521);
        assert_eq!(tl.segments[0].words.len(), 9);
        assert_eq!(tl.segments[1].start_ms, 4146);
        assert_eq!(tl.segments[1].end_ms, 5588);
        assert_eq!(tl.segments[1].text, "大模型让机器强大。");
        assert_eq!(tl.segments[1].words.len(), 8);
    }

    #[test]
    fn build_timeline_accepts_leading_silence() {
        let tl = zh_timeline(vec![unit("你", 300, 600), unit("好", 600, 900)], "你好");
        assert_eq!(tl.segments[0].start_ms, 300);
        assert_eq!(tl.segments[0].end_ms, 900);
    }
}
