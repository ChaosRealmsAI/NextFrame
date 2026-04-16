//! `segments.json` manifest and file-convention fallback logic.

use std::fs;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde::Deserialize;

use crate::error_with_fix;

use super::js_extract::{
    extract_assignment_object, extract_inner_array, extract_object_literals, extract_object_number,
    extract_object_string,
};
use super::srt::parse_srt_file;
use super::types::SubtitleCue;

// Known-good regex literal — unwrap is safe at compile-time init
#[allow(clippy::unwrap_used)]
pub(super) static STEM_NUMBER_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+)").unwrap());

// Known-good regex literal — unwrap is safe at compile-time init
#[allow(clippy::unwrap_used)]
pub(super) static DATA_CUE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"data-cue\s*=\s*['"](\d+)['"]"#).unwrap());

#[derive(Debug, Deserialize)]
pub(super) struct SegmentsManifest {
    #[serde(rename = "audioBase")]
    #[serde(default)]
    pub(super) audio_base: Option<String>,
    #[serde(rename = "srtBase")]
    #[serde(default)]
    pub(super) srt_base: Option<String>,
    #[serde(default)]
    pub(super) cover: Option<SpecialSegment>,
    #[serde(default)]
    pub(super) ending: Option<SpecialSegment>,
    #[serde(default)]
    pub(super) segments: Vec<ManifestSegment>,
}

#[derive(Debug, Deserialize)]
pub(super) struct SpecialSegment {
    #[serde(default)]
    pub(super) audio: Option<String>,
    #[serde(default)]
    pub(super) srt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ManifestSegment {
    pub(super) id: usize,
    #[serde(default)]
    pub(super) audio: Option<String>,
    #[serde(default)]
    pub(super) srt: Option<String>,
}

#[derive(Debug)]
pub(super) struct ManifestFallback {
    pub(super) audio_path: Option<std::path::PathBuf>,
    pub(super) subtitles: Vec<SubtitleCue>,
    pub(super) cuemap: Vec<usize>,
    pub(super) total_cues: Option<usize>,
}

pub(super) fn max_data_cue(html: &str) -> Option<usize> {
    DATA_CUE_RE
        .captures_iter(html)
        .filter_map(|caps| caps.get(1))
        .filter_map(|value| value.as_str().parse::<usize>().ok())
        .max()
}

pub(super) fn parse_segments_manifest(source: &str) -> Result<SegmentsManifest, String> {
    let mut manifest: SegmentsManifest = serde_json::from_str(source).map_err(|err| {
        error_with_fix(
            "parse the segments manifest",
            err,
            "Fix the `segments.json` syntax and retry.",
        )
    })?;
    manifest.segments.sort_by_key(|entry| entry.id);
    Ok(manifest)
}

pub(super) fn load_manifest_fallback(html_path: &Path) -> Result<Option<ManifestFallback>, String> {
    let manifest_path = html_path
        .parent()
        .into_iter()
        .flat_map(Path::ancestors)
        .map(|dir| dir.join("segments.json"))
        .find(|candidate| candidate.exists());

    let Some(manifest_path) = manifest_path else {
        return Ok(Some(default_file_convention_fallback(html_path)));
    };

    let manifest_source = fs::read_to_string(&manifest_path).map_err(|err| {
        error_with_fix(
            "read the segments manifest",
            format!("failed to read {}: {err}", manifest_path.display()),
            "Ensure `segments.json` exists and is readable, then retry.",
        )
    })?;
    let manifest = parse_segments_manifest(&manifest_source).map_err(|err| {
        error_with_fix(
            "parse the segments manifest",
            format!("failed to parse {}: {err}", manifest_path.display()),
            "Fix `segments.json` and retry.",
        )
    })?;
    let manifest_dir = manifest_path.parent().ok_or_else(|| {
        error_with_fix(
            "resolve segments manifest assets",
            format!("{} has no parent directory", manifest_path.display()),
            "Place `segments.json` under a real project directory and retry.",
        )
    })?;

    let stem = html_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let segment_number = STEM_NUMBER_RE
        .captures(stem)
        .and_then(|caps| caps.get(1))
        .and_then(|value| value.as_str().parse::<usize>().ok());

    let (audio_rel, srt_rel) = match special_segment_entry(&manifest, stem) {
        Some((audio, srt)) => (audio, srt),
        None => {
            let Some(id) = segment_number else {
                return Ok(Some(default_file_convention_fallback(html_path)));
            };
            let segment = manifest.segments.iter().find(|entry| entry.id == id);
            let audio_rel = segment.and_then(|entry| entry.audio.clone());
            let srt_rel = segment.and_then(|entry| entry.srt.clone());
            (audio_rel, srt_rel)
        }
    };

    let audio_base = manifest.audio_base.as_deref().unwrap_or("./audio/");
    let srt_base = manifest.srt_base.as_deref().unwrap_or(audio_base);
    let audio_path = audio_rel.map(|rel| manifest_dir.join(audio_base).join(rel));
    let srt_path = srt_rel.map(|rel| manifest_dir.join(srt_base).join(rel));

    let subtitles = match srt_path {
        Some(path) if path.exists() => parse_srt_file(&path)?,
        _ => Vec::new(),
    };
    let total_cues = max_data_cue(&fs::read_to_string(html_path).unwrap_or_default())
        .map(|value| value + 1)
        .or_else(|| (!subtitles.is_empty()).then_some(subtitles.len()));
    let cuemap = if subtitles.is_empty() {
        Vec::new()
    } else {
        (0..total_cues.unwrap_or(subtitles.len()).min(subtitles.len())).collect()
    };

    Ok(Some(ManifestFallback {
        audio_path,
        subtitles,
        cuemap,
        total_cues,
    }))
}

fn special_segment_entry(
    manifest: &SegmentsManifest,
    stem: &str,
) -> Option<(Option<String>, Option<String>)> {
    if stem.contains("cover") {
        return manifest
            .cover
            .as_ref()
            .map(|entry| (entry.audio.clone(), entry.srt.clone()));
    }
    if stem.contains("ending") || stem.starts_with("34-") {
        return manifest
            .ending
            .as_ref()
            .map(|entry| (entry.audio.clone(), entry.srt.clone()));
    }
    None
}

pub(super) fn default_file_convention_fallback(html_path: &Path) -> ManifestFallback {
    let stem = html_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let segment_number = STEM_NUMBER_RE
        .captures(stem)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().to_string());
    let base_dir = html_path.parent().unwrap_or_else(|| Path::new("."));
    let project_dir = base_dir.parent().unwrap_or(base_dir);
    let audio_path = segment_number
        .as_ref()
        .map(|number| project_dir.join("audio").join(format!("{number}.mp3")))
        .filter(|path| path.exists());
    let subtitles = segment_number
        .as_ref()
        .map(|number| project_dir.join("audio").join(format!("{number}.srt")))
        .filter(|path| path.exists())
        .and_then(|path| parse_srt_file(&path).ok())
        .unwrap_or_default();
    let total_cues = (!subtitles.is_empty()).then_some(subtitles.len());
    let cuemap = (0..subtitles.len()).collect();
    ManifestFallback {
        audio_path,
        subtitles,
        cuemap,
        total_cues,
    }
}

// ── __SLIDE_SEGMENTS extraction ──────────────────────────────────
// Extracts audio path from: window.__SLIDE_SEGMENTS = { audio: '...', ... }
pub(super) fn extract_slide_segments_audio(html: &str) -> Option<String> {
    let block = extract_assignment_object(html, "__SLIDE_SEGMENTS")?;
    extract_object_string(&block, "audio")
}

// Extracts all SRT entries from __SLIDE_SEGMENTS.segments[].srt arrays,
// adjusting timestamps by segment offset (duration + gap).
pub(super) fn extract_slide_segments_srt(html: &str) -> Vec<SubtitleCue> {
    let Some(block) = extract_assignment_object(html, "__SLIDE_SEGMENTS") else {
        return Vec::new();
    };
    let gap = extract_object_number(&block, "gap").unwrap_or(1.0);
    let Some(segments_src) = extract_inner_array(&block, "segments") else {
        return Vec::new();
    };
    let Ok(seg_objects) = extract_object_literals(&segments_src) else {
        return Vec::new();
    };
    let mut result = Vec::new();
    let mut offset = 0.0_f64;
    for (i, seg_src) in seg_objects.iter().enumerate() {
        let duration = extract_object_number(seg_src, "duration").unwrap_or(0.0);
        // Extract the srt array inside this segment object
        if let Some(srt_src) = extract_inner_array(seg_src, "srt")
            && let Ok(srt_entries) = extract_object_literals(&srt_src)
        {
            for entry_src in &srt_entries {
                let s = extract_object_number(entry_src, "s").unwrap_or(0.0);
                let e = extract_object_number(entry_src, "e").unwrap_or(0.0);
                let t = extract_object_string(entry_src, "t").unwrap_or_default();
                result.push(SubtitleCue {
                    start: s + offset,
                    end: e + offset,
                    text: t,
                });
            }
        }
        offset += duration;
        if i < seg_objects.len() - 1 {
            offset += gap;
        }
    }
    result
}
