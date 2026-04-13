//! Canonical sentence and word artifacts used across transcription and cut.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

use crate::srt::render_srt;
use crate::time::{format_hms, round2};

/// One aligned word within a sentence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// One sentence resolved to aligned word timings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sentence {
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub words: Vec<Word>,
}

/// Source generator for the canonical `sentences.json` artifact.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SentenceSource {
    WhisperTimestamped,
}

/// Canonical `sentences.json` contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sentences {
    pub version: String,
    pub source: SentenceSource,
    pub model: String,
    pub language: String,
    pub audio_duration_sec: f64,
    pub total_sentences: usize,
    pub sentences: Vec<Sentence>,
}

/// Word-level sidecar artifact written as `words.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WordsFile {
    pub total_words: usize,
    pub words: Vec<Word>,
}

impl Sentences {
    /// Load `sentences.json` from either a direct file path or a directory containing it.
    pub fn from_path(path: &Path) -> Result<Self> {
        let resolved = resolve_sentences_path(path)?;
        let raw = fs::read_to_string(&resolved)
            .with_context(|| format!("read {}", resolved.display()))?;
        serde_json::from_str(&raw).with_context(|| format!("parse {}", resolved.display()))
    }

    /// Write this artifact to a `sentences.json` file path.
    pub fn write_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).context("serialize sentences")?,
        )
        .with_context(|| format!("write {}", path.display()))
    }

    /// Find a sentence by id.
    pub fn sentence_by_id(&self, id: u32) -> Option<&Sentence> {
        self.sentences.iter().find(|sentence| sentence.id == id)
    }

    /// Render the sentence list as SRT.
    pub fn to_srt(&self) -> String {
        render_srt(&self.sentences)
    }

    /// Render the sentence list as a human-readable text index.
    pub fn to_txt(&self) -> String {
        let mut out = String::new();
        for sentence in &self.sentences {
            out.push_str(&format!(
                "[{}] [{}→{}] {}\n",
                sentence.id,
                format_hms(sentence.start),
                format_hms(sentence.end),
                sentence.text
            ));
        }
        out
    }
}

impl WordsFile {
    /// Write `words.json` to disk.
    pub fn write_to_path(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::write(
            path,
            serde_json::to_string_pretty(self).context("serialize words")?,
        )
        .with_context(|| format!("write {}", path.display()))
    }
}

/// Split a word stream into sentence records using sentence-ending punctuation.
pub fn split_into_sentences(words: &[Word]) -> Vec<Sentence> {
    let mut out = Vec::new();
    let mut current: Vec<&Word> = Vec::new();
    let mut next_id: u32 = 1;

    for word in words {
        current.push(word);
        if ends_sentence(&word.text) {
            out.push(build_sentence(next_id, &current));
            next_id += 1;
            current.clear();
        }
    }

    if !current.is_empty() {
        out.push(build_sentence(next_id, &current));
    }

    out
}

/// Resolve a path that may be either a directory containing `sentences.json` or the file itself.
pub fn resolve_sentences_path(path: &Path) -> Result<PathBuf> {
    if path.is_dir() {
        let candidate = path.join("sentences.json");
        if candidate.exists() {
            return Ok(candidate);
        }
        bail!(
            "directory {} does not contain sentences.json",
            path.display()
        );
    }
    if path.exists() {
        return Ok(path.to_path_buf());
    }
    bail!("sentences path not found: {}", path.display())
}

fn build_sentence(id: u32, words: &[&Word]) -> Sentence {
    let start = words.first().map(|word| word.start).unwrap_or_default();
    let end = words.last().map(|word| word.end).unwrap_or(start);
    let text = words
        .iter()
        .map(|word| word.text.trim())
        .collect::<Vec<_>>()
        .join(" ");

    Sentence {
        id,
        start: round2(start),
        end: round2(end),
        text,
        words: words.iter().map(|word| (*word).clone()).collect(),
    }
}

fn ends_sentence(text: &str) -> bool {
    let trimmed = text.trim_end_matches(|ch: char| {
        matches!(
            ch,
            ',' | ';' | ':' | '"' | ')' | '\'' | '-' | ']' | '}' | '，' | '、'
        )
    });

    trimmed
        .chars()
        .last()
        .is_some_and(|last| matches!(last, '.' | '?' | '!' | '。' | '？' | '！'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(text: &str, start: f64, end: f64) -> Word {
        Word {
            text: text.to_string(),
            start,
            end,
        }
    }

    #[test]
    fn split_preserves_words_and_rounds_bounds() {
        let words = vec![
            word("Hello", 0.001, 0.211),
            word("world.", 0.211, 0.499),
            word("Again", 0.502, 0.844),
            word("now", 0.844, 1.212),
        ];

        let sentences = split_into_sentences(&words);

        assert_eq!(sentences.len(), 2);
        assert_eq!(sentences[0].id, 1);
        assert_eq!(sentences[0].start, 0.0);
        assert_eq!(sentences[0].end, 0.5);
        assert_eq!(sentences[0].text, "Hello world.");
        assert_eq!(sentences[0].words, words[..2].to_vec());
        assert_eq!(sentences[1].id, 2);
        assert_eq!(sentences[1].text, "Again now");
    }

    #[test]
    fn resolve_sentences_path_accepts_file() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let file = dir.path().join("sentences.json");
        fs::write(&file, "{}")?;

        let resolved = resolve_sentences_path(&file)?;

        assert_eq!(resolved, file);
        Ok(())
    }

    #[test]
    fn resolve_sentences_path_accepts_directory() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let file = dir.path().join("sentences.json");
        fs::write(&file, "{}")?;

        let resolved = resolve_sentences_path(dir.path())?;

        assert_eq!(resolved, file);
        Ok(())
    }

    #[test]
    fn sentence_lookup_by_id() {
        let sentences = Sentences {
            version: "1".to_string(),
            source: SentenceSource::WhisperTimestamped,
            model: "base.en".to_string(),
            language: "en".to_string(),
            audio_duration_sec: 10.0,
            total_sentences: 2,
            sentences: vec![
                Sentence {
                    id: 1,
                    start: 0.0,
                    end: 1.0,
                    text: "One.".to_string(),
                    words: vec![word("One.", 0.0, 1.0)],
                },
                Sentence {
                    id: 2,
                    start: 1.0,
                    end: 2.0,
                    text: "Two.".to_string(),
                    words: vec![word("Two.", 1.0, 2.0)],
                },
            ],
        };

        assert_eq!(
            sentences
                .sentence_by_id(2)
                .map(|sentence| sentence.text.as_str()),
            Some("Two.")
        );
    }
}
