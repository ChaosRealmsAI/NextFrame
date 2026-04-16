//! SRT file and subtitle array parsing.

use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::error_with_fix;

use super::js_extract::{
    extract_assignment_array, extract_object_literals, extract_object_number, extract_object_string,
};
use super::types::{RawSubtitleCue, SubtitleCue};

// Known-good regex literals — unwrap is safe at compile-time init
#[allow(clippy::unwrap_used)]
pub(super) static SRT_TIME_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?m)^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$",
    )
    .unwrap()
});

pub(super) fn parse_srt_file(path: &Path) -> Result<Vec<SubtitleCue>, String> {
    let source = fs::read_to_string(path).map_err(|err| {
        error_with_fix(
            "read the SRT subtitle file",
            format!("failed to read {}: {err}", path.display()),
            "Ensure the SRT file exists and is readable, then retry.",
        )
    })?;
    parse_srt_text(&source)
}

pub(super) fn parse_srt_text(source: &str) -> Result<Vec<SubtitleCue>, String> {
    let source = source.replace("\r\n", "\n");
    let mut entries = Vec::new();
    for block in source.split("\n\n") {
        let lines: Vec<&str> = block
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        if lines.is_empty() {
            continue;
        }
        let timing_line = lines
            .iter()
            .find(|line| SRT_TIME_RE.is_match(line))
            .copied()
            .ok_or_else(|| {
                error_with_fix(
                    "parse the SRT subtitle block",
                    format!("invalid SRT block: {block:?}"),
                    "Ensure each subtitle block contains a valid `HH:MM:SS,mmm --> HH:MM:SS,mmm` timing line.",
                )
            })?;
        let captures = SRT_TIME_RE.captures(timing_line).ok_or_else(|| {
            error_with_fix(
                "parse the SRT timing line",
                format!("invalid SRT timing line: {timing_line:?}"),
                "Use the `HH:MM:SS,mmm --> HH:MM:SS,mmm` SRT timing format and retry.",
            )
        })?;
        let start = parse_srt_timestamp(&captures, 1)?;
        let end = parse_srt_timestamp(&captures, 5)?;
        let text = lines
            .iter()
            .skip_while(|line| **line != timing_line)
            .skip(1)
            .copied()
            .collect::<Vec<_>>()
            .join(" ");
        entries.push(SubtitleCue { start, end, text });
    }
    Ok(entries)
}

fn parse_srt_timestamp(captures: &regex::Captures<'_>, start: usize) -> Result<f64, String> {
    let hours: f64 = captures
        .get(start)
        .ok_or_else(|| {
            error_with_fix(
                "parse the SRT timestamp",
                "missing hours capture",
                "Use full `HH:MM:SS,mmm` timestamps in the SRT file.",
            )
        })?
        .as_str()
        .parse()
        .map_err(|err| {
            error_with_fix(
                "parse the SRT hour field",
                err,
                "Use a numeric two-digit hour field in the SRT timestamp.",
            )
        })?;
    let minutes: f64 = captures
        .get(start + 1)
        .ok_or_else(|| {
            error_with_fix(
                "parse the SRT timestamp",
                "missing minutes capture",
                "Use full `HH:MM:SS,mmm` timestamps in the SRT file.",
            )
        })?
        .as_str()
        .parse()
        .map_err(|err| {
            error_with_fix(
                "parse the SRT minute field",
                err,
                "Use a numeric two-digit minute field in the SRT timestamp.",
            )
        })?;
    let seconds: f64 = captures
        .get(start + 2)
        .ok_or_else(|| {
            error_with_fix(
                "parse the SRT timestamp",
                "missing seconds capture",
                "Use full `HH:MM:SS,mmm` timestamps in the SRT file.",
            )
        })?
        .as_str()
        .parse()
        .map_err(|err| {
            error_with_fix(
                "parse the SRT second field",
                err,
                "Use a numeric two-digit second field in the SRT timestamp.",
            )
        })?;
    let millis: f64 = captures
        .get(start + 3)
        .ok_or_else(|| {
            error_with_fix(
                "parse the SRT timestamp",
                "missing milliseconds capture",
                "Use full `HH:MM:SS,mmm` timestamps in the SRT file.",
            )
        })?
        .as_str()
        .parse()
        .map_err(|err| {
            error_with_fix(
                "parse the SRT millisecond field",
                err,
                "Use a numeric three-digit millisecond field in the SRT timestamp.",
            )
        })?;
    Ok(hours * 3600.0 + minutes * 60.0 + seconds + millis / 1000.0)
}

