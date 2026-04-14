use std::collections::HashMap;

use serde_json::Value;

use super::super::types::ClipTiming;
use super::NextframeClip;

pub(super) fn extract_clip_timing(
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

pub(super) fn extract_clip_cuemap(clip: &NextframeClip) -> Vec<usize> {
    if !clip.cuemap.is_empty() {
        return clip.cuemap.clone();
    }
    extract_usize_array(&clip.params, &["cuemap", "cueMap"]).unwrap_or_default()
}

pub(super) fn extract_clip_total_cues(clip: &NextframeClip) -> Option<usize> {
    clip.total_cues
        .or(clip.total_cues_camel)
        .or_else(|| extract_usize_field(&clip.params, &["total_cues", "totalCues", "total"]))
}

pub(super) fn extract_audio_src(value: &Value) -> Option<&str> {
    value
        .as_object()?
        .get("src")
        .or_else(|| value.as_object()?.get("path"))
        .and_then(Value::as_str)
        .filter(|src| !src.is_empty())
}

pub(super) fn extract_clip_audio_src(clip: &NextframeClip) -> Option<&str> {
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
