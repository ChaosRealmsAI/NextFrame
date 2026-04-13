//! Forced alignment of TTS audio to its own source text.
//!
//! Previous versions of this file ran `mlx-whisper` over the synthesized
//! audio, re-transcribed it, then fuzzy-matched the resulting text back to
//! the original input. Whisper's transcription has its own error rate (it
//! hears "不错" as "不措", hallucinates on long audio, drops characters), and
//! we were carrying a brittle "count content chars, force the original back"
//! hack to paper over it.
//!
//! This module now uses **forced alignment** via whisperX: we already know
//! what was spoken (we fed it to the TTS engine), and whisperX's wav2vec2
//! CTC alignment gives us acoustically-accurate per-character (CJK) or
//! per-word (Latin) timestamps for exactly that text. No transcription step,
//! no text-reconstruction hack. The original text is carried through
//! verbatim — including all punctuation — and whisperX only supplies timing.
//!
//! Public types (`Timeline`, `TimelineSegment`, `TimelineWord`) and the
//! `align_audio(audio_path, original_text)` entry point keep the same shape
//! as before, so callers (synth, scheduler, srt) need no changes.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::backend::WordBoundary;

// ── Public timeline types (unchanged shape) ──────────────────────────────

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

// ── whisperX subprocess ──────────────────────────────────────────────────

/// Path to the Python helper, relative to the vox workspace root.
///
/// We resolve it at runtime by walking up from CARGO_MANIFEST_DIR, with an
/// override via `VOX_ALIGN_SCRIPT` for ad-hoc testing.
fn align_script_path() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("VOX_ALIGN_SCRIPT") {
        let p = std::path::PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }

    // When running from source tree: CARGO_MANIFEST_DIR/scripts/align_ffa.py.
    let manifest = option_env!("CARGO_MANIFEST_DIR");
    if let Some(m) = manifest {
        let candidate = std::path::PathBuf::from(m).join("scripts/align_ffa.py");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // Fallback: same directory as the running binary + ../scripts/align_ffa.py.
    if let Ok(exe) = std::env::current_exe() {
        for parent in exe.ancestors() {
            let candidate = parent.join("scripts/align_ffa.py");
            if candidate.exists() {
                return Some(candidate);
            }
            let candidate = parent.join("vox/scripts/align_ffa.py");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

#[derive(Debug, Deserialize)]
struct FfaOutput {
    #[allow(dead_code)]
    duration_ms: u64,
    language: String,
    units: Vec<FfaUnit>,
}

#[derive(Debug, Deserialize)]
struct FfaUnit {
    text: String,
    start_ms: u64,
    end_ms: u64,
}

/// Run the Python whisperX forced-alignment helper.
///
/// Returns raw unit timings (per character for CJK, per word for Latin),
/// plus the detected/used language.
fn run_ffa(audio_path: &Path, original_text: &str) -> Result<FfaOutput> {
    let script = align_script_path()
        .ok_or_else(|| anyhow!("scripts/align_ffa.py not found (set VOX_ALIGN_SCRIPT)"))?;

    let language = detect_language(original_text).unwrap_or("en");

    let mut child = Command::new("python3")
        .arg(&script)
        .arg(audio_path.as_os_str())
        .arg(language)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to spawn python3 for whisperX alignment")?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(original_text.as_bytes())
            .context("failed to pipe original text to align script")?;
    }

    let output = child
        .wait_with_output()
        .context("failed to wait on whisperX alignment subprocess")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "whisperX alignment failed (exit {:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }

    let stdout = std::str::from_utf8(&output.stdout)
        .context("whisperX alignment output is not valid UTF-8")?
        .trim();

    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "whisperX alignment produced empty output: {}",
            stderr.trim()
        );
    }

    serde_json::from_str::<FfaOutput>(stdout).with_context(|| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!(
            "failed to parse whisperX alignment JSON: {}; stderr: {}",
            stdout,
            stderr.trim()
        )
    })
}

// ── Language + punctuation utilities ─────────────────────────────────────

