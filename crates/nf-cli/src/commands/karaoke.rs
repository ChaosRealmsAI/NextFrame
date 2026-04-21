//! `nf karaoke <episode-dir>`
//!
//! One-shot generate `<episode-dir>/clips/index.html` — bilingual (en + zh)
//! word-level karaoke player covering all clips for the episode. Self-contained:
//! data inlined as JS constant, HTML template embedded in the binary via
//! `include_str!`. **No `fetch()`** — works under `file://` per v1.12 lesson.
//!
//! Mirrors the v1.12.2 nf-tts karaoke pattern (`src/nf-tts/src/output/karaoke.rs`).
//!
//! Inputs (relative to `<episode-dir>`):
//!   - `sources/<slug>/words.json`          · `{total_words, words:[{text,start,end}]}` (seconds)
//!   - `clips/cut_report.json`              · `{success:[{clip_num,start,end,file,title,duration,...}]}` (seconds)
//!   - `clips/clip_NN.translations.zh.json` · `{clip_num,lang,segments:[{id,en,start,end,cn:[{text,start,end}]}]}` (seconds)
//!
//! The `<slug>` is auto-detected from `plan.json` (`source` field) or, if
//! absent, picked as the first subdirectory of `sources/` that contains a
//! `words.json`.
//!
//! Timing logic:
//!   - **En word filter (per segment)**: keep words where
//!     `seg.start - 0.1 <= w.start && w.end <= seg.end + 0.1` (source seconds).
//!   - **Reset to clip-relative ms**: `((src_s - clip.start) * 1000) as u32`, clamped ≥ 0.
//!   - **Zh char interpolation**: per cn cue `dur = (end - start) / char_count`
//!     → each char gets `[cs + i*dur, cs + (i+1)*dur]` ms.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::CliError;
use crate::io_json;

const TEMPLATE: &str = include_str!("karaoke_template.html");

// ============ Output data shapes (shipped into the HTML via JSON) ============

#[derive(Serialize, Debug)]
pub struct KaraokeData {
    pub clips: Vec<KaraokeClip>,
}

#[derive(Serialize, Debug)]
pub struct KaraokeClip {
    pub id: u32,
    pub title: String,
    pub file: String,
    pub sub: String,
    pub duration_s: f64,
    pub segments: Vec<KaraokeSegment>,
}

#[derive(Serialize, Debug)]
pub struct KaraokeSegment {
    pub start_ms: u32,
    pub end_ms: u32,
    pub en: String,
    pub en_words: Vec<TimedText>,
    pub cn: Vec<TimedText>,
    pub zh_chars: Vec<TimedText>,
}

#[derive(Serialize, Debug)]
pub struct TimedText {
    pub text: String,
    pub start_ms: u32,
    pub end_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sp: Option<bool>,
}

// ============ Input data shapes ============

#[derive(Deserialize, Debug)]
struct WordsFile {
    words: Vec<SrcWord>,
}

#[derive(Deserialize, Debug, Clone)]
struct SrcWord {
    text: String,
    start: f64,
    end: f64,
}

#[derive(Deserialize, Debug)]
struct CutReport {
    success: Vec<CutEntry>,
}

#[derive(Deserialize, Debug)]
struct CutEntry {
    clip_num: u32,
    title: String,
    start: f64,
    #[serde(default)]
    #[allow(dead_code)]
    end: f64,
    duration: f64,
    file: String,
    #[serde(default)]
    text_preview: String,
}

#[derive(Deserialize, Debug)]
struct TranslationFile {
    #[serde(default)]
    #[allow(dead_code)]
    clip_num: u32,
    segments: Vec<TransSegment>,
}

#[derive(Deserialize, Debug)]
struct TransSegment {
    #[serde(default)]
    #[allow(dead_code)]
    id: u32,
    en: String,
    start: f64,
    end: f64,
    cn: Vec<CnCue>,
}

#[derive(Deserialize, Debug)]
struct CnCue {
    text: String,
    start: f64,
    end: f64,
}

// ============ Entry ============

