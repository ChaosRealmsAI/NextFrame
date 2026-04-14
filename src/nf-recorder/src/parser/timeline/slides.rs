use serde_json::Value;

use super::super::srt::parse_subtitle_array;
use super::super::types::{ClipTiming, SlideType, SubtitleCue};
use super::NextframeClip;

pub(super) fn build_timeline_clip_subtitles(
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

pub(super) fn extract_subtitles_from_value(
    value: &Value,
    default_duration: f64,
) -> Vec<SubtitleCue> {
    find_array_field(value, &["subtitles", "subtitleCues", "captions"])
        .or_else(|| find_array_field(value, &["timestamps", "audioTimestamps", "wordTimestamps"]))
        .map(|entries| parse_subtitle_array(entries, default_duration))
        .unwrap_or_default()
}

pub(super) fn preserve_clip_duration(subtitles: &mut Vec<SubtitleCue>, clip_duration_sec: f64) {
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

pub(super) fn detect_timeline_slide_type(scene: &str) -> SlideType {
    if scene.to_ascii_lowercase().contains("bridge") {
        SlideType::Bridge
    } else {
        SlideType::Clip
    }
}

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

fn extract_text_subtitle(params: &Value) -> Option<String> {
    ["text", "subtitle"]
        .iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}
