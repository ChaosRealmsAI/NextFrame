//! Text reconstruction and sentence-building helpers for aligned output.

use std::mem;

use anyhow::{Context, Result, bail};
use nf_cut_core::{Sentence, Word, millis_to_seconds, parse_srt, round2};

use crate::AlignUnit;

const CHAR_UNIT_LANGS: &[&str] = &["zh", "ja", "ko"];

/// Parse plain subtitle text from an SRT document.
pub(crate) fn parse_plain_text(srt_text: &str) -> Result<String> {
    let blocks = parse_srt(srt_text).context("decode SRT blocks")?;
    let plain_text = blocks.join(" ").trim().to_string();
    if plain_text.is_empty() {
        bail!("SRT did not contain any subtitle text");
    }
    Ok(plain_text)
}

/// Rebuild word tokens by reattaching punctuation stripped by the aligner.
pub(crate) fn rebuild_words(original_text: &str, units: &[AlignUnit]) -> Vec<Word> {
    let mut words = Vec::with_capacity(units.len());
    let mut cursor = 0usize;
    let mut pending_prefix = String::new();

    for unit in units {
        if let Some((start, end)) = find_unit_span(original_text, &unit.text, cursor) {
            distribute_gap(
                &original_text[cursor..start],
                &mut words,
                &mut pending_prefix,
            );
            cursor = end;
        }

        let mut text = mem::take(&mut pending_prefix);
        text.push_str(&unit.text);
        words.push(Word {
            text,
            start: round2(millis_to_seconds(unit.start_ms)),
            end: round2(millis_to_seconds(unit.end_ms)),
        });
    }

    distribute_gap(&original_text[cursor..], &mut words, &mut pending_prefix);
    if let Some(last) = words.last_mut() {
        last.text.push_str(&pending_prefix);
    }

    words
}

/// Build sentence records from aligned words using punctuation heuristics.
pub(crate) fn build_sentences(words: &[Word], language: &str) -> Vec<Sentence> {
    let mut sentences = Vec::new();
    let mut current = Vec::new();
    let use_spaces = !is_char_unit_language(language);

    for word in words {
        current.push(word.clone());
        if ends_sentence(&word.text) {
            sentences.push(build_sentence(
                next_sentence_id(sentences.len()),
                &current,
                use_spaces,
            ));
            current.clear();
        }
    }

    if !current.is_empty() {
        sentences.push(build_sentence(
            next_sentence_id(sentences.len()),
            &current,
            use_spaces,
        ));
    }

    sentences
}

/// Normalize the CLI language flag before passing it to the align helper.
pub(crate) fn normalize_language_arg(language: &str) -> String {
    let trimmed = language.trim();
    if trimmed.eq_ignore_ascii_case("auto") {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn find_unit_span(text: &str, unit: &str, cursor: usize) -> Option<(usize, usize)> {
    text.get(cursor..).and_then(|rest| {
        rest.find(unit)
            .map(|offset| (cursor + offset, cursor + offset + unit.len()))
    })
}

fn distribute_gap(gap: &str, words: &mut [Word], pending_prefix: &mut String) {
    if gap.trim().is_empty() {
        return;
    }

    if !gap.chars().any(char::is_whitespace) {
        if let Some(last) = words.last_mut() {
            last.text.push_str(gap.trim());
        } else {
            pending_prefix.push_str(gap.trim());
        }
        return;
    }

    let leading = leading_non_whitespace_run(gap).trim();
    let trailing = trailing_non_whitespace_run(gap).trim();

    if !leading.is_empty() {
        if let Some(last) = words.last_mut() {
            last.text.push_str(leading);
        } else {
            pending_prefix.push_str(leading);
        }
    }
    if !trailing.is_empty() {
        pending_prefix.push_str(trailing);
    }
}

fn leading_non_whitespace_run(input: &str) -> &str {
    let end = input
        .char_indices()
        .find_map(|(index, ch)| ch.is_whitespace().then_some(index))
        .unwrap_or(input.len());
    &input[..end]
}

fn trailing_non_whitespace_run(input: &str) -> &str {
    let start = input
        .char_indices()
        .rev()
        .find_map(|(index, ch)| ch.is_whitespace().then_some(index + ch.len_utf8()))
        .unwrap_or(0);
    &input[start..]
}

fn build_sentence(id: u32, words: &[Word], use_spaces: bool) -> Sentence {
    let start = words.first().map(|word| word.start).unwrap_or(0.0);
    let end = words.last().map(|word| word.end).unwrap_or(start);
    let text = if use_spaces {
        words
            .iter()
            .map(|word| word.text.trim())
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        words
            .iter()
            .map(|word| word.text.trim())
            .collect::<Vec<_>>()
            .join("")
    };

    Sentence {
        id,
        start: round2(start),
        end: round2(end),
        text: text.trim().to_string(),
        words: words.to_vec(),
    }
}

fn next_sentence_id(existing_len: usize) -> u32 {
    match u32::try_from(existing_len) {
        Ok(value) => value.saturating_add(1),
        Err(_) => u32::MAX,
    }
}

fn is_char_unit_language(language: &str) -> bool {
    CHAR_UNIT_LANGS.contains(&language)
}

fn ends_sentence(text: &str) -> bool {
    let trimmed = text.trim_end_matches(|ch: char| {
        ch.is_whitespace()
            || matches!(
                ch,
                ',' | ';'
                    | ':'
                    | '"'
                    | '\''
                    | ')'
                    | ']'
                    | '}'
                    | '-'
                    | '，'
                    | '、'
                    | '”'
                    | '’'
                    | '）'
                    | '】'
                    | '》'
            )
    });

    trimmed
        .chars()
        .last()
        .is_some_and(|last| matches!(last, '.' | '?' | '!' | '。' | '？' | '！'))
}
