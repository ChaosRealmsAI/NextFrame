//! SRT parsing for `splice import` and SRT rendering for sentence previews.

use anyhow::{Result, bail};

use crate::sentence::Sentence;
use crate::time::format_srt_timestamp;

/// Parse an SRT document into sentence text blocks, ignoring SRT timestamps entirely.
pub fn parse_srt(input: &str) -> Result<Vec<String>> {
    let normalized = input.replace("\r\n", "\n");
    let mut sentences = Vec::new();

    for block in normalized.split("\n\n") {
        let trimmed = block.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lines = trimmed
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();

        if lines.is_empty() {
            continue;
        }

        let mut start_idx = 0usize;
        if lines
            .first()
            .is_some_and(|line| line.parse::<u32>().is_ok())
        {
            start_idx = 1;
        }

        if lines.get(start_idx).is_none() {
            continue;
        }

        if !lines[start_idx].contains("-->") {
            bail!("invalid SRT block: missing timestamp line");
        }

        let text_lines = lines
            .iter()
            .skip(start_idx + 1)
            .copied()
            .collect::<Vec<_>>();
        if text_lines.is_empty() {
            continue;
        }

        sentences.push(text_lines.join(" "));
    }

    Ok(sentences)
}

/// Render aligned sentences as SRT.
pub fn render_srt(sentences: &[Sentence]) -> String {
    let mut out = String::new();

    for sentence in sentences {
        out.push_str(&format!("{}\n", sentence.id));
        out.push_str(&format!(
            "{} --> {}\n",
            format_srt_timestamp(sentence.start),
            format_srt_timestamp(sentence.end)
        ));
        out.push_str(&sentence.text);
        out.push_str("\n\n");
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_srt_joins_multiline_blocks() -> Result<()> {
        let input = "1\n00:00:00,000 --> 00:00:01,000\nHello\nworld.\n\n2\n00:00:01,100 --> 00:00:02,000\nAgain.\n";

        let parsed = parse_srt(input)?;

        assert_eq!(
            parsed,
            vec!["Hello world.".to_string(), "Again.".to_string()]
        );
        Ok(())
    }

    #[test]
    fn parse_srt_ignores_missing_indexes() -> Result<()> {
        let input =
            "00:00:00,000 --> 00:00:01,000\nHello.\n\n00:00:01,000 --> 00:00:02,000\nWorld.\n";

        let parsed = parse_srt(input)?;

        assert_eq!(parsed.len(), 2);
        Ok(())
    }
}
