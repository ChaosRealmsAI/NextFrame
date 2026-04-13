#[cfg(test)]
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use crate::storage::fs::resolve_existing_path;
use crate::util::time::trim_float;
use crate::util::validation::{require_array, require_string_alias};
use serde_json::{json, Value};

pub(crate) static FFMPEG_PATH_CACHE: OnceLock<Mutex<Option<Option<PathBuf>>>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AudioSource {
    pub(crate) path: PathBuf,
    pub(crate) start_time: f64,
    pub(crate) volume: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FfmpegCommand {
    pub(crate) program: PathBuf,
    pub(crate) args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct CommandOutput {
    pub(crate) success: bool,
    pub(crate) stderr: String,
}

pub(crate) fn handle_export_mux_audio(params: &Value) -> Result<Value, String> {
    let video_path_raw = require_string_alias(params, &["videoPath", "video_path"])?;
    let output_path_raw = require_string_alias(params, &["outputPath", "output_path"])?;
    let video_path = resolve_existing_path(video_path_raw)?;
    let output_path = crate::storage::fs::resolve_write_path(output_path_raw)?;
    let audio_sources = parse_audio_sources(params)?;

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create export directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    if audio_sources.is_empty() {
        crate::export_runner::copy_video_output(&video_path, &output_path)?;
        crate::export_runner::cleanup_intermediate_video(&video_path, &output_path);
        return Ok(json!({
            "ok": true,
            "outputPath": output_path.display().to_string(),
        }));
    }

    let Some(ffmpeg_path) = ffmpeg_command_path()? else {
        return Ok(json!({
            "ok": false,
            "error": "Install ffmpeg to export with audio. `brew install ffmpeg`",
        }));
    };

    let command = build_ffmpeg_command(ffmpeg_path, &video_path, &audio_sources, &output_path);
    let output = run_ffmpeg_command(&command).map_err(|error| {
        format!(
            "failed to run ffmpeg for '{}': {error}",
            output_path.display()
        )
    })?;

    if !output.success {
        let error = if output.stderr.is_empty() {
            "ffmpeg exited with an unknown error".to_string()
        } else {
            output.stderr
        };
        return Ok(json!({
            "ok": false,
            "error": error,
        }));
    }

    crate::export_runner::cleanup_intermediate_video(&video_path, &output_path);

    Ok(json!({
        "ok": true,
        "outputPath": output_path.display().to_string(),
    }))
}

pub(crate) fn ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let mut cache = lock_ffmpeg_path_cache()?;
    if let Some(path) = cache.as_ref() {
        return Ok(path.clone());
    }

    let detected = detect_ffmpeg_command_path()?;
    *cache = Some(detected.clone());
    Ok(detected)
}

pub(crate) fn lock_ffmpeg_path_cache(
) -> Result<std::sync::MutexGuard<'static, Option<Option<PathBuf>>>, String> {
    ffmpeg_path_cache()
        .lock()
        .map_err(|_| "ffmpeg path cache is unavailable".to_string())
}

pub(crate) fn ffmpeg_path_cache() -> &'static Mutex<Option<Option<PathBuf>>> {
    FFMPEG_PATH_CACHE.get_or_init(|| Mutex::new(None))
}

#[cfg(not(test))]
pub(crate) fn detect_ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let program = if cfg!(windows) { "where" } else { "which" };
    let output = Command::new(program)
        .arg("ffmpeg")
        .output()
        .map_err(|error| format!("failed to detect ffmpeg: {error}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next().map(str::trim).unwrap_or_default();
    if first_line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(first_line)))
    }
}

pub(crate) fn build_ffmpeg_command(
    program: PathBuf,
    video_path: &Path,
    audio_sources: &[AudioSource],
    output_path: &Path,
) -> FfmpegCommand {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        video_path.display().to_string(),
    ];

    for source in audio_sources {
        args.push("-i".to_string());
        args.push(source.path.display().to_string());
    }

    args.push("-filter_complex".to_string());
    args.push(build_ffmpeg_filter_complex(audio_sources));
    args.push("-map".to_string());
    args.push("0:v".to_string());
    args.push("-map".to_string());
    args.push("[aout]".to_string());
    args.push("-c:v".to_string());
    args.push("copy".to_string());
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push(output_path.display().to_string());

    FfmpegCommand { program, args }
}

