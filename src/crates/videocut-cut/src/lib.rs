//! ffmpeg-based precise clip cutting for `videocut cut`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, bail};
use serde::Serialize;
use videocut_core::{
    ClipFailure, ClipResult, CutReport, Plan, PlanClip, Sentences, clamp_range, probe_duration,
    round2,
};

// ffmpeg re-encode rounds the output to a whole number of video frames.
// At 30 fps that's ~33 ms per frame; we allow up to ~4 frames of slack
// so a clip cleanly landing on a frame boundary doesn't get rejected.
const DURATION_TOLERANCE_SEC: f64 = 0.15;

/// CLI-facing cut configuration.
#[derive(Debug, Clone)]
pub struct CutOptions {
    pub video: PathBuf,
    pub sentences_path: PathBuf,
    pub plan_path: PathBuf,
    pub out_dir: PathBuf,
    pub margin_sec: f64,
}

/// Per-clip progress event for NDJSON streaming.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    pub clip_num: u32,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Cut clips from a source video according to a sentence-id plan.
pub fn cut_plan<F>(options: &CutOptions, mut on_progress: F) -> Result<CutReport>
where
    F: FnMut(&ProgressEvent),
{
    fs::create_dir_all(&options.out_dir)
        .with_context(|| format!("create {}", options.out_dir.display()))?;
    let sentences = Sentences::from_path(&options.sentences_path)?;
    let plan = Plan::from_path(&options.plan_path)?;

    let mut report = CutReport {
        success: Vec::new(),
        failed: Vec::new(),
    };

    for clip in &plan.clips {
        match cut_one(
            &options.video,
            &sentences,
            clip,
            &options.out_dir,
            options.margin_sec,
        ) {
            Ok(result) => {
                on_progress(&ProgressEvent {
                    clip_num: result.clip_num,
                    status: "ok",
                    file: Some(result.file.clone()),
                    start: Some(result.start),
                    end: Some(result.end),
                    duration: Some(result.duration),
                    error: None,
                });
                report.success.push(result);
            }
            Err((failure, cause)) => {
                on_progress(&ProgressEvent {
                    clip_num: failure.clip_num,
                    status: "failed",
                    file: None,
                    start: None,
                    end: None,
                    duration: None,
                    error: Some(failure.error.clone()),
                });
                report.failed.push(ClipFailure { cause, ..failure });
            }
        }
    }

    Ok(report)
}

/// Cut one precisely aligned clip by start and duration.
pub fn cut_clip(video: &Path, start_sec: f64, duration_sec: f64, output: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-ss")
        .arg(format!("{:.3}", (start_sec - 1.0).max(0.0)))
        .arg("-copyts")
        .arg("-i")
        .arg(video)
        .arg("-ss")
        .arg(format!("{start_sec:.3}"))
        .arg("-t")
        .arg(format!("{duration_sec:.3}"))
        .arg("-start_at_zero")
        .arg("-c:v")
        .arg("libx264")
        .arg("-crf")
        .arg("18")
        .arg("-preset")
        .arg("fast")
        .arg("-bf")
        .arg("0")
        .arg("-vsync")
        .arg("cfr")
        .arg("-c:a")
        .arg("aac")
        .arg("-ar")
        .arg("44100")
        .arg("-ac")
        .arg("2")
        .arg("-b:a")
        .arg("192k")
        .arg("-avoid_negative_ts")
        .arg("make_zero")
        .arg("-muxpreload")
        .arg("0")
        .arg("-muxdelay")
        .arg("0")
        .arg("-movflags")
        .arg("+faststart")
        .arg("-loglevel")
        .arg("error")
        .arg(output)
        .status()
        .context("run ffmpeg cut")?;

    if !status.success() {
        bail!("ffmpeg cut failed with exit {:?}", status.code());
    }
    Ok(())
}

fn cut_one(
    video: &Path,
    sentences: &Sentences,
    clip: &PlanClip,
    out_dir: &Path,
    margin_sec: f64,
) -> std::result::Result<ClipResult, (ClipFailure, String)> {
    let first = match sentences.sentence_by_id(clip.from) {
        Some(sentence) => sentence,
        None => return Err(failure(clip, "sentence not found", "plan-mismatch")),
    };
    let last = match sentences.sentence_by_id(clip.to) {
        Some(sentence) => sentence,
        None => return Err(failure(clip, "sentence not found", "plan-mismatch")),
    };
    if clip.from > clip.to || last.end <= first.start {
        return Err(failure(
            clip,
            "clip sentence range is invalid",
            "plan-mismatch",
        ));
    }

    let requested_start = first.start - margin_sec;
    let requested_end = last.end + margin_sec;
    let (start_sec, end_sec) =
        clamp_range(requested_start, requested_end, sentences.audio_duration_sec);
    let duration_sec = end_sec - start_sec;
    let file_name = format!("clip_{:02}.mp4", clip.id);
    let output = out_dir.join(&file_name);

    if let Err(error) = cut_clip(video, start_sec, duration_sec, &output) {
        return Err(failure(clip, &format!("{error:#}"), "ffmpeg"));
    }

    let actual_duration = match probe_duration(&output) {
        Ok(duration) => duration,
        Err(error) => return Err(failure(clip, &format!("{error:#}"), "ffprobe")),
    };
    if (round2(actual_duration) - round2(duration_sec)).abs() > DURATION_TOLERANCE_SEC {
        return Err(failure(
            clip,
            &format!(
                "output duration {:.3}s differs from requested {:.3}s",
                actual_duration, duration_sec
            ),
            "duration-mismatch",
        ));
    }

    Ok(ClipResult {
        clip_num: clip.id,
        title: clip.title.clone(),
        from_id: clip.from,
        to_id: clip.to,
        start: round2(start_sec),
        end: round2(end_sec),
        duration: round2(actual_duration),
        file: file_name,
        text_preview: build_text_preview(&first.text, &last.text, clip.from == clip.to),
    })
}

fn failure(clip: &PlanClip, error: &str, cause: &str) -> (ClipFailure, String) {
    (
        ClipFailure {
            clip_num: clip.id,
            title: clip.title.clone(),
            from_id: clip.from,
            to_id: clip.to,
            error: error.to_string(),
            cause: cause.to_string(),
        },
        cause.to_string(),
    )
}

fn build_text_preview(first_text: &str, last_text: &str, same_sentence: bool) -> String {
    if same_sentence {
        return first_text.to_string();
    }

    let head = first_text.chars().take(40).collect::<String>();
    let tail = {
        let chars = last_text.chars().collect::<Vec<_>>();
        let start = chars.len().saturating_sub(40);
        chars[start..].iter().collect::<String>()
    };
    format!("{head}  ...  {tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_shortens_head_and_tail() {
        let preview = build_text_preview(
            "0123456789012345678901234567890123456789abc",
            "abcdefghijklmnopqrstuvwxyz0123456789TAIL",
            false,
        );
        assert!(preview.starts_with("0123456789012345678901234567890123456789"));
        assert!(preview.ends_with("efghijklmnopqrstuvwxyz0123456789TAIL"));
    }

    #[test]
    fn preview_for_single_sentence_uses_full_text() {
        assert_eq!(
            build_text_preview("Only one.", "Ignored", true),
            "Only one."
        );
    }
}
