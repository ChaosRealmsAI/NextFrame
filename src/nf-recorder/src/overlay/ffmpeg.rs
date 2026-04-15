//! overlay ffmpeg helpers
use std::fs;
use std::path::Path;
use std::process::Command;

use super::spec::VideoOverlaySpec;
use crate::error_with_fix;

// Design-space constants for 1080×1920 layout (dpr=1 / CSS pixels)
const OVERLAY_X_CSS: f64 = 80.0;
const OVERLAY_Y_CSS: f64 = 276.0;
const OVERLAY_WIDTH_CSS: f64 = 920.0;
const OVERLAY_HEIGHT_CSS: f64 = 538.0;

pub(super) fn build_overlay_filter(dpr: f64) -> String {
    let x = (OVERLAY_X_CSS * dpr).round() as usize;
    let y = (OVERLAY_Y_CSS * dpr).round() as usize;
    let w = (OVERLAY_WIDTH_CSS * dpr).round() as usize;
    let h = (OVERLAY_HEIGHT_CSS * dpr).round() as usize;
    format!(
        "[1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,\
         pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black[vid];\
         [0:v][vid]overlay={x}:{y}[out]"
    )
}

pub(super) fn build_video_layer_filter(layers: &[VideoOverlaySpec]) -> String {
    let mut filters = Vec::with_capacity(layers.len() * 3);
    let mut current = "[0:v]".to_owned();

    for (index, layer) in layers.iter().enumerate() {
        let scaled = format!("[layer{index}_scaled]");
        let shifted = format!("[layer{index}_shifted]");
        let output = if index + 1 == layers.len() {
            "[out]".to_owned()
        } else {
            format!("[base{}]", index + 1)
        };
        let end_sec = layer.start_sec + layer.duration_sec.max(0.0);

        filters.push(format!(
            "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black{}",
            index + 1,
            layer.width,
            layer.height,
            layer.width,
            layer.height,
            scaled
        ));
        filters.push(format!(
            "{}setpts=PTS-STARTPTS+{:.6}/TB{}",
            scaled, layer.start_sec, shifted
        ));
        filters.push(format!(
            "{}{}overlay={}:{}:enable='between(t,{:.6},{:.6})':eof_action=pass{}",
            current, shifted, layer.x, layer.y, layer.start_sec, end_sec, output
        ));
        current = output;
    }

    filters.join(";")
}

/// Build an audio filter chain that extracts each overlay video's audio track,
/// delays it to its timeline start, and mixes everything into [aout].
/// Returns empty string if no layers (caller should skip audio mapping).
pub(super) fn build_audio_layer_filter(layers: &[VideoOverlaySpec]) -> String {
    if layers.is_empty() {
        return String::new();
    }
    let mut filters = Vec::with_capacity(layers.len() + 1);
    let mut labels = Vec::with_capacity(layers.len());
    for (index, layer) in layers.iter().enumerate() {
        let label = format!("[aud{index}]");
        let delay_ms = (layer.start_sec * 1000.0).round().max(0.0) as u64;
        let dur = layer.duration_sec.max(0.0);
        // atrim the source audio to its clip duration, reset PTS, delay to timeline start
        filters.push(format!(
            "[{}:a]atrim=0:{:.6},asetpts=PTS-STARTPTS,adelay={delay_ms}|{delay_ms}{label}",
            index + 1,
            dur
        ));
        labels.push(label);
    }
    if labels.len() == 1 {
        // Single clip — still need a named output
        filters.push(format!("{}aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]", labels[0]));
    } else {
        let mix_inputs = labels.join("");
        filters.push(format!(
            "{mix_inputs}amix=inputs={}:duration=longest:normalize=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]",
            labels.len()
        ));
    }
    filters.join(";")
}

pub fn overlay_video_layers(recorded: &Path, layers: &[VideoOverlaySpec]) -> Result<(), String> {
    if layers.is_empty() {
        return Ok(());
    }

    trace_log!("overlay: compositing {} video layer(s)", layers.len());
    let temp_out = recorded.with_extension("overlay.mp4");
    let video_filter = build_video_layer_filter(layers);
    let audio_filter = build_audio_layer_filter(layers);
    let combined_filter = if audio_filter.is_empty() {
        video_filter
    } else {
        format!("{video_filter};{audio_filter}")
    };
    let mut command = Command::new("ffmpeg");
    command.args(["-y", "-i"]).arg(recorded);
    for layer in layers {
        command.arg("-i").arg(&layer.source_path);
    }
    let status = command
        .args(["-filter_complex", &combined_filter])
        .args(["-map", "[out]"])
        .args(["-map", "[aout]"])
        .args(["-c:v", "h264_videotoolbox", "-q:v", "65"])
        .args(["-c:a", "aac", "-b:a", "192k"])
        .args(["-movflags", "+faststart"])
        .arg(&temp_out)
        .output()
        .map_err(|err| {
            error_with_fix(
                "start ffmpeg for video-layer overlay",
                err,
                "Install ffmpeg and make sure it is available on PATH.",
            )
        })?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "overlay video layers with ffmpeg",
                &stderr[stderr.len().saturating_sub(500)..],
                "Inspect the ffmpeg stderr output, verify the input files, and retry.",
            ),
        );
    }

    fs::rename(&temp_out, recorded).map_err(|err| {
        error_with_fix(
            "replace the recorded output with the overlay result",
            err,
            "Check that the output path is writable and retry the recording job.",
        )
    })?;
    Ok(())
}

/// Overlay a source video into the recorded clip's black video area.
/// Video area design coords: x:80 y:276 w:920 h:538 (scaled by dpr for actual output).
pub fn overlay_video(recorded: &Path, video: &Path, dpr: f64) -> Result<(), String> {
    trace_log!(
        "overlay: {} -> video area (dpr={:.2})",
        video.display(),
        dpr
    );
    let temp_out = recorded.with_extension("overlay.mp4");

    let filter = build_overlay_filter(dpr);

    let status = Command::new("ffmpeg")
        .args(["-y"])
        .args(["-i", &recorded.to_string_lossy()])
        .args(["-i", &video.to_string_lossy()])
        .args(["-filter_complex", &filter])
        .args(["-map", "[out]"])
        .args(["-map", "0:a"])
        .args(["-c:v", "h264_videotoolbox", "-q:v", "65"])
        .args(["-c:a", "copy"])
        .arg(&temp_out)
        .output()
        .map_err(|err| {
            error_with_fix(
                "start ffmpeg for video overlay",
                err,
                "Install ffmpeg and make sure it is available on PATH.",
            )
        })?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "overlay the source video with ffmpeg",
                &stderr[stderr.len().saturating_sub(300)..],
                "Inspect the ffmpeg stderr output, verify the input files, and retry.",
            ),
        );
    }

    fs::rename(&temp_out, recorded).map_err(|err| {
        error_with_fix(
            "replace the recorded output with the overlay result",
            err,
            "Check that the output path is writable and retry the recording job.",
        )
    })?;

    let size_mb = fs::metadata(recorded)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    trace_log!("overlay done: {:.1} MB", size_mb);
    Ok(())
}