pub(crate) fn build_ffmpeg_filter_complex(audio_sources: &[AudioSource]) -> String {
    let mut filter_parts = Vec::with_capacity(audio_sources.len() + 1);
    let mut mix_inputs = String::new();

    for (index, source) in audio_sources.iter().enumerate() {
        let input_index = index + 1;
        let label = format!("a{index}");
        let delay_ms = secs_to_millis(source.start_time);
        filter_parts.push(format!(
            "[{input_index}:a]adelay={delay_ms}:all=1,volume={}[{label}]",
            trim_float(source.volume)
        ));
        mix_inputs.push_str(&format!("[{label}]"));
    }

    filter_parts.push(format!(
        "{mix_inputs}amix=inputs={}:normalize=0[aout]",
        audio_sources.len()
    ));
    filter_parts.join(";")
}

pub(crate) fn secs_to_millis(value: f64) -> u64 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }

    (value * 1000.0).round() as u64
}

#[cfg(not(test))]
pub(crate) fn run_ffmpeg_command(command: &FfmpegCommand) -> Result<CommandOutput, String> {
    let output = std::process::Command::new(&command.program)
        .args(&command.args)
        .output()
        .map_err(|error| error.to_string())?;

    Ok(CommandOutput {
        success: output.status.success(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

pub(crate) fn parse_audio_sources(params: &Value) -> Result<Vec<AudioSource>, String> {
    let sources = require_array(params, "audioSources")?;
    let mut parsed = Vec::with_capacity(sources.len());

    for (index, source) in sources.iter().enumerate() {
        let object = source
            .as_object()
            .ok_or_else(|| format!("params.audioSources[{index}] must be an object"))?;
        let path = object
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("params.audioSources[{index}].path must be a string"))?;
        let start_time = read_audio_source_number(object, index, &["startTime", "start_time"])?;
        if !start_time.is_finite() || start_time < 0.0 {
            return Err(format!(
                "params.audioSources[{index}].startTime must be a finite number >= 0"
            ));
        }

        let volume = match object.get("volume") {
            Some(value) => value
                .as_f64()
                .ok_or_else(|| format!("params.audioSources[{index}].volume must be a number"))?,
            None => 1.0,
        };
        if !volume.is_finite() || volume < 0.0 {
            return Err(format!(
                "params.audioSources[{index}].volume must be a finite number >= 0"
            ));
        }

        parsed.push(AudioSource {
            path: resolve_existing_path(path)?,
            start_time,
            volume,
        });
    }

    Ok(parsed)
}

pub(crate) fn read_audio_source_number(
    object: &serde_json::Map<String, Value>,
    index: usize,
    keys: &[&str],
) -> Result<f64, String> {
    for key in keys {
        if let Some(value) = object.get(*key) {
            return value
                .as_f64()
                .ok_or_else(|| format!("params.audioSources[{index}].{key} must be a number"));
        }
    }

    Err(format!("missing params.audioSources[{index}].{}", keys[0]))
}

// --- test mocking ---

#[cfg(test)]
pub(crate) struct MockFfmpegState {
    pub(crate) lookup_result: Result<Option<PathBuf>, String>,
    pub(crate) runs: VecDeque<Result<CommandOutput, String>>,
    pub(crate) invocations: Vec<FfmpegCommand>,
}

#[cfg(test)]
impl Default for MockFfmpegState {
    fn default() -> Self {
        Self {
            lookup_result: Ok(None),
            runs: VecDeque::new(),
            invocations: Vec::new(),
        }
    }
}

#[cfg(test)]
pub(crate) static MOCK_FFMPEG_STATE: OnceLock<Mutex<MockFfmpegState>> = OnceLock::new();
#[cfg(test)]
pub(crate) static MOCK_FFMPEG_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn detect_ffmpeg_command_path() -> Result<Option<PathBuf>, String> {
    let state = mock_ffmpeg_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    state.lookup_result.clone()
}

#[cfg(test)]
pub(crate) fn run_ffmpeg_command(command: &FfmpegCommand) -> Result<CommandOutput, String> {
    let mut state = mock_ffmpeg_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    state.invocations.push(command.clone());
    state
        .runs
        .pop_front()
        .unwrap_or_else(|| Err("missing mock ffmpeg execution".to_string()))
}

#[cfg(test)]
pub(crate) fn mock_ffmpeg_state() -> &'static Mutex<MockFfmpegState> {
    MOCK_FFMPEG_STATE.get_or_init(|| Mutex::new(MockFfmpegState::default()))
}

#[cfg(test)]
pub(crate) fn reset_ffmpeg_path_cache_for_tests() {
    if let Ok(mut cache) = lock_ffmpeg_path_cache() {
        *cache = None;
    }
}
