//! Whisper transcription pipeline for `videocut transcribe`.

mod audio;
mod chunk;
mod logger;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

use anyhow::{Context, Result, bail};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tempfile::tempdir;
use videocut_core::{
    SentenceSource, Sentences, Word, WordsFile, extract_audio_to_wav, probe_duration, python_bin,
    split_into_sentences,
};

use crate::chunk::build_chunks;
use crate::logger::Logger;

const CHUNK_MINUTES: u32 = 20;
const OVERLAP_SECONDS: u32 = 2;

/// CLI-facing options for batch transcription.
#[derive(Debug, Clone)]
pub struct TranscribeOptions {
    pub video: PathBuf,
    pub out_dir: PathBuf,
    pub model: String,
    pub language: String,
    pub jobs: usize,
}

/// Summary of a completed transcription run.
#[derive(Debug, Clone)]
pub struct TranscribeSummary {
    pub audio_path: PathBuf,
    pub audio_duration_sec: f64,
    pub total_words: usize,
    pub total_sentences: usize,
}

#[derive(Debug, Deserialize)]
struct WhisperOutput {
    language: Option<String>,
    words: Vec<Word>,
}

#[derive(Debug, Serialize)]
struct Meta {
    command: &'static str,
    input: String,
    model: String,
    language: String,
    chunk_minutes: u32,
    overlap_sec: u32,
    jobs: usize,
    audio_duration_sec: f64,
    total_words: usize,
    total_sentences: usize,
    elapsed_sec: f64,
}

/// Transcribe a video or audio input into the canonical output bundle.
pub fn transcribe(options: &TranscribeOptions) -> Result<TranscribeSummary> {
    fs::create_dir_all(&options.out_dir)
        .with_context(|| format!("create {}", options.out_dir.display()))?;

    let logger = Logger::new(&options.out_dir.join("log.txt"))?;
    let started = Instant::now();
    let audio_path = options.out_dir.join("audio.wav");

    logger.log(&format!(
        "start transcribe video={} out={}",
        options.video.display(),
        options.out_dir.display()
    ));
    logger.log(&format!(
        "params model={} lang={} jobs={} chunk={}min overlap={}s",
        options.model, options.language, options.jobs, CHUNK_MINUTES, OVERLAP_SECONDS
    ));

    extract_audio_to_wav(&options.video, &audio_path).context("extract audio")?;
    let duration = probe_duration(&audio_path)?;
    logger.log(&format!("audio duration {:.2}s", duration));

    let workdir = tempdir().context("create transcription workdir")?;
    let chunks = build_chunks(
        &audio_path,
        workdir.path(),
        duration,
        CHUNK_MINUTES,
        OVERLAP_SECONDS,
    )?;
    logger.log(&format!("built {} chunk(s)", chunks.len()));

    let whisper_result = transcribe_chunks(
        &chunks,
        &options.model,
        &options.language,
        options.jobs,
        &logger,
    )?;
    let detected_language = whisper_result
        .language
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| options.language.clone());
    let sentences_vec = split_into_sentences(&whisper_result.words);
    let sentences = Sentences {
        version: "1".to_string(),
        source: SentenceSource::WhisperTimestamped,
        model: options.model.clone(),
        language: detected_language.clone(),
        audio_duration_sec: duration,
        total_sentences: sentences_vec.len(),
        sentences: sentences_vec,
    };
    let meta = Meta {
        command: "transcribe",
        input: options.video.display().to_string(),
        model: options.model.clone(),
        language: detected_language,
        chunk_minutes: CHUNK_MINUTES,
        overlap_sec: OVERLAP_SECONDS,
        jobs: options.jobs.max(1),
        audio_duration_sec: duration,
        total_words: whisper_result.words.len(),
        total_sentences: sentences.total_sentences,
        elapsed_sec: started.elapsed().as_secs_f64(),
    };

    write_outputs(&options.out_dir, &sentences, &whisper_result.words, &meta)?;
    logger.log(&format!(
        "done sentences={} words={} elapsed={:.2}s",
        sentences.total_sentences,
        whisper_result.words.len(),
        started.elapsed().as_secs_f64()
    ));

    Ok(TranscribeSummary {
        audio_path,
        audio_duration_sec: duration,
        total_words: whisper_result.words.len(),
        total_sentences: sentences.total_sentences,
    })
}

/// Extract 16 kHz mono WAV audio from a media file.
pub fn extract_audio(video: &Path, wav_path: &Path) -> Result<()> {
    extract_audio_to_wav(video, wav_path)
}