pub fn run(episode_dir: &Path) -> Result<(), CliError> {
    if !episode_dir.is_dir() {
        return Err(CliError::UserInput {
            code: "E_EPISODE_MISSING",
            message: format!("episode directory not found: {}", episode_dir.display()),
            hint: Some("Pass a directory that contains sources/<slug>/words.json + clips/cut_report.json.".into()),
        });
    }

    let clips_dir = episode_dir.join("clips");
    let sources_dir = episode_dir.join("sources");

    // 1. Detect source slug → load words.json
    let slug = detect_source_slug(episode_dir, &sources_dir)?;
    let words_path = sources_dir.join(&slug).join("words.json");
    let all_words = load_words(&words_path)?;

    // 2. Load cut_report.json
    let cut_report_path = clips_dir.join("cut_report.json");
    let cut_report = load_cut_report(&cut_report_path)?;

    if cut_report.success.is_empty() {
        return Err(CliError::UserInput {
            code: "E_NO_CLIPS",
            message: format!(
                "cut_report.json at {} has empty `success` list",
                cut_report_path.display()
            ),
            hint: Some("Run the clip cutter first to produce clip_NN.mp4 + cut_report.json.".into()),
        });
    }

    // 3. For each clip: load translation, build segments
    let mut clips = Vec::with_capacity(cut_report.success.len());
    for entry in &cut_report.success {
        let trans_path = clips_dir.join(format!("clip_{:02}.translations.zh.json", entry.clip_num));
        let trans = load_translation(&trans_path)?;

        let segments = build_segments(&trans, entry, &all_words.words);

        // `file` in cut_report is absolute; we want relative for the HTML (same dir as index.html).
        let file_rel = Path::new(&entry.file)
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| entry.file.clone());

        let sub = derive_sub(&entry.text_preview);

        clips.push(KaraokeClip {
            id: entry.clip_num,
            title: entry.title.clone(),
            file: file_rel,
            sub,
            duration_s: entry.duration,
            segments,
        });
    }

    let data = KaraokeData { clips };
    let data_json = serde_json::to_string(&data).map_err(|e| CliError::Internal {
        code: "E_SERIALIZE",
        message: format!("failed to serialize karaoke data: {e}"),
        hint: None,
    })?;

    let html = TEMPLATE.replace("{{DATA_JSON}}", &data_json);

    let out_path = clips_dir.join("index.html");
    std::fs::write(&out_path, &html)
        .map_err(|e| CliError::io_write(&out_path.to_string_lossy(), e))?;

    io_json::emit_ok(&serde_json::json!({
        "out": out_path.to_string_lossy(),
        "bytes": html.len(),
        "clips": data.clips.len(),
        "segments": data.clips.iter().map(|c| c.segments.len()).sum::<usize>(),
    }));
    Ok(())
}

// ============ Helpers ============

/// Auto-detect `<slug>` from `<episode>/plan.json` (field `source`) or fall back
/// to the first `sources/*/` subdir containing `words.json`.
fn detect_source_slug(episode_dir: &Path, sources_dir: &Path) -> Result<String, CliError> {
    // Primary: plan.json
    let plan_path = episode_dir.join("plan.json");
    if plan_path.is_file() {
        let bytes = std::fs::read(&plan_path)
            .map_err(|e| CliError::io_read(&plan_path.to_string_lossy(), e))?;
        if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
            if let Some(s) = v.get("source").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    return Ok(s.to_string());
                }
            }
        }
    }

    // Fallback: scan sources/
    if !sources_dir.is_dir() {
        return Err(CliError::UserInput {
            code: "E_SOURCES_MISSING",
            message: format!("sources/ not found under {}", episode_dir.display()),
            hint: Some("Expect <episode>/sources/<slug>/words.json.".into()),
        });
    }
    let entries = std::fs::read_dir(sources_dir)
        .map_err(|e| CliError::io_read(&sources_dir.to_string_lossy(), e))?;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() && p.join("words.json").is_file() {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                return Ok(name.to_string());
            }
        }
    }
    Err(CliError::UserInput {
        code: "E_SOURCE_SLUG",
        message: "could not detect source slug (no plan.json `source` field and no sources/<slug>/words.json found)".into(),
        hint: Some("Create <episode>/plan.json with `source: <slug>` or place words.json under sources/<slug>/.".into()),
    })
}

fn load_words(path: &Path) -> Result<WordsFile, CliError> {
    let bytes = std::fs::read(path).map_err(|e| CliError::io_read(&path.to_string_lossy(), e))?;
    serde_json::from_slice(&bytes).map_err(|e| CliError::UserInput {
        code: "E_WORDS_PARSE",
        message: format!("cannot parse {}: {e}", path.display()),
        hint: Some("Expect {total_words, words:[{text,start,end}]}.".into()),
    })
}

fn load_cut_report(path: &Path) -> Result<CutReport, CliError> {
    let bytes = std::fs::read(path).map_err(|e| CliError::io_read(&path.to_string_lossy(), e))?;
    serde_json::from_slice(&bytes).map_err(|e| CliError::UserInput {
        code: "E_CUT_REPORT_PARSE",
        message: format!("cannot parse {}: {e}", path.display()),
        hint: Some("Expect {success:[{clip_num,start,end,file,title,duration,...}]}.".into()),
    })
}

