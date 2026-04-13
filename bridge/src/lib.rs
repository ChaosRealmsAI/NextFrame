#![deny(unused)]

#[macro_use]
mod util;

mod encoding;
mod episode;
mod export;
mod export_runner;
mod ffmpeg;
mod project;
mod recorder_bridge;
mod scene;
mod segment;
mod storage;
mod timeline;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use episode::{handle_episode_create, handle_episode_list};
use export::{handle_export_cancel, handle_export_start, handle_export_status, process_registry};
use ffmpeg::{ffmpeg_command_path, handle_export_mux_audio};
use project::{handle_project_create, handle_project_list};
use scene::handle_scene_list;
use segment::{handle_segment_list, handle_segment_video_url};
use storage::{
    handle_autosave_clear, handle_autosave_list, handle_autosave_recover, handle_autosave_write,
    handle_fs_list_dir, handle_fs_mtime, handle_fs_read, handle_fs_write, handle_fs_write_base64,
    handle_recent_add, handle_recent_clear, handle_recent_list,
};
use timeline::{handle_timeline_load, handle_timeline_save};
use util::dialog::{handle_fs_dialog_open, handle_fs_dialog_save, handle_fs_reveal};
use util::{handle_compose_generate, handle_log, handle_preview_frame};

pub use util::path;

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
            id,
            ok: false,
            result: Value::Null,
            error: Some(error),
        },
    }
}

fn dispatch_inner(method: &str, params: Value) -> Result<Value, String> {
    match method {
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
        "preview.frame" => handle_preview_frame(&params),
        "fs.mtime" => handle_fs_mtime(&params),
        _ => Err(format!("unknown method: {method}")),
    }
}

// ---------------------------------------------------------------------------
// Test-visible re-exports: tests use `super::*` so we pull in everything they need
// ---------------------------------------------------------------------------
#[cfg(test)]
use export::{
    build_export_request, export_runtime, export_status_json, next_export_pid, percent_complete,
    remaining_secs, ExportTask, ProcessHandle, ProcessTerminal,
};
#[cfg(test)]
use export_runner::{cleanup_intermediate_video, copy_video_output, create_export_log_path};
#[cfg(test)]
use ffmpeg::{build_ffmpeg_command, parse_audio_sources, secs_to_millis};
#[cfg(test)]
use ffmpeg::{
    build_ffmpeg_filter_complex, mock_ffmpeg_state, reset_ffmpeg_path_cache_for_tests, AudioSource,
    CommandOutput, FfmpegCommand, MockFfmpegState, MOCK_FFMPEG_TEST_LOCK,
};
#[cfg(test)]
use path::home_dir;
#[cfg(test)]
use storage::{
    autosave_storage_test_lock, recent_storage_test_lock, resolve_write_path,
    set_autosave_storage_path_override_for_tests, set_recent_storage_path_override_for_tests,
};
#[cfg(test)]
use recorder_bridge::{
    build_recording_url, decode_file_url_path, resolve_recorder_frame_path_from_url,
    RecorderRequest,
};

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests;
