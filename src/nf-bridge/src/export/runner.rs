//! export embedded recorder runner
use std::env;
use std::fs;
use std::io::ErrorKind;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use nextframe_recorder::{record_segments, RecordArgs, RecordOutput};

use super::recorder_bridge::{resolve_recorder_frame_path_from_url, RecorderRequest};
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
        return canceled_export_error();
    }

    if let Ok(mode) = env::var("NF_BRIDGE_TEST_EXPORT_MODE") {
        return run_test_export(mode.as_str(), &request, &mut log_file);
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
        return canceled_export_error();
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
        return canceled_export_error();
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

    if let Err(error) = fs::remove_file(video_path) { // Internal: cleanup warning only; export result already finalized.
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

fn canceled_export_error() -> Result<(), String> {
    Err( // Fix: included in the error string below
        "failed to complete export: export was canceled. Fix: rerun the export if you still need the output.".to_string(),
    )
}

fn run_test_export(
    mode: &str,
    request: &RecorderRequest,
    log_file: &mut fs::File,
) -> Result<(), String> {
    if let Some(parent) = request.output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create stub export directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    match mode {
        "success" => {
            fs::write(&request.output_path, b"stub export")
                .map_err(|error| format!("failed to write stub export output: {error}"))?;
            writeln!(log_file, "Stub export completed").map_err(|error| {
                format!(
                    "failed to write export log '{}': {error}",
                    request.output_path.display()
                )
            })?;
            Ok(())
        }
        "error" => Err( // Fix: included in the error string below
            "failed to run embedded recorder: stubbed export failure. Fix: set NF_BRIDGE_TEST_EXPORT_MODE=success or unset NF_BRIDGE_TEST_EXPORT_MODE when not running the export stub.".to_string(),
        ),
        _ => Err(format!( // Fix: included in the error string below
            "failed to run embedded recorder: unknown test export mode '{mode}'. Fix: use NF_BRIDGE_TEST_EXPORT_MODE=success or NF_BRIDGE_TEST_EXPORT_MODE=error, or unset the variable."
        )),
    }
}
