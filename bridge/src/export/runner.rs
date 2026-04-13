use std::env;
use std::fs;
use std::io::ErrorKind;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use nextframe_recorder::api::{record_segments, RecordArgs, RecordOutput};

use super::recorder_bridge::{resolve_recorder_frame_path_from_url, RecorderRequest};
use crate::export::EXPORT_ERROR_CANCELED;
use crate::util::time::trim_float;

pub(crate) fn run_embedded_recorder(
    request: RecorderRequest,
    log_path: &Path,
    cancel_requested: Arc<AtomicBool>,
) -> Result<(), String> {
    let mut log_file = fs::File::create(log_path).map_err(|error| {
        format!(
            "failed to create export log '{}': {error}",
            log_path.display()
        )
    })?;

    writeln!(
        log_file,
        "Starting embedded recorder for '{}' from '{}' ({}x{} @ {}fps, {}s)",
        request.output_path.display(),
        request.url,
        request.width,
        request.height,
        request.fps,
        trim_float(request.duration)
    )
    .map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;

    if cancel_requested.load(Ordering::SeqCst) {
        return Err(EXPORT_ERROR_CANCELED.to_string());
    }

    let current_dir =
        env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?;
    let frame_path = resolve_recorder_frame_path_from_url(&request.url, &current_dir)?;
    let args = RecordArgs {
        frames: vec![frame_path.clone()],
        dir: None,
        out: request.output_path.clone(),
        fps: request.fps as usize,
        crf: request.crf,
        dpr: 2.0,
        jobs: None,
        no_skip: false,
        headed: false,
        width: request.width as f64,
        height: request.height as f64,
        parallel: None,
        skip_aggressive: false,
        frame_range: None,
        render_scale: 1.0,
        disable_audio: false,
    };

    writeln!(
        log_file,
        "Resolved recorder frame '{}' from '{}'",
        frame_path.display(),
        request.url
    )
    .map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;
    writeln!(
        log_file,
        "Recorder args: {}",
        serde_json::to_string(&args)
            .map_err(|error| format!("failed to serialize recorder args: {error}"))?
    )
    .map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;

    if cancel_requested.load(Ordering::SeqCst) {
        return Err(EXPORT_ERROR_CANCELED.to_string());
    }

    let output: RecordOutput = record_segments(args).map_err(|error| {
        let _ = writeln!(log_file, "Recorder failed: {error}");
        error
    })?;

    writeln!(log_file, "Recorder output:").map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;
    serde_json::to_writer_pretty(&mut log_file, &output).map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;
    writeln!(log_file).map_err(|error| {
        format!(
            "failed to write export log '{}': {error}",
            log_path.display()
        )
    })?;

    if cancel_requested.load(Ordering::SeqCst) {
        let _ = writeln!(log_file, "Cancellation requested during recording");
        return Err(EXPORT_ERROR_CANCELED.to_string());
    }

    Ok(())
}

pub(crate) fn copy_video_output(video_path: &Path, output_path: &Path) -> Result<(), String> {
    if video_path == output_path {
        return Ok(());
    }

    fs::copy(video_path, output_path).map_err(|error| {
        format!(
            "failed to copy '{}' to '{}': {error}",
            video_path.display(),
            output_path.display()
        )
    })?;

    Ok(())
}

pub(crate) fn cleanup_intermediate_video(video_path: &Path, output_path: &Path) {
    if video_path == output_path {
        return;
    }

    if let Err(error) = fs::remove_file(video_path) {
        if error.kind() != ErrorKind::NotFound {
            trace_log!(
                "warning: failed to remove intermediate export '{}': {error}",
                video_path.display()
            );
        }
    }
}

pub(crate) fn create_export_log_path() -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock before unix epoch: {error}"))?
        .as_secs();

    Ok(env::temp_dir().join(format!("nextframe-export-{timestamp}.log")))
}
