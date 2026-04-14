//! NextFrame `timeline.json` parsing into recorder segment metadata.

mod layers;
mod slides;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;

use crate::error_with_fix;

use super::types::{FrameMetadata, SlideType};
use layers::{
    extract_audio_src, extract_clip_audio_src, extract_clip_cuemap, extract_clip_timing,
    extract_clip_total_cues,
};
use slides::{
    build_timeline_clip_subtitles, detect_timeline_slide_type, extract_subtitles_from_value,
    preserve_clip_duration,
};

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeTimeline {
    #[serde(default)]
    pub(super) fps: Option<f64>,
    #[serde(default)]
    pub(super) project: Option<NextframeProject>,
    #[serde(default)]
    pub(super) meta: Option<NextframeMeta>,
    #[serde(default)]
    pub(super) chapters: Vec<NextframeChapter>,
    #[serde(default)]
    pub(super) markers: Vec<NextframeMarker>,
    #[serde(default)]
    pub(super) tracks: Vec<NextframeTrack>,
    #[serde(default)]
    pub(super) audio: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeProject {
    #[serde(default)]
    pub(super) fps: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeMeta {
    #[serde(default)]
    pub(super) fps: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeChapter {
    pub(super) id: String,
    pub(super) start: f64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeMarker {
    pub(super) id: String,
    pub(super) t: f64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeTrack {
    #[serde(default)]
    pub(super) clips: Vec<NextframeClip>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(super) struct NextframeClip {
    #[serde(default)]
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) scene: Option<String>,
    #[serde(default)]
    pub(super) start: Option<Value>,
    #[serde(default)]
    pub(super) end: Option<f64>,
    #[serde(default)]
    pub(super) dur: Option<f64>,
    #[serde(default, rename = "startFrame")]
    pub(super) start_frame: Option<f64>,
    #[serde(default, rename = "endFrame")]
    pub(super) end_frame: Option<f64>,
    #[serde(default, rename = "durFrames")]
    pub(super) dur_frames: Option<f64>,
    #[serde(default, rename = "durationFrames")]
    pub(super) duration_frames: Option<f64>,
    #[serde(default)]
    pub(super) params: Value,
    #[serde(default)]
    pub(super) cuemap: Vec<usize>,
    #[serde(default)]
    pub(super) total_cues: Option<usize>,
    #[serde(default, rename = "totalCues")]
    pub(super) total_cues_camel: Option<usize>,
}

/// Parses a NextFrame `timeline.json` file into recorder segment metadata.
#[allow(dead_code)]
pub(crate) fn parse_nextframe_timeline(path: &Path) -> Result<Vec<FrameMetadata>, String> {
    let timeline_path = path.canonicalize().map_err(|err| {
        error_with_fix(
            "open the NextFrame timeline",
            format!("failed to canonicalize {}: {err}", path.display()),
            "Pass an existing timeline JSON path and retry.",
        )
    })?;
    let source = fs::read_to_string(&timeline_path).map_err(|err| {
        error_with_fix(
            "read the NextFrame timeline",
            format!("failed to read {}: {err}", timeline_path.display()),
            "Ensure the timeline JSON file is readable and retry.",
        )
    })?;
    let timeline: NextframeTimeline = serde_json::from_str(&source).map_err(|err| {
        error_with_fix(
            "parse the NextFrame timeline",
            format!("failed to parse {}: {err}", timeline_path.display()),
            "Fix the timeline JSON syntax and retry.",
        )
    })?;

    let fps = timeline
        .fps
        .or_else(|| timeline.project.as_ref().and_then(|project| project.fps))
        .or_else(|| timeline.meta.as_ref().and_then(|meta| meta.fps))
        .unwrap_or(30.0);
    if !fps.is_finite() || fps <= 0.0 {
        return Err(error_with_fix(
            "parse the NextFrame timeline fps",
            format!(
                "invalid fps in {}: expected a finite number greater than 0, got {fps}",
                timeline_path.display()
            ),
            "Set `fps` to a positive finite number in the timeline JSON and retry.",
        ));
    }

    let anchors = build_timeline_anchors(&timeline);
    let global_audio_path = timeline
        .audio
        .as_ref()
        .and_then(extract_audio_src)
        .map(|src| resolve_path_from(&timeline_path, src))
        .transpose()?;
    let global_audio_cues = timeline
        .audio
        .as_ref()
        .map(|audio| extract_subtitles_from_value(audio, f64::MAX))
        .unwrap_or_default();

    let mut segments = Vec::new();
    for track in &timeline.tracks {
        for clip in &track.clips {
            let timing = extract_clip_timing(clip, fps, &anchors)?;
            let mut subtitles = build_timeline_clip_subtitles(clip, &global_audio_cues, &timing);
            let actual_subtitle_count = subtitles.len();

            let mut cuemap = extract_clip_cuemap(clip);
            let mut total_cues = extract_clip_total_cues(clip);
            if total_cues.is_none() {
                total_cues = Some(if !cuemap.is_empty() {
                    cuemap.len()
                } else {
                    actual_subtitle_count
                });
            }

            if cuemap.is_empty() && actual_subtitle_count > 0 {
                let cue_len = total_cues.unwrap_or(actual_subtitle_count);
                cuemap = (0..cue_len.min(actual_subtitle_count)).collect();
            }
            cuemap.retain(|index| *index < actual_subtitle_count);

            preserve_clip_duration(&mut subtitles, timing.duration_sec);

            let audio_path = extract_clip_audio_src(clip)
                .map(|src| resolve_path_from(&timeline_path, src))
                .transpose()?
                .or_else(|| global_audio_path.clone());
            let slide_type = clip
                .scene
                .as_deref()
                .map(detect_timeline_slide_type)
                .unwrap_or(SlideType::Clip);

            segments.push((
                timing.start_sec,
                FrameMetadata {
                    html_path: timeline_path.clone(),
                    slide_type,
                    audio_path,
                    subtitles,
                    cuemap,
                    total_cues: total_cues.unwrap_or(0),
                    warnings: Vec::new(),
                },
            ));
        }
    }

    segments.sort_by(|left, right| left.0.total_cmp(&right.0));
    Ok(segments.into_iter().map(|(_, metadata)| metadata).collect())
}

fn build_timeline_anchors(timeline: &NextframeTimeline) -> HashMap<String, f64> {
    let mut anchors = HashMap::new();
    for chapter in &timeline.chapters {
        anchors.insert(chapter.id.clone(), chapter.start);
        anchors.insert(format!("chapter-{}", chapter.id), chapter.start);
    }
    for marker in &timeline.markers {
        anchors.insert(marker.id.clone(), marker.t);
        anchors.insert(format!("marker-{}", marker.id), marker.t);
    }
    anchors
}

fn resolve_path_from(base_path: &Path, rel: &str) -> Result<PathBuf, String> {
    let path = Path::new(rel);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    let parent = base_path
        .parent()
        .ok_or_else(|| {
            error_with_fix(
                "resolve a timeline-relative asset path",
                format!("{} has no parent directory", base_path.display()),
                "Place the timeline on disk under a real directory and retry.",
            )
        })?;
    Ok(parent.join(path))
}
