//! Test coverage for `videocut-align`.

use anyhow::Result;

use super::AlignUnit;
use super::script::align_script_path;
use super::text::{build_sentences, normalize_language_arg, parse_plain_text, rebuild_words};

fn unit(text: &str, start_ms: u64, end_ms: u64) -> AlignUnit {
    AlignUnit {
        text: text.to_string(),
        start_ms,
        end_ms,
    }
}

#[test]
fn align_script_resolves_from_source_tree() -> Result<()> {
    let path = align_script_path()?;
    assert!(path.ends_with("src/python/align_ffa.py"));
    Ok(())
}

#[test]
fn rebuilds_english_punctuation_and_sentence_breaks() {
    let words = rebuild_words(
        r#"Hello, world! "Again?" she asked."#,
        &[
            unit("Hello", 0, 200),
            unit("world", 210, 420),
            unit("Again", 600, 850),
            unit("she", 1000, 1120),
            unit("asked", 1120, 1400),
        ],
    );

    assert_eq!(words[0].text, "Hello,");
    assert_eq!(words[1].text, "world!");
    assert_eq!(words[2].text, "\"Again?\"");
    assert_eq!(words[4].text, "asked.");

    let sentences = build_sentences(&words, "en");
    assert_eq!(sentences.len(), 3);
    assert_eq!(sentences[0].text, "Hello, world!");
    assert_eq!(sentences[1].text, "\"Again?\"");
    assert_eq!(sentences[2].text, "she asked.");
}

#[test]
fn rebuilds_cjk_char_units_without_spacing() {
    let words = rebuild_words(
        "你好。世界！",
        &[
            unit("你", 0, 80),
            unit("好", 80, 160),
            unit("世", 500, 620),
            unit("界", 620, 760),
        ],
    );

    assert_eq!(words[1].text, "好。");
    assert_eq!(words[3].text, "界！");

    let sentences = build_sentences(&words, "zh");
    assert_eq!(sentences.len(), 2);
    assert_eq!(sentences[0].text, "你好。");
    assert_eq!(sentences[1].text, "世界！");
}

#[test]
fn parse_plain_text_rejects_empty_srt() {
    let result = parse_plain_text("1\n00:00:00,000 --> 00:00:01,000\n\n");
    assert!(result.is_err());
}

#[test]
fn normalize_language_arg_treats_auto_as_empty() {
    assert_eq!(normalize_language_arg(" auto "), "");
    assert_eq!(normalize_language_arg("en"), "en");
}