pub(super) fn extract_srt_array(source: &str) -> Result<Vec<SubtitleCue>, String> {
    let Some(array_source) = extract_assignment_array(source, "SRT") else {
        return Ok(Vec::new());
    };
    let mut result = Vec::new();
    for object_source in extract_object_literals(&array_source)? {
        let start = extract_object_number(&object_source, "s").ok_or_else(|| {
            error_with_fix(
                "parse the inline SRT entry",
                format!("SRT entry is missing `s`: {object_source}"),
                "Add an `s` start time field to each inline SRT entry and retry.",
            )
        })?;
        let end = extract_object_number(&object_source, "e").ok_or_else(|| {
            error_with_fix(
                "parse the inline SRT entry",
                format!("SRT entry is missing `e`: {object_source}"),
                "Add an `e` end time field to each inline SRT entry and retry.",
            )
        })?;
        let text = extract_object_string(&object_source, "t").ok_or_else(|| {
            error_with_fix(
                "parse the inline SRT entry",
                format!("SRT entry is missing `t`: {object_source}"),
                "Add a `t` text field to each inline SRT entry and retry.",
            )
        })?;
        result.push(SubtitleCue { start, end, text });
    }
    Ok(result)
}

/// Parses a JSON array of subtitle entries into `SubtitleCue` values.
pub(super) fn parse_subtitle_array(entries: &[Value], default_duration: f64) -> Vec<SubtitleCue> {
    if entries.is_empty() {
        return Vec::new();
    }

    let mut raw = Vec::new();
    for entry in entries {
        match entry {
            Value::String(text) => raw.push(RawSubtitleCue {
                start: None,
                end: None,
                duration: None,
                text: text.trim().to_string(),
            }),
            Value::Object(object) => {
                let text = ["text", "t", "value", "label", "word", "subtitle"]
                    .iter()
                    .filter_map(|key| object.get(*key))
                    .find_map(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                raw.push(RawSubtitleCue {
                    start: extract_time_field(
                        object,
                        &["start", "startMs", "start_ms", "s", "time", "t", "from"],
                    ),
                    end: extract_time_field(
                        object,
                        &["end", "endMs", "end_ms", "e", "to", "endTime"],
                    ),
                    duration: extract_time_field(
                        object,
                        &["dur", "duration", "durationMs", "duration_ms", "holdDur"],
                    ),
                    text,
                });
            }
            _ => {}
        }
    }

    if raw.is_empty() {
        return Vec::new();
    }

    let mut cues = Vec::new();
    let mut cursor = 0.0;
    for (index, entry) in raw.iter().enumerate() {
        let start = entry.start.unwrap_or(cursor);
        let mut end = entry
            .end
            .or_else(|| entry.duration.map(|duration| start + duration))
            .or_else(|| raw.get(index + 1).and_then(|next| next.start))
            .unwrap_or(default_duration);
        if !end.is_finite() || end < start {
            end = start;
        }
        cursor = end;
        cues.push(SubtitleCue {
            start,
            end,
            text: entry.text.clone(),
        });
    }

    if cues.iter().all(|cue| cue.start == 0.0 && cue.end == 0.0) {
        let span = default_duration / cues.len() as f64;
        for (index, cue) in cues.iter_mut().enumerate() {
            cue.start = index as f64 * span;
            cue.end = ((index + 1) as f64 * span).min(default_duration);
        }
    }

    cues
}

fn extract_time_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<f64> {
    for key in keys {
        if let Some(value) = object.get(*key)
            && let Some(number) = value.as_f64().or_else(|| value.as_str()?.parse().ok())
        {
            let scale = if key.contains("ms") || key.contains("Ms") {
                1000.0
            } else {
                1.0
            };
            return Some(number / scale);
        }
    }
    None
}