fn load_translation(path: &Path) -> Result<TranslationFile, CliError> {
    let bytes = std::fs::read(path).map_err(|e| CliError::io_read(&path.to_string_lossy(), e))?;
    serde_json::from_slice(&bytes).map_err(|e| CliError::UserInput {
        code: "E_TRANSLATION_PARSE",
        message: format!("cannot parse {}: {e}", path.display()),
        hint: Some("Expect {clip_num,lang,segments:[{id,en,start,end,cn:[{text,start,end}]}]}.".into()),
    })
}

/// Build the per-clip segments (en words + cn cues + zh char interpolation).
fn build_segments(
    trans: &TranslationFile,
    clip: &CutEntry,
    all_words: &[SrcWord],
) -> Vec<KaraokeSegment> {
    trans
        .segments
        .iter()
        .map(|seg| build_segment(seg, clip, all_words))
        .collect()
}

fn build_segment(seg: &TransSegment, clip: &CutEntry, all_words: &[SrcWord]) -> KaraokeSegment {
    // Seg boundary in source seconds — used for en-word filter (±0.1s slack).
    let seg_lo = seg.start - 0.1;
    let seg_hi = seg.end + 0.1;

    // 1. Filter + reset en_words to clip-relative ms.
    let en_words: Vec<TimedText> = all_words
        .iter()
        .filter(|w| w.start >= seg_lo && w.end <= seg_hi)
        .map(|w| TimedText {
            text: w.text.clone(),
            start_ms: to_clip_ms(w.start, clip.start),
            end_ms: to_clip_ms(w.end, clip.start),
            sp: None,
        })
        .collect();

    // 2. Cn cues → clip-relative ms (as rendered block timings).
    let cn: Vec<TimedText> = seg
        .cn
        .iter()
        .map(|c| TimedText {
            text: c.text.clone(),
            start_ms: to_clip_ms(c.start, clip.start),
            end_ms: to_clip_ms(c.end, clip.start),
            sp: None,
        })
        .collect();

    // 3. Zh char-level interpolation: for each cue, distribute chars linearly.
    let mut zh_chars: Vec<TimedText> = Vec::new();
    for cue in &seg.cn {
        let cs = to_clip_ms(cue.start, clip.start) as f64;
        let ce = to_clip_ms(cue.end, clip.start) as f64;
        let chars: Vec<char> = cue.text.chars().collect();
        if chars.is_empty() {
            continue;
        }
        let dur = (ce - cs).max(0.0) / chars.len() as f64;
        for (i, ch) in chars.iter().enumerate() {
            let s = cs + i as f64 * dur;
            let e = cs + (i as f64 + 1.0) * dur;
            let is_sp = ch.is_whitespace();
            zh_chars.push(TimedText {
                text: ch.to_string(),
                start_ms: s.round() as u32,
                end_ms: e.round() as u32,
                sp: if is_sp { Some(true) } else { None },
            });
        }
    }

    KaraokeSegment {
        start_ms: to_clip_ms(seg.start, clip.start),
        end_ms: to_clip_ms(seg.end, clip.start),
        en: seg.en.clone(),
        en_words,
        cn,
        zh_chars,
    }
}

/// Convert a source-seconds timestamp to clip-relative milliseconds (clamped ≥ 0).
fn to_clip_ms(src_s: f64, clip_start_s: f64) -> u32 {
    let rel_ms = (src_s - clip_start_s) * 1000.0;
    if rel_ms < 0.0 {
        0
    } else {
        rel_ms.round() as u32
    }
}