fn detect_language(text: &str) -> Option<&'static str> {
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

/// Sentence-or-subtitle-line terminator for segmenting.
///
/// We split on full stops (any language) and on CJK commas (because CJK
/// subtitles feel natural in comma-chunked lines). English commas are NOT
/// terminators — otherwise every clause becomes its own line.
fn is_segment_terminator(c: char) -> bool {
    matches!(
        c,
        '。' | '！' | '？' | '；' | '，' | '.' | '!' | '?' | ';' | '\n'
    )
}

fn is_char_language(lang: &str) -> bool {
    matches!(lang, "zh" | "ja" | "ko")
}

/// Count "content units" in a piece of original text.
///
/// - CJK languages: count non-punctuation, non-whitespace characters.
/// - Latin languages: count whitespace-separated words.
///
/// This matches how whisperX emits aligned units per language.
fn content_count(text: &str, is_char_lang: bool) -> usize {
    if is_char_lang {
        text.chars()
            .filter(|c| !is_punct(*c) && !c.is_whitespace())
            .count()
    } else {
        text.split_whitespace().count()
    }
}

/// Split the original text into subtitle segments.
///
/// Each segment carries its original text (including trailing punctuation
/// and leading whitespace trimmed) plus the count of content units it
/// should consume from the aligned-unit stream.
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

// ── Timeline assembly ────────────────────────────────────────────────────

