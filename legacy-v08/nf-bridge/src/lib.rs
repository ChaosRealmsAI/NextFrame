//! nf-bridge library exports
#![deny(unused)]

#[macro_use]
mod util;

mod codec;
mod domain;
mod export;
mod storage;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use codec::{ffmpeg_command_path, handle_export_mux_audio};
use domain::{
    handle_audio_get, handle_audio_status, handle_audio_synth, handle_episode_create,
    handle_episode_list, handle_project_create, handle_project_list, handle_scene_list,
    handle_script_get, handle_script_set, handle_segment_list, handle_segment_video_url,
    handle_source_clips, handle_source_cut, handle_source_download, handle_source_list,
    handle_source_transcribe, handle_timeline_load, handle_timeline_save,
};
use export::{
    handle_export_cancel, handle_export_log, handle_export_start, handle_export_status,
    process_registry,
};
use storage::{
    handle_autosave_clear, handle_autosave_list, handle_autosave_recover, handle_autosave_write,
    handle_fs_list_dir, handle_fs_mtime, handle_fs_read, handle_fs_write, handle_fs_write_base64,
    handle_recent_add, handle_recent_clear, handle_recent_list,
};
use util::dialog::{handle_fs_dialog_open, handle_fs_dialog_save, handle_fs_reveal};
use util::{handle_compose_generate, handle_log, handle_preview_bundle, handle_preview_frame};

pub mod path {
    pub use crate::util::path::*;
}

#[cfg(test)]
use util::{dialog, time, validation};

#[derive(Debug, Deserialize, Serialize)]
pub struct Request {
    pub id: String,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Response {
    pub id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
}

pub fn initialize() -> Result<(), String> {
    let _ = process_registry();
    let _ = ffmpeg_command_path()?;
    Ok(())
}

pub fn dispatch(req: Request) -> Response {
    let Request { id, method, params } = req;

    match dispatch_inner(&method, params) {
        Ok(result) => Response {
            id,
            ok: true,
            result,
            error: None,
        },
        Err(error) => Response {
            // Internal: response forwards validated handler errors unchanged.
            id,
            ok: false,
            result: Value::Null,
            error: Some(error),
        },
    }
}

fn dispatch_inner(method: &str, params: Value) -> Result<Value, String> {
    let params_preview = truncate_json_preview(&params, 200);
    let started_at = Instant::now();
    let result = match method {
        "autosave.write" => handle_autosave_write(&params),
        "autosave.list" => handle_autosave_list(&params),
        "autosave.clear" => handle_autosave_clear(&params),
        "autosave.recover" => handle_autosave_recover(&params),
        "compose.generate" => handle_compose_generate(&params),
        "fs.read" => handle_fs_read(&params),
        "fs.write" => handle_fs_write(&params),
        "fs.listDir" => handle_fs_list_dir(&params),
        "fs.dialogOpen" => handle_fs_dialog_open(&params),
        "fs.dialogSave" => handle_fs_dialog_save(&params),
        "fs.reveal" => handle_fs_reveal(&params),
        "fs.writeBase64" => handle_fs_write_base64(&params),
        "export.start" => handle_export_start(&params),
        "export.status" => handle_export_status(&params),
        "export.cancel" => handle_export_cancel(&params),
        "export.log" => handle_export_log(&params),
        "export.muxAudio" => handle_export_mux_audio(&params),
        "log" => handle_log(&params),
        "recent.list" => handle_recent_list(&params),
        "recent.add" => handle_recent_add(&params),
        "recent.clear" => handle_recent_clear(&params),
        "scene.list" => handle_scene_list(&params),
        "timeline.load" => handle_timeline_load(&params),
        "timeline.save" => handle_timeline_save(&params),
        "project.list" => handle_project_list(&params),
        "project.create" => handle_project_create(&params),
        "episode.list" => handle_episode_list(&params),
        "episode.create" => handle_episode_create(&params),
        "segment.list" => handle_segment_list(&params),
        "segment.videoUrl" => handle_segment_video_url(&params),
        "script.get" => handle_script_get(&params),
        "script.set" => handle_script_set(&params),
        "audio.get" => handle_audio_get(&params),
        "source.cut" => handle_source_cut(&params),
        "source.clips" => handle_source_clips(&params),
        "source.list" => handle_source_list(&params),
        "source.download" => handle_source_download(&params),
        "source.transcribe" => handle_source_transcribe(&params),
        "audio.synth" => handle_audio_synth(&params),
        "audio.status" => handle_audio_status(&params),
        "preview.frame" => handle_preview_frame(&params),
        "preview.bundle" => handle_preview_bundle(&params),
        "fs.mtime" => handle_fs_mtime(&params),
        _ => Err(format!( // Fix: included in the error string below
            "failed to dispatch request: unknown method: {method}. Fix: use one of the supported nf-bridge IPC methods."
        )),
    };
    let duration_ms = started_at.elapsed().as_millis();

    match &result {
        Ok(_) => trace_log!(
            module: "ipc",
            event: "dispatch",
            data: {
                "method": method,
                "params": params_preview,
                "status": "ok",
                "duration_ms": duration_ms,
            }
        ),
        Err(error) => {
            trace_log!( // Internal: log sink records the already-formatted handler error.
                module: "ipc",
                event: "dispatch",
                data: {
                    "method": method,
                    "params": params_preview,
                    "status": "error",
                    "error": error,
                    "duration_ms": duration_ms,
                }
            )
        }
    }

    result
}

fn truncate_json_preview(value: &Value, limit: usize) -> String {
    match serde_json::to_string(value) {
        Ok(serialized) => truncate_text(&serialized, limit),
        Err(error) => format!("<failed to serialize params: {error}>"), // Internal: debug-only params preview fallback.
    }
}

fn truncate_text(text: &str, limit: usize) -> String {
    let mut truncated = String::new();
    for (index, ch) in text.chars().enumerate() {
        if index == limit {
            truncated.push_str("...");
            return truncated;
        }
        truncated.push(ch);
    }
    truncated
}

// ---------------------------------------------------------------------------
// Test-visible re-exports: tests use `super::*` so we pull in everything they need
// ---------------------------------------------------------------------------
#[cfg(test)]
use codec::encoding;
#[cfg(test)]
use codec::{
    build_ffmpeg_command, build_ffmpeg_filter_complex, mock_ffmpeg_state, parse_audio_sources,
    reset_ffmpeg_path_cache_for_tests, secs_to_millis, AudioSource, CommandOutput, FfmpegCommand,
    MockFfmpegState, MOCK_FFMPEG_TEST_LOCK,
};
#[cfg(test)]
use export::{
    build_export_request, build_recording_url, cleanup_intermediate_video, copy_video_output,
    create_export_log_path, decode_file_url_path, export_runtime, export_status_json,
    next_export_pid, percent_complete, remaining_secs, resolve_recorder_frame_path_from_url,
    ExportTask, ProcessHandle, ProcessTerminal, RecorderRequest,
};
#[cfg(test)]
use path::home_dir;
#[cfg(test)]
use storage::{
    autosave_storage_test_lock, recent_storage_test_lock, resolve_write_path,
    set_autosave_storage_path_override_for_tests, set_recent_storage_path_override_for_tests,
};

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests;
