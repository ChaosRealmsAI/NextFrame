pub mod encoding;
pub mod ffmpeg;

#[cfg(test)]
pub(crate) use ffmpeg::{
    build_ffmpeg_command, build_ffmpeg_filter_complex, mock_ffmpeg_state, parse_audio_sources,
    reset_ffmpeg_path_cache_for_tests, secs_to_millis, AudioSource, CommandOutput, FfmpegCommand,
    MockFfmpegState, MOCK_FFMPEG_TEST_LOCK,
};
pub(crate) use ffmpeg::{ffmpeg_command_path, handle_export_mux_audio};
