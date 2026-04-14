//! NextFrame `timeline.json` parsing into recorder segment metadata.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use super::srt::parse_subtitle_array;
use super::types::{ClipTiming, FrameMetadata, SlideType, SubtitleCue};

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
    let timeline_path = path
        .canonicalize()
        .map_err(|err| format!("failed to canonicalize {}: {err}", path.display()))?;
    let source = fs::read_to_string(&timeline_path)
        .map_err(|err| format!("failed to read {}: {err}", timeline_path.display()))?;
    let timeline: NextframeTimeline = serde_json::from_str(&source)
        .map_err(|err| format!("failed to parse {}: {err}", timeline_path.display()))?;

    let fps = timeline
        .fps
        .or_else(|| timeline.project.as_ref().and_then(|project| project.fps))
        .or_else(|| timeline.meta.as_ref().and_then(|meta| meta.fps))
        .unwrap_or(30.0);
    if !fps.is_finite() || fps <= 0.0 {
        return Err(format!(
            "invalid fps in {}: expected a finite number > 0, got {fps}",
            timeline_path.display()
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

#[allow(dead_code)]
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

#[allow(dead_code)]
fn extract_clip_timing(
    clip: &NextframeClip,
    fps: f64,
    anchors: &HashMap<String, f64>,
) -> Result<ClipTiming, String> {
    let clip_label = clip.id.as_deref().unwrap_or("<unknown>");

    let (start_sec, duration_sec) =
        if let (Some(start_frame), Some(end_frame)) = (clip.start_frame, clip.end_frame) {
            (start_frame / fps, (end_frame - start_frame) / fps)
        } else if let Some(start_frame) = clip.start_frame {
            let duration_frames = clip.dur_frames.or(clip.duration_frames).ok_or_else(|| {
                format!("timeline clip {clip_label} is missing endFrame/durationFrames")
            })?;
            (start_frame / fps, duration_frames / fps)
        } else {
            let start_sec = parse_timeline_time_ref(clip.start.as_ref(), anchors).unwrap_or(0.0);
            let duration_sec = clip
                .dur
                .or_else(|| clip.end.map(|end| end - start_sec))
                .ok_or_else(|| format!("timeline clip {clip_label} is missing duration"))?;
            (start_sec, duration_sec)
        };

    if !start_sec.is_finite() || start_sec < 0.0 {
        return Err(format!(
            "timeline clip {clip_label} has invalid start time: {start_sec}"
        ));
    }
    if !duration_sec.is_finite() || duration_sec <= 0.0 {
        return Err(format!(
            "timeline clip {clip_label} has invalid duration: {duration_sec}"
        ));
    }

    Ok(ClipTiming {
        start_sec,
        duration_sec,
    })
}

#[allow(dead_code)]
fn parse_timeline_time_ref(value: Option<&Value>, anchors: &HashMap<String, f64>) -> Option<f64> {
    match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.parse().ok().or_else(|| anchors.get(text).copied()),
        Value::Object(map) => map
            .get("at")
            .and_then(Value::as_str)
            .and_then(|key| anchors.get(key).copied()),
        _ => None,
    }
}

#[allow(dead_code)]
fn build_timeline_clip_subtitles(
    clip: &NextframeClip,
    global_audio_cues: &[SubtitleCue],
    timing: &ClipTiming,
) -> Vec<SubtitleCue> {
    if let Some(array) = find_array_field(&clip.params, &["subtitles", "subtitleCues", "captions"])
    {
        let cues = parse_subtitle_array(array, timing.duration_sec);
        let cues = normalize_clip_relative_cues(cues, timing.start_sec, timing.duration_sec);
        if !cues.is_empty() {
            return cues;
        }
    }

    if let Some(array) = find_array_field(
        &clip.params,
        &["timestamps", "audioTimestamps", "wordTimestamps", "words"],
    ) {
        let cues = parse_subtitle_array(array, timing.duration_sec);
        let cues = normalize_clip_relative_cues(cues, timing.start_sec, timing.duration_sec);
        if !cues.is_empty() {
            return cues;
        }
    }

    if let Some(text) = extract_text_subtitle(&clip.params) {
        return vec![SubtitleCue {
            start: 0.0,
            end: timing.duration_sec,
            text,
        }];
    }

    slice_global_cues(global_audio_cues, timing.start_sec, timing.duration_sec)
}

#[allow(dead_code)]
fn find_array_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a [Value]> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(array) = object.get(*key).and_then(Value::as_array) {
            return Some(array.as_slice());
        }
    }
    for nested_key in ["audio", "transcript"] {
        if let Some(array) = object
            .get(nested_key)
            .and_then(|nested| find_array_field(nested, keys))
        {
            return Some(array);
        }
    }
    None
}

#[allow(dead_code)]
fn extract_subtitles_from_value(value: &Value, default_duration: f64) -> Vec<SubtitleCue> {
    find_array_field(value, &["subtitles", "subtitleCues", "captions"])
        .or_else(|| find_array_field(value, &["timestamps", "audioTimestamps", "wordTimestamps"]))
        .map(|entries| parse_subtitle_array(entries, default_duration))
        .unwrap_or_default()
}