/// Probe the duration of an audio or video file in seconds.
pub fn duration_seconds(path: &Path) -> Result<f64> {
    probe_duration(path)
}

fn transcribe_chunks(
    chunks: &[chunk::Chunk],
    model: &str,
    language: &str,
    jobs: usize,
    logger: &Logger,
) -> Result<WhisperOutput> {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(jobs.max(1).min(chunks.len().max(1)))
        .build()
        .context("build rayon pool")?;

    let mut ordered = pool.install(|| {
        chunks
            .par_iter()
            .enumerate()
            .map(|(index, chunk)| {
                logger.log(&format!(
                    "chunk {}/{} start offset={:.2}s duration={:.2}s",
                    index + 1,
                    chunks.len(),
                    chunk.offset_sec,
                    chunk.duration_sec
                ));
                run_whisper_script(&chunk.path, model, language)
                    .map(|output| (index, chunk.offset_sec, output))
                    .with_context(|| format!("transcribe chunk {}", index + 1))
            })
            .collect::<Vec<_>>()
    });

    let mut completed = Vec::with_capacity(ordered.len());
    for result in ordered.drain(..) {
        completed.push(result?);
    }
    completed.sort_by_key(|(index, _, _)| *index);

    let mut merged: Vec<Word> = Vec::new();
    let mut languages = Vec::new();
    for (_, offset_sec, chunk_output) in completed {
        if let Some(language) = chunk_output.language.clone() {
            languages.push(language);
        }
        let mut shifted = chunk_output
            .words
            .into_iter()
            .map(|word| Word {
                text: word.text,
                start: word.start + offset_sec,
                end: word.end + offset_sec,
            })
            .collect::<Vec<_>>();

        if let Some(last) = merged.last() {
            let cutoff = last.end - 0.05;
            shifted.retain(|word| word.start >= cutoff);
        }
        merged.extend(shifted);
    }

    Ok(WhisperOutput {
        language: languages.into_iter().next(),
        words: merged,
    })
}

fn run_whisper_script(audio_path: &Path, model: &str, language: &str) -> Result<WhisperOutput> {
    let script = whisper_script_path()?;
    let output = Command::new(python_bin(
        "VIDEOCUT_PYTHON_BIN",
        Path::new("/Users/Zhuanz/.venvs/align/bin/python3"),
    ))
    .arg(script)
    .arg(audio_path)
    .arg(model)
    .arg(language)
    .env("TQDM_DISABLE", "1")
    .env("PYTHONUNBUFFERED", "1")
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
    .context("spawn whisper helper")?;

    if !output.status.success() {
        bail!(
            "whisper helper failed (exit {:?}): {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    let parsed: WhisperOutput = serde_json::from_slice(&output.stdout).with_context(|| {
        format!(
            "parse whisper output: {}",
            String::from_utf8_lossy(&output.stdout)
        )
    })?;
    Ok(parsed)
}

fn write_outputs(out_dir: &Path, sentences: &Sentences, words: &[Word], meta: &Meta) -> Result<()> {
    sentences.write_to_path(&out_dir.join("sentences.json"))?;
    fs::write(out_dir.join("sentences.srt"), sentences.to_srt())
        .with_context(|| format!("write {}", out_dir.join("sentences.srt").display()))?;
    fs::write(out_dir.join("sentences.txt"), sentences.to_txt())
        .with_context(|| format!("write {}", out_dir.join("sentences.txt").display()))?;
    WordsFile {
        total_words: words.len(),
        words: words.to_vec(),
    }
    .write_to_path(&out_dir.join("words.json"))?;
    fs::write(
        out_dir.join("meta.json"),
        serde_json::to_string_pretty(meta).context("serialize meta")?,
    )
    .with_context(|| format!("write {}", out_dir.join("meta.json").display()))?;
    Ok(())
}

fn whisper_script_path() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("VIDEOCUT_WHISPER_SCRIPT") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let source_tree = manifest
        .parent()
        .and_then(Path::parent)
        .map(|root| root.join("python/whisper_transcribe.py"))
        .filter(|path| path.exists());
    if let Some(path) = source_tree {
        return Ok(path);
    }

    let exe = std::env::current_exe().context("resolve current executable")?;
    for parent in exe.ancestors() {
        let candidate = parent.join("python/whisper_transcribe.py");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    bail!("python/whisper_transcribe.py not found (set SPLICE_WHISPER_SCRIPT)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whisper_script_resolves_from_source_tree() -> Result<()> {
        let path = whisper_script_path()?;
        assert!(path.ends_with("python/whisper_transcribe.py"));
        Ok(())
    }
}