/// Build a `Timeline` by walking the aligned unit stream in lockstep with
/// original-text segments.
fn build_timeline(ffa: FfaOutput, original_text: &str) -> Timeline {
    let is_char_lang = is_char_language(&ffa.language);
    let segments_raw = split_segments(original_text, is_char_lang);

    let mut unit_iter = ffa.units.into_iter();
    let mut segments = Vec::with_capacity(segments_raw.len());
    let mut last_end_ms: u64 = 0;

    for (seg_text, expected_count) in segments_raw {
        let mut taken: Vec<FfaUnit> = Vec::with_capacity(expected_count);
        for _ in 0..expected_count {
            match unit_iter.next() {
                Some(u) => taken.push(u),
                None => break,
            }
        }

        // Even if we couldn't pull any units (whisperX dropped them), we still
        // want to render the segment text. Fall back to synthesized timings
        // that continue from wherever we left off so downstream doesn't crash.
        let (start_ms, end_ms) = if taken.is_empty() {
            (last_end_ms, last_end_ms)
        } else {
            let s = taken.first().map(|u| u.start_ms).unwrap_or(last_end_ms);
            let e = taken
                .last()
                .map(|u| u.end_ms.max(u.start_ms))
                .unwrap_or(last_end_ms);
            (s, e)
        };

        let words: Vec<TimelineWord> = taken
            .into_iter()
            .map(|u| TimelineWord {
                word: u.text,
                start_ms: u.start_ms,
                end_ms: u.end_ms.max(u.start_ms),
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

    // Any leftover units (shouldn't happen, but be graceful): pin them to the
    // last segment so no timing data is silently dropped.
    let leftover: Vec<FfaUnit> = unit_iter.collect();
    if !leftover.is_empty() {
        if let Some(last) = segments.last_mut() {
            for u in leftover {
                last.end_ms = last.end_ms.max(u.end_ms);
                last.words.push(TimelineWord {
                    word: u.text,
                    start_ms: u.start_ms,
                    end_ms: u.end_ms.max(u.start_ms),
                });
            }
        }
    }

    Timeline { segments }
}

// ── Public API ───────────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(text: &str, s: u64, e: u64) -> FfaUnit {
        FfaUnit {
            text: text.into(),
            start_ms: s,
            end_ms: e,
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
        let segs = split_segments("今天天气真不错，我们一起去公园散步吧。", true);
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "今天天气真不错，");
        assert_eq!(segs[0].1, 7); // 今 天 天 气 真 不 错
        assert_eq!(segs[1].0, "我们一起去公园散步吧。");
        assert_eq!(segs[1].1, 10); // 我 们 一 起 去 公 园 散 步 吧
    }

    #[test]
    fn split_segments_english_no_comma_split() {
        let segs = split_segments("Hello, world. How are you?", false);
        // Splits on `.` and `?`, not on `,`.
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "Hello, world.");
        assert_eq!(segs[0].1, 2);
        assert_eq!(segs[1].0, "How are you?");
        assert_eq!(segs[1].1, 3);
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
        let tl = build_timeline(ffa, "今天天气真不错，我们一起去公园散步吧。");
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
        // whisperX dropped the last two characters — we still render the segment.
        let ffa = FfaOutput {
            duration_ms: 2000,
            language: "zh".into(),
            units: vec![
                unit("你", 0, 200),
                unit("好", 200, 400),
                // "世" and "界" missing
            ],
        };
        let tl = build_timeline(ffa, "你好世界。");
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].text, "你好世界。");
        assert_eq!(tl.segments[0].start_ms, 0);
        assert_eq!(tl.segments[0].end_ms, 400);
        assert_eq!(tl.segments[0].words.len(), 2);
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
        let tl = build_timeline(ffa, "Hello, world. How are you?");
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
        let tl = build_timeline(ffa, "你好，世界。");
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
        let ffa = FfaOutput {
            duration_ms: 1500,
            language: "zh".into(),
            units: vec![
                unit("你", 0, 300),
                unit("好", 300, 600),
                unit("世", 700, 1000),
                unit("界", 1000, 1300),
                // Spurious extra unit
                unit("！", 1300, 1500),
            ],
        };
        let tl = build_timeline(ffa, "你好世界");
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].words.len(), 5);
        assert_eq!(tl.segments[0].end_ms, 1500);
    }

    #[test]
    fn build_timeline_empty_units_empty_timeline() {
        let ffa = FfaOutput {
            duration_ms: 0,
            language: "zh".into(),
            units: vec![],
        };
        let tl = build_timeline(ffa, "你好世界");
        // With no units at all, segment still exists but has no words and
        // collapsed start/end.
        assert_eq!(tl.segments.len(), 1);
        assert_eq!(tl.segments[0].words.len(), 0);
    }

    #[test]
    fn build_timeline_multi_segment_zh_long() {
        // Two comma/period chunks with a pause gap between them — mirrors
        // what whisperX emits on real TTS output.
        let ffa = FfaOutput {
            duration_ms: 15_744,
            language: "zh".into(),
            units: vec![
                // seg 0: 人工智能的发展速度 (9 chars, contiguous)
                unit("人", 220, 421),
                unit("工", 421, 601),
                unit("智", 601, 721),
                unit("能", 721, 841),
                unit("的", 841, 941),
                unit("发", 941, 1081),
                unit("展", 1081, 1222),
                unit("速", 1222, 1401),
                unit("度", 1401, 1521),
                // seg 1: 大模型让机器强大 (8 chars, resumes after pause)
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
        let tl = build_timeline(
            ffa,
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
        // Edge TTS often starts speech ~200ms in. First unit start > 0 is fine.
        let ffa = FfaOutput {
            duration_ms: 1500,
            language: "zh".into(),
            units: vec![unit("你", 300, 600), unit("好", 600, 900)],
        };
        let tl = build_timeline(ffa, "你好");
        assert_eq!(tl.segments[0].start_ms, 300);
        assert_eq!(tl.segments[0].end_ms, 900);
    }

    #[test]
    fn split_segments_handles_trailing_no_terminator() {
        // Text without any terminating punctuation still produces one segment.
        let segs = split_segments("没有句号的一句话", true);
        assert_eq!(segs.len(), 1);
        assert_eq!(segs[0].0, "没有句号的一句话");
        assert_eq!(segs[0].1, 8);
    }

    #[test]
    fn split_segments_empty_between_punct() {
        // Adjacent terminators shouldn't produce empty segments.
        let segs = split_segments("嗯。。，啊。", true);
        // Only two content-bearing segments: "嗯。" and "啊。"
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].0, "嗯。");
        assert_eq!(segs[1].0, "啊。");
    }
}