#[allow(dead_code)]
fn normalize_clip_relative_cues(
    cues: Vec<SubtitleCue>,
    clip_start_sec: f64,
    clip_duration_sec: f64,
) -> Vec<SubtitleCue> {
    const EPSILON: f64 = 0.000_001;

    let looks_absolute = clip_start_sec > 0.0
        && cues
            .iter()
            .any(|cue| cue.start > clip_duration_sec + EPSILON)
        && cues
            .iter()
            .all(|cue| cue.start >= clip_start_sec - EPSILON && cue.end >= clip_start_sec);
    let offset = if looks_absolute { clip_start_sec } else { 0.0 };

    let mut normalized = cues
        .into_iter()
        .map(|cue| SubtitleCue {
            start: (cue.start - offset).max(0.0).min(clip_duration_sec),
            end: (cue.end - offset).max(0.0).min(clip_duration_sec),
            text: cue.text,
        })
        .filter(|cue| cue.end > cue.start)
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| left.start.total_cmp(&right.start));
    normalized
}

#[allow(dead_code)]
fn slice_global_cues(
    cues: &[SubtitleCue],
    clip_start_sec: f64,
    clip_duration_sec: f64,
) -> Vec<SubtitleCue> {
    let clip_end_sec = clip_start_sec + clip_duration_sec;
    cues.iter()
        .filter_map(|cue| {
            let start = cue.start.max(clip_start_sec);
            let end = cue.end.min(clip_end_sec);
            (end > start).then(|| SubtitleCue {
                start: start - clip_start_sec,
                end: end - clip_start_sec,
                text: cue.text.clone(),
            })
        })
        .collect()
}

#[allow(dead_code)]
fn preserve_clip_duration(subtitles: &mut Vec<SubtitleCue>, clip_duration_sec: f64) {
    if !clip_duration_sec.is_finite() || clip_duration_sec <= 0.0 {
        return;
    }

    if subtitles.is_empty() {
        subtitles.push(SubtitleCue {
            start: 0.0,
            end: clip_duration_sec,
            text: String::new(),
        });
        return;
    }

    subtitles.sort_by(|left, right| left.start.total_cmp(&right.start));
    if let Some(last_end) = subtitles.last().map(|cue| cue.end)
        && last_end < clip_duration_sec
    {
        subtitles.push(SubtitleCue {
            start: last_end,
            end: clip_duration_sec,
            text: String::new(),
        });
    }
}

#[allow(dead_code)]
fn extract_text_subtitle(params: &Value) -> Option<String> {
    ["text", "subtitle"]
        .iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

#[allow(dead_code)]
fn extract_clip_cuemap(clip: &NextframeClip) -> Vec<usize> {
    if !clip.cuemap.is_empty() {
        return clip.cuemap.clone();
    }
    extract_usize_array(&clip.params, &["cuemap", "cueMap"]).unwrap_or_default()
}

#[allow(dead_code)]
fn extract_clip_total_cues(clip: &NextframeClip) -> Option<usize> {
    clip.total_cues
        .or(clip.total_cues_camel)
        .or_else(|| extract_usize_field(&clip.params, &["total_cues", "totalCues", "total"]))
}

#[allow(dead_code)]
fn extract_usize_array(value: &Value, keys: &[&str]) -> Option<Vec<usize>> {
    let object = value.as_object()?;
    for key in keys {
        let Some(values) = object.get(*key).and_then(Value::as_array) else {
            continue;
        };
        let mut result = Vec::new();
        for value in values {
            let number = value.as_u64().or_else(|| value.as_str()?.parse().ok())?;
            result.push(number as usize);
        }
        return Some(result);
    }
    None
}

#[allow(dead_code)]
fn extract_usize_field(value: &Value, keys: &[&str]) -> Option<usize> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(number) = object
            .get(*key)
            .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        {
            return Some(number as usize);
        }
    }
    None
}

#[allow(dead_code)]
fn extract_audio_src(value: &Value) -> Option<&str> {
    value
        .as_object()?
        .get("src")
        .or_else(|| value.as_object()?.get("path"))
        .and_then(Value::as_str)
        .filter(|src| !src.is_empty())
}

#[allow(dead_code)]
fn extract_clip_audio_src(clip: &NextframeClip) -> Option<&str> {
    clip.params
        .as_object()
        .and_then(|params| params.get("audio"))
        .and_then(extract_audio_src)
        .or_else(|| {
            clip.scene
                .as_deref()
                .filter(|scene| scene.eq_ignore_ascii_case("audio"))
                .and_then(|_| extract_audio_src(&clip.params))
        })
}

#[allow(dead_code)]
fn detect_timeline_slide_type(scene: &str) -> SlideType {
    if scene.to_ascii_lowercase().contains("bridge") {
        SlideType::Bridge
    } else {
        SlideType::Clip
    }
}

#[allow(dead_code)]
fn resolve_path_from(base_path: &Path, rel: &str) -> Result<std::path::PathBuf, String> {
    let path = Path::new(rel);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    let parent = base_path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", base_path.display()))?;
    Ok(parent.join(path))
}
