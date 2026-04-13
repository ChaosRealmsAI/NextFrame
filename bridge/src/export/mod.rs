mod lifecycle;
pub(crate) mod recorder_bridge;
pub(crate) mod runner;

pub(crate) use lifecycle::{
    handle_export_cancel, handle_export_start, handle_export_status, process_registry,
    EXPORT_ERROR_CANCELED,
};
#[cfg(test)]
pub(crate) use lifecycle::{
    build_export_request, export_runtime, export_status_json, next_export_pid, percent_complete,
    remaining_secs, ExportTask, ProcessHandle, ProcessTerminal,
};
#[cfg(test)]
pub(crate) use recorder_bridge::{
    build_recording_url, decode_file_url_path, resolve_recorder_frame_path_from_url,
    RecorderRequest,
};
#[cfg(test)]
pub(crate) use runner::{
    cleanup_intermediate_video, copy_video_output, create_export_log_path,
};
