//! WhisperX forced-alignment pipeline for `nf align`.

mod script;
mod text;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{Context, Result};
use nf_cut_core::{SentenceSource, Sentences, extract_audio_to_wav, millis_to_seconds, round2};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::script::run_align_script;
use crate::text::{build_sentences, normalize_language_arg, parse_plain_text, rebuild_words};

const ALIGN_MODEL_NAME: &str = "whisperx_forced_alignment";

/// CLI-facing options for forced alignment.
#[derive(Debug, Clone)]
pub struct AlignOptions {
    /// Source video or audio file that will be aligned.
    pub video: PathBuf,
    /// Source subtitle file used to provide the alignment text.
    pub srt_path: PathBuf,
    /// Output directory for the canonical sentence bundle.
    pub out_dir: PathBuf,
    /// Language code passed to the align helper, or `auto`.
    pub language: String,
}

/// Summary of a completed alignment run.
#[derive(Debug, Clone)]
pub struct AlignSummary {
    /// Extracted `audio.wav` path.
    pub audio_path: PathBuf,
    /// Audio duration in seconds.
    pub audio_duration_sec: f64,
    /// Detected or requested language code.
    pub language: String,
    /// Total aligned tokens written into `sentences.json`.
    pub total_words: usize,
    /// Total sentence count written into `sentences.json`.
    pub total_sentences: usize,
}

#[derive(Debug, Deserialize)]
struct AlignOutput {
    duration_ms: u64,
    language: String,
    units: Vec<AlignUnit>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AlignUnit {
    text: String,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Debug, Serialize)]
struct Meta {
    command: &'static str,
    input: String,
    srt: String,
    model: &'static str,
    language: String,
    audio_duration_sec: f64,
    total_words: usize,
    total_sentences: usize,
    elapsed_sec: f64,
}

#[derive(Debug, Error)]
enum AlignDataError {
    #[error("alignment returned zero units")]
    NoUnits,
    #[error("alignment unit {index} has empty text")]
    EmptyUnitText { index: usize },
    #[error("alignment unit {index} has invalid span {start_ms}..{end_ms}")]
    InvalidUnitSpan {
        index: usize,
        start_ms: u64,
        end_ms: u64,
    },
}

/// Align subtitle text against source audio and write the canonical sentence bundle.
pub fn align(options: &AlignOptions) -> Result<AlignSummary> {
    fs::create_dir_all(&options.out_dir)
        .with_context(|| format!("create {}", options.out_dir.display()))?;

    let started = Instant::now();
    let audio_path = options.out_dir.join("audio.wav");
    let srt_text = fs::read_to_string(&options.srt_path)
        .with_context(|| format!("read {}", options.srt_path.display()))?;
    let plain_text = parse_plain_text(&srt_text).context("parse SRT text")?;

    extract_audio_to_wav(&options.video, &audio_path).context("extract audio")?;

    let helper_language = normalize_language_arg(&options.language);
    let output = run_align_script(&audio_path, &helper_language, &plain_text)?;
    validate_output(&output)?;

    let resolved_language = if output.language.trim().is_empty() {
        if helper_language.is_empty() {
            "auto".to_string()
        } else {
            helper_language.clone()
        }
    } else {
        output.language.clone()
    };
    let words = rebuild_words(&plain_text, &output.units);
    let sentences_vec = build_sentences(&words, &resolved_language);
    let audio_duration_sec = round2(millis_to_seconds(output.duration_ms));
    let sentences = Sentences {
        version: "1".to_string(),
        source: SentenceSource::WhisperTimestamped,
        model: ALIGN_MODEL_NAME.to_string(),
        language: resolved_language.clone(),
        audio_duration_sec,
        total_sentences: sentences_vec.len(),
        sentences: sentences_vec,
    };
    let meta = Meta {
        command: "align",
        input: options.video.display().to_string(),
        srt: options.srt_path.display().to_string(),
        model: ALIGN_MODEL_NAME,
        language: resolved_language.clone(),
        audio_duration_sec,
        total_words: words.len(),
        total_sentences: sentences.total_sentences,
        elapsed_sec: started.elapsed().as_secs_f64(),
    };

    write_outputs(&options.out_dir, &sentences, &meta)?;

    Ok(AlignSummary {
        audio_path,
        audio_duration_sec,
        language: resolved_language,
        total_words: words.len(),
        total_sentences: sentences.total_sentences,
    })
}

fn validate_output(output: &AlignOutput) -> Result<()> {
    if output.units.is_empty() {
        return Err(AlignDataError::NoUnits).context("invalid align output");
    }

    for (index, unit) in output.units.iter().enumerate() {
        if unit.text.trim().is_empty() {
            return Err(AlignDataError::EmptyUnitText { index }).context("invalid align output");
        }
        if unit.end_ms < unit.start_ms {
            return Err(AlignDataError::InvalidUnitSpan {
                index,
                start_ms: unit.start_ms,
                end_ms: unit.end_ms,
            })
            .context("invalid align output");
        }
    }

    Ok(())
}

fn write_outputs(out_dir: &Path, sentences: &Sentences, meta: &Meta) -> Result<()> {
    sentences.write_to_path(&out_dir.join("sentences.json"))?;
    fs::write(out_dir.join("sentences.srt"), sentences.to_srt())
        .with_context(|| format!("write {}", out_dir.join("sentences.srt").display()))?;
    fs::write(out_dir.join("sentences.txt"), sentences.to_txt())
        .with_context(|| format!("write {}", out_dir.join("sentences.txt").display()))?;
    fs::write(
        out_dir.join("meta.json"),
        serde_json::to_string_pretty(meta).context("serialize meta")?,
    )
    .with_context(|| format!("write {}", out_dir.join("meta.json").display()))?;
    Ok(())
}

#[cfg(test)]
mod tests;
