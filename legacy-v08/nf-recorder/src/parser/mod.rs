//! Parsing utilities for recorder HTML files, manifests, subtitles, and cue maps.

mod js_extract;
mod manifest;
mod srt;
pub(crate) mod timeline;
mod types;

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[allow(clippy::expect_used)]
mod tests;

use std::fs;
use std::path::Path;

use crate::error_with_fix;

use js_extract::{extract_assignment_array, extract_assignment_string, extract_number};
use manifest::{
    extract_slide_segments_audio, extract_slide_segments_srt, load_manifest_fallback, max_data_cue,
};
use srt::extract_srt_array;

// Re-export public types so `use crate::parser::X` continues to work.
#[allow(unused_imports)]
pub(crate) use timeline::parse_nextframe_timeline;
pub use types::SubtitleCue;
pub(crate) use types::{FrameMetadata, SlideType};

pub fn detect_slide_type(html_content: &str) -> SlideType {
    if html_content.contains("<clip-slide")
        || html_content.contains("clip-slide.js")
        || html_content.contains("<video")
    {
        SlideType::Clip
    } else if html_content.contains("<bridge-slide") || html_content.contains("bridge-slide.js") {
        SlideType::Bridge
    } else {
        SlideType::Unknown
    }
}

/// Parses an HTML frame file and derives its audio, subtitle, and cue metadata.
pub fn parse_frame_file(path: &Path) -> Result<FrameMetadata, String> {
    let html_path = path.canonicalize().map_err(|err| {
        error_with_fix(
            "open the HTML frame file",
            format!("failed to canonicalize {}: {err}", path.display()),
            "Pass an existing HTML frame file path and retry.",
        )
    })?;
    let html = fs::read_to_string(&html_path).map_err(|err| {
        error_with_fix(
            "read the HTML frame file",
            format!("failed to read {}: {err}", html_path.display()),
            "Ensure the HTML frame file is readable and retry.",
        )
    })?;
    let slide_type = detect_slide_type(&html);

    let mut warnings = Vec::new();
    let mut audio_path = extract_assignment_string(&html, "AUDIO_SRC")
        .map(|rel| resolve_relative(&html_path, rel))
        .transpose()?;
    let mut subtitles = extract_srt_array(&html)?;
    let mut cuemap = extract_cuemap(&html)?;
    let mut total_cues = extract_number(&html, "TOTAL").map(|n| n as usize);

    // ── __SLIDE_SEGMENTS fallback ──
    // slide-audio.js v4 uses __SLIDE_SEGMENTS = { audio: '...', segments: [...] }
    // instead of separate AUDIO_SRC / SRT / CUEMAP variables.
    if audio_path.is_none()
        && let Some(seg_audio) = extract_slide_segments_audio(&html)
    {
        audio_path = Some(resolve_relative(&html_path, seg_audio)?);
        warnings.push("used __SLIDE_SEGMENTS.audio as audio source".into());
    }
    if subtitles.is_empty() {
        let seg_subs = extract_slide_segments_srt(&html);
        if !seg_subs.is_empty() {
            subtitles = seg_subs;
            warnings.push("used __SLIDE_SEGMENTS.srt as subtitle source".into());
        }
    }

    if (audio_path.is_none() || subtitles.is_empty() || cuemap.is_empty() || total_cues.is_none())
        && let Some(fallback) = load_manifest_fallback(&html_path)?
    {
        if audio_path.is_none() {
            audio_path = fallback.audio_path;
            if audio_path.is_some() {
                warnings.push(
                    "AUDIO_SRC missing inline; used segments.json/convention fallback".into(),
                );
            }
        }
        if subtitles.is_empty() {
            subtitles = fallback.subtitles;
            if !subtitles.is_empty() {
                warnings.push("SRT missing inline; used sibling .srt fallback".into());
            }
        }
        if cuemap.is_empty() {
            cuemap = fallback.cuemap;
            if !cuemap.is_empty() {
                warnings.push("CUEMAP missing inline; derived fallback mapping".into());
            }
        }
        if total_cues.is_none() {
            total_cues = fallback.total_cues;
            if total_cues.is_some() {
                warnings.push("TOTAL missing inline; derived fallback total".into());
            }
        }
    }

    let total_cues = total_cues.unwrap_or_else(|| {
        max_data_cue(&html)
            .map(|value| value + 1)
            .or_else(|| (!cuemap.is_empty()).then_some(cuemap.len()))
            .or_else(|| (!subtitles.is_empty()).then_some(subtitles.len().max(1)))
            .unwrap_or(0)
    });

    if cuemap.is_empty() && !subtitles.is_empty() {
        let derived_len = total_cues.max(1).min(subtitles.len());
        cuemap = (0..derived_len).collect();
    }
    cuemap.retain(|index| *index < subtitles.len());

    Ok(FrameMetadata {
        html_path,
        slide_type,
        audio_path,
        subtitles,
        cuemap,
        total_cues,
        warnings,
    })
}

fn resolve_relative(html_path: &Path, rel: String) -> Result<std::path::PathBuf, String> {
    let parent = html_path.parent().ok_or_else(|| {
        error_with_fix(
            "resolve a frame-relative asset path",
            format!("{} has no parent directory", html_path.display()),
            "Place the HTML frame on disk under a real directory and retry.",
        )
    })?;
    Ok(parent.join(rel))
}

fn extract_cuemap(source: &str) -> Result<Vec<usize>, String> {
    let Some(array_source) = extract_assignment_array(source, "CUEMAP") else {
        return Ok(Vec::new());
    };
    array_source
        .split(',')
        .map(str::trim)
        .filter(|chunk| !chunk.is_empty())
        .map(|chunk| {
            chunk.parse::<usize>().map_err(|err| {
                error_with_fix(
                    "parse the CUEMAP array",
                    format!("invalid CUEMAP entry {chunk:?}: {err}"),
                    "Use integer cue indexes in the inline CUEMAP array and retry.",
                )
            })
        })
        .collect()
}