/// Best-effort sub-title extraction: first 32 chars of the preview (no newline).
fn derive_sub(preview: &str) -> String {
    let clean: String = preview.chars().filter(|c| *c != '\n' && *c != '\r').collect();
    let trimmed = clean.trim();
    if trimmed.chars().count() <= 32 {
        trimmed.to_string()
    } else {
        let take: String = trimmed.chars().take(32).collect();
        format!("{take}…")
    }
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]

    use super::*;
    use std::fs;

    fn sample_words() -> Vec<SrcWord> {
        vec![
            SrcWord {
                text: "Hello".into(),
                start: 10.0,
                end: 10.5,
            },
            SrcWord {
                text: "world.".into(),
                start: 10.6,
                end: 11.0,
            },
            // Out of segment boundary (should be filtered)
            SrcWord {
                text: "Unrelated".into(),
                start: 20.0,
                end: 20.5,
            },
        ]
    }

    fn sample_clip(start: f64, duration: f64) -> CutEntry {
        CutEntry {
            clip_num: 1,
            title: "t".into(),
            start,
            end: start + duration,
            duration,
            file: "/abs/path/clip_01.mp4".into(),
            text_preview: "Hello world.".into(),
        }
    }

    fn sample_trans() -> TranslationFile {
        TranslationFile {
            clip_num: 1,
            segments: vec![TransSegment {
                id: 1,
                en: "Hello world.".into(),
                start: 10.0,
                end: 11.0,
                cn: vec![CnCue {
                    text: "你好世界".into(),
                    start: 10.0,
                    end: 11.0,
                }],
            }],
        }
    }

    #[test]
    fn builds_segment_filters_en_words_and_interpolates_zh_chars() {
        let words = sample_words();
        let clip = sample_clip(9.5, 2.0); // clip starts at 9.5s → 10.0s src = 500ms clip-relative
        let trans = sample_trans();
        let seg = build_segment(&trans.segments[0], &clip, &words);

        // En words: only "Hello" + "world." survive the ±0.1 filter (Unrelated at 20s dropped)
        assert_eq!(seg.en_words.len(), 2);
        assert_eq!(seg.en_words[0].text, "Hello");
        assert_eq!(seg.en_words[0].start_ms, 500); // (10.0 - 9.5) * 1000
        assert_eq!(seg.en_words[1].text, "world.");
        assert_eq!(seg.en_words[1].start_ms, 1100); // (10.6 - 9.5) * 1000

        // Zh chars: "你好世界" = 4 chars evenly distributed over 1000 ms starting at 500ms
        assert_eq!(seg.zh_chars.len(), 4);
        assert_eq!(seg.zh_chars[0].text, "你");
        assert_eq!(seg.zh_chars[0].start_ms, 500);
        assert_eq!(seg.zh_chars[3].text, "界");
        assert!(seg.zh_chars[3].end_ms >= 1490 && seg.zh_chars[3].end_ms <= 1510);

        // Cn cues preserved with clip-relative ms
        assert_eq!(seg.cn.len(), 1);
        assert_eq!(seg.cn[0].text, "你好世界");
        assert_eq!(seg.cn[0].start_ms, 500);
    }

    #[test]
    fn to_clip_ms_clamps_negative_to_zero() {
        assert_eq!(to_clip_ms(9.4, 10.0), 0); // earlier than clip start → 0
        assert_eq!(to_clip_ms(10.0, 10.0), 0);
        assert_eq!(to_clip_ms(10.5, 10.0), 500);
        assert_eq!(to_clip_ms(11.0, 10.0), 1000);
    }

    #[test]
    fn run_end_to_end_on_minimal_episode() {
        let tmp = std::env::temp_dir().join(format!("nf-cli-karaoke-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        // sources/<slug>/words.json
        let slug = "abc123";
        let src_dir = tmp.join("sources").join(slug);
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(
            src_dir.join("words.json"),
            r#"{"total_words":2,"words":[
              {"text":"Hello","start":10.0,"end":10.5},
              {"text":"world.","start":10.6,"end":11.0}
            ]}"#,
        )
        .unwrap();

        // plan.json (source slug)
        fs::write(
            tmp.join("plan.json"),
            format!(r#"{{"source":"{slug}","clips":[]}}"#),
        )
        .unwrap();

        // clips/cut_report.json
        let clips_dir = tmp.join("clips");
        fs::create_dir_all(&clips_dir).unwrap();
        fs::write(
            clips_dir.join("cut_report.json"),
            r#"{"success":[{
              "clip_num":1,"title":"T","start":9.5,"end":11.5,"duration":2.0,
              "file":"/absolute/clip_01.mp4","text_preview":"Hello world.","from_id":1,"to_id":1
            }],"failed":[]}"#,
        )
        .unwrap();

        // clips/clip_01.translations.zh.json
        fs::write(
            clips_dir.join("clip_01.translations.zh.json"),
            r#"{"clip_num":1,"lang":"zh","segments":[
              {"id":1,"en":"Hello world.","start":10.0,"end":11.0,
               "cn":[{"text":"你好世界","start":10.0,"end":11.0}]}
            ]}"#,
        )
        .unwrap();

        // Run
        run(&tmp).unwrap();

        // Verify output
        let out = clips_dir.join("index.html");
        assert!(out.is_file(), "index.html should be produced");
        let html = fs::read_to_string(&out).unwrap();

        // Template placeholder is replaced
        assert!(!html.contains("{{DATA_JSON}}"));
        // Data inlined
        assert!(html.contains(r#""clips":["#));
        assert!(html.contains(r#""file":"clip_01.mp4""#), "file should be relative");
        assert!(html.contains(r#""en":"Hello world.""#));
        assert!(html.contains("你好世界"));
        // Structure markers from template survive
        assert!(html.contains(r#"<video id="vid""#));
        assert!(html.contains("renderSegWords"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
