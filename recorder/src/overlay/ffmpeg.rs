use std::fs;
use std::path::Path;
use std::process::Command;

use super::spec::VideoOverlaySpec;

const OVERLAY_X: usize = 80;
const OVERLAY_Y: usize = 276;
const OVERLAY_WIDTH: usize = 920;
const OVERLAY_HEIGHT: usize = 538;

pub(super) fn build_overlay_filter() -> String {
    format!(
        "[1:v]scale={OVERLAY_WIDTH}:{OVERLAY_HEIGHT}:force_original_aspect_ratio=decrease,\
         pad={OVERLAY_WIDTH}:{OVERLAY_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black[vid];\
         [0:v][vid]overlay={OVERLAY_X}:{OVERLAY_Y}[out]"
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

pub fn overlay_video_layers(recorded: &Path, layers: &[VideoOverlaySpec]) -> Result<(), String> {
    if layers.is_empty() {
        return Ok(());
    }

    println!("  overlay: compositing {} video layer(s)", layers.len());
    let temp_out = recorded.with_extension("overlay.mp4");
    let filter = build_video_layer_filter(layers);
    let mut command = Command::new("ffmpeg");
    command.args(["-y", "-i"]).arg(recorded);
    for layer in layers {
        command.arg("-i").arg(&layer.source_path);
    }
    let status = command
        .args(["-filter_complex", &filter])
        .args(["-map", "[out]"])
        .args(["-map", "0:a?"])
        .args(["-c:v", "h264_videotoolbox", "-q:v", "65"])
        .args(["-c:a", "copy"])
        .args(["-movflags", "+faststart"])
        .arg(&temp_out)
        .output()
        .map_err(|err| format!("ffmpeg failed to start: {err}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!(
            "ffmpeg video-layer overlay failed:\n{}",
            &stderr[stderr.len().saturating_sub(500)..]
        ));
    }

    fs::rename(&temp_out, recorded)
        .map_err(|err| format!("failed to rename overlay output: {err}"))?;
    Ok(())
}

/// Overlay a source video into the recorded clip's black video area.
/// Video area: x:80 y:276 w:920 h:538 in 1080x1920 output.
pub fn overlay_video(recorded: &Path, video: &Path) -> Result<(), String> {
    println!("  overlay: {} → video area", video.display());
    let temp_out = recorded.with_extension("overlay.mp4");

    let filter = build_overlay_filter();

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
        .map_err(|err| format!("ffmpeg failed to start: {err}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!(
            "ffmpeg overlay failed:\n{}",
            &stderr[stderr.len().saturating_sub(300)..]
        ));
    }

    fs::rename(&temp_out, recorded)
        .map_err(|err| format!("failed to rename overlay output: {err}"))?;

    let size_mb = fs::metadata(recorded)
        .map(|meta| meta.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    println!("  ✓ overlay done: {:.1} MB\n", size_mb);
    Ok(())
}
