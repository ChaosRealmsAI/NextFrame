use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use nf_project::{JsonStorage, Storage, compile_composition_source, compile_episode_source};
use nf_recorder::{ExportOpts, ExportResolution};
use serde_json::{Value, json};

use crate::commands::{ExportArgs, print_json};
use crate::errors::NfError;

pub fn run(args: ExportArgs) -> Result<(), NfError> {
    let preset = ExportProfile::resolve(&args)?;
    let storage = JsonStorage::new(JsonStorage::default_root()?);
    ensure_project_exists(&storage, &args.project)?;
    let (compiled, duration_s) = if let Some(composition) = args.composition.as_deref() {
        ensure_composition_exists(&storage, &args.project, composition)?;
        let composition_json = storage.load_composition(&args.project, composition)?;
        let compiled = compile_composition_source(&storage, &args.project, &composition_json)?;
        let duration_s = compiled
            .source
            .get("duration")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0)
            / 1000.0;
        (compiled, duration_s)
    } else {
        let episode_slug = args.episode.as_deref().ok_or_else(|| {
            NfError::ValidationFailed("missing --episode or --composition".to_string())
        })?;
        ensure_episode_exists(&storage, &args.project, episode_slug)?;
        let episode = storage.load_episode(&args.project, episode_slug)?;
        let compiled = compile_episode_source(&args.project, &episode)?;
        (compiled, episode.duration)
    };
    let source_path = source_path_for_output(&args.out);
    write_json_file(&source_path, &compiled.source)?;
    let mut warnings = compiled.warnings;

    if let Some(parent) = args
        .out
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    let _quiet = if args.events {
        None
    } else {
        Some(RecorderEventQuietGuard::new())
    };
    let capture = args.diagnostics.then(nf_recorder::events::start_capture);
    let stats = runtime
        .block_on(nf_recorder::run_export_from_source(
            &source_path,
            &args.out,
            ExportOpts {
                duration_s,
                fps: preset.fps,
                bitrate_bps: preset.resolution.bitrate_bps(),
                resolution_override: Some(preset.resolution),
                parallel: Some(preset.parallel),
                ..Default::default()
            },
        ))
        .map_err(record_error)?;
    let captured_events = capture
        .map(nf_recorder::events::EventCaptureGuard::finish)
        .unwrap_or_default();

    let audio_muxed = match mux_audio_tracks(&compiled.source, &args.out, duration_s) {
        Ok(muxed) => muxed,
        Err(err) => {
            warnings.push(err);
            false
        }
    };

    let diagnostics = if args.diagnostics {
        let diagnostics_path = diagnostics_path_for_output(&args.out);
        let report = build_diagnostics_report(DiagnosticsReportInput {
            events: &captured_events,
            out: &args.out,
            source_path: &source_path,
            diagnostics_path: &diagnostics_path,
            stats: &stats,
            preset: &preset,
            audio_muxed,
            warnings: &warnings,
        });
        write_json_file(&diagnostics_path, &report)?;
        Some((diagnostics_path, report))
    } else {
        None
    };

    let mut summary = json!({
        "out": args.out.display().to_string(),
        "source": source_path.display().to_string(),
        "profile": preset.name,
        "resolution": preset.resolution.as_str(),
        "fps": preset.fps,
        "parallel": preset.parallel,
        "bytes": stats.size_bytes,
        "frames": stats.frames,
        "duration_ms": stats.duration_ms,
        "audio_muxed": audio_muxed,
        "warnings": warnings
    });
    if let Some((path, report)) = diagnostics {
        summary["diagnostics_path"] = json!(path.display().to_string());
        summary["diagnostics"] = json!({
            "path": path.display().to_string(),
            "summary": diagnostics_summary(&report),
            "slow_spans": report.get("slow_spans").cloned().unwrap_or(Value::Null),
            "top_frames": report.get("top_frames").cloned().unwrap_or(Value::Null)
        });
    }
    print_json(&summary)
}

#[derive(Debug, Clone)]
struct ExportProfile {
    name: &'static str,
    resolution: ExportResolution,
    fps: u32,
    parallel: usize,
}

impl ExportProfile {
    fn resolve(args: &ExportArgs) -> Result<Self, NfError> {
        let mut profile = match args.profile.trim().to_ascii_lowercase().as_str() {
            "draft" => Self {
                name: "draft",
                resolution: ExportResolution::P720,
                fps: 30,
                parallel: 1,
            },
            "standard" => Self {
                name: "standard",
                resolution: ExportResolution::P1080,
                fps: 30,
                parallel: 1,
            },
            "final" => Self {
                name: "final",
                resolution: ExportResolution::P1080,
                fps: 60,
                parallel: 1,
            },
            "final-fast" | "fast-final" => Self {
                name: "final-fast",
                resolution: ExportResolution::P1080,
                fps: 60,
                parallel: 2,
            },
            other => {
                return Err(NfError::ValidationFailed(format!(
                    "--profile must be draft, standard, final or final-fast (got '{other}')"
                )));
            }
        };

        if let Some(raw) = args.resolution.as_deref() {
            profile.resolution = ExportResolution::parse_str(raw).ok_or_else(|| {
                NfError::ValidationFailed(format!(
                    "--resolution must be 720p, 1080p or 4k (got '{raw}')"
                ))
            })?;
        }
        if let Some(fps) = args.fps {
            if fps != 30 && fps != 60 {
                return Err(NfError::ValidationFailed(format!(
                    "--fps must be 30 or 60 (got {fps})"
                )));
            }
            profile.fps = fps;
        }
        if let Some(parallel) = args.parallel {
            if parallel == 0 || parallel > 8 {
                return Err(NfError::ValidationFailed(format!(
                    "--parallel must be between 1 and 8 (got {parallel})"
                )));
            }
            profile.parallel = parallel;
        }
        Ok(profile)
    }
}

#[derive(Debug, Clone)]
struct AudioClip {
    src: String,
    begin_ms: u64,
    volume: f64,
}

fn mux_audio_tracks(
    source: &serde_json::Value,
    video_path: &Path,
    duration_s: f64,
) -> Result<bool, String> {
    let audio = collect_audio_clips(source);
    if audio.is_empty() {
        return Ok(false);
    }
    let ffmpeg = resolve_ffmpeg().ok_or_else(|| {
        "audio tracks found, but ffmpeg is unavailable; exported MP4 is video-only".to_string()
    })?;
    let mut audio_paths = Vec::new();
    for clip in &audio {
        match audio_src_to_path(&clip.src) {
            Some(path) if path.exists() => audio_paths.push((clip.clone(), path)),
            _ => {}
        }
    }
    if audio_paths.is_empty() {
        return Ok(false);
    }

    let muxed_path = video_path.with_extension("with-audio.mp4");
    let mut command = Command::new(ffmpeg);
    command
        .arg("-y")
        .arg("-i")
        .arg(video_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (_clip, path) in &audio_paths {
        command.arg("-i").arg(path);
    }

    let filter = audio_filter(&audio_paths, duration_s);
    command
        .arg("-filter_complex")
        .arg(filter)
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("[aout]")
        .arg("-c:v")
        .arg("copy")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        .arg("-t")
        .arg(format!("{duration_s:.3}"))
        .arg("-movflags")
        .arg("+faststart")
        .arg(&muxed_path);

    let output = command
        .output()
        .map_err(|err| format!("spawn ffmpeg for audio mux failed: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg audio mux failed: {}", stderr.trim()));
    }
    fs::rename(&muxed_path, video_path)
        .map_err(|err| format!("replace video with audio mux failed: {err}"))?;
    Ok(true)
}

fn collect_audio_clips(source: &serde_json::Value) -> Vec<AudioClip> {
    source
        .get("tracks")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter(|track| track.get("kind").and_then(serde_json::Value::as_str) == Some("audio"))
        .filter_map(|track| track.get("clips").and_then(serde_json::Value::as_array))
        .flatten()
        .filter_map(|clip| {
            let params = clip.get("params")?;
            let src = params.get("src").and_then(serde_json::Value::as_str)?;
            let begin_ms = clip
                .get("begin")
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0);
            let volume = params
                .get("volume")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(1.0);
            Some(AudioClip {
                src: src.to_string(),
                begin_ms,
                volume,
            })
        })
        .collect()
}

fn audio_filter(audio_paths: &[(AudioClip, PathBuf)], duration_s: f64) -> String {
    let mut parts = Vec::new();
    let mut labels = Vec::new();
    for (index, (clip, _path)) in audio_paths.iter().enumerate() {
        let input = index + 1;
        let label = format!("a{index}");
        parts.push(format!(
            "[{input}:a]adelay={}:all=1,volume={:.3}[{label}]",
            clip.begin_ms, clip.volume
        ));
        labels.push(format!("[{label}]"));
    }
    if labels.len() == 1 {
        parts.push(format!(
            "{}apad,atrim=0:{duration_s:.3}[aout]",
            labels.join("")
        ));
    } else {
        parts.push(format!(
            "{}amix=inputs={}:duration=longest:dropout_transition=0,apad,atrim=0:{duration_s:.3}[aout]",
            labels.join(""),
            labels.len()
        ));
    }
    parts.join(";")
}

fn audio_src_to_path(src: &str) -> Option<PathBuf> {
    let raw = src.strip_prefix("file://")?;
    Some(PathBuf::from(percent_decode(raw).ok()?))
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hi = hex_value(bytes[index + 1])?;
                let lo = hex_value(bytes[index + 2])?;
                out.push((hi << 4) | lo);
                index += 3;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|err| err.to_string())
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("invalid percent encoding".to_string()),
    }
}

fn resolve_ffmpeg() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("FFMPEG_BIN") {
        return Some(PathBuf::from(path));
    }
    for candidate in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "ffmpeg",
    ] {
        let path = PathBuf::from(candidate);
        if candidate.contains('/') {
            if path.exists() {
                return Some(path);
            }
        } else {
            return Some(path);
        }
    }
    None
}

struct RecorderEventQuietGuard;

impl RecorderEventQuietGuard {
    fn new() -> Self {
        nf_recorder::events::set_quiet(true);
        Self
    }
}

impl Drop for RecorderEventQuietGuard {
    fn drop(&mut self) {
        nf_recorder::events::set_quiet(false);
    }
}

fn source_path_for_output(out: &Path) -> PathBuf {
    let mut raw = out.as_os_str().to_os_string();
    raw.push(".source.json");
    PathBuf::from(raw)
}

fn diagnostics_path_for_output(out: &Path) -> PathBuf {
    out.with_extension("json")
}

struct DiagnosticsReportInput<'a> {
    events: &'a [Value],
    out: &'a Path,
    source_path: &'a Path,
    diagnostics_path: &'a Path,
    stats: &'a nf_recorder::OutputStats,
    preset: &'a ExportProfile,
    audio_muxed: bool,
    warnings: &'a [String],
}

fn build_diagnostics_report(input: DiagnosticsReportInput<'_>) -> Value {
    let mut frames = input
        .events
        .iter()
        .filter(|event| event.get("event").and_then(Value::as_str) == Some("record.frame"))
        .filter_map(frame_diagnostic)
        .collect::<Vec<_>>();
    frames.sort_by_key(|frame| frame.seq);
    let avg = if frames.is_empty() {
        0.0
    } else {
        frames.iter().map(|frame| frame.encode_ms).sum::<f64>() / frames.len() as f64
    };
    let max = frames
        .iter()
        .map(|frame| frame.encode_ms)
        .fold(0.0_f64, f64::max);
    let frame_budget = 1000.0 / f64::from(input.preset.fps);
    let slow_threshold = frame_budget.mul_add(1.5, 0.0).max(avg * 1.5).max(50.0);
    let top_frames = top_frames(&frames, 10);
    let slow_spans = slow_spans(&frames, slow_threshold);
    json!({
        "schema": "nextframe.export.diagnostics.v1",
        "out": input.out.display().to_string(),
        "source": input.source_path.display().to_string(),
        "diagnostics_path": input.diagnostics_path.display().to_string(),
        "profile": input.preset.name,
        "resolution": input.preset.resolution.as_str(),
        "fps": input.preset.fps,
        "parallel": input.preset.parallel,
        "duration_ms": input.stats.duration_ms,
        "frames": input.stats.frames,
        "size_bytes": input.stats.size_bytes,
        "audio_muxed": input.audio_muxed,
        "avg_ms_per_frame": round2(avg),
        "max_ms_per_frame": round2(max),
        "frame_budget_ms": round2(frame_budget),
        "slow_threshold_ms": round2(slow_threshold),
        "slow_spans": slow_spans,
        "top_frames": top_frames,
        "warnings": input.warnings
    })
}

#[derive(Debug, Clone)]
struct FrameDiagnostic {
    seq: u64,
    t_ms: u64,
    t_exact_ms: f64,
    encode_ms: f64,
}

fn frame_diagnostic(value: &Value) -> Option<FrameDiagnostic> {
    Some(FrameDiagnostic {
        seq: value.get("seq")?.as_u64()?,
        t_ms: value.get("t_ms")?.as_u64()?,
        t_exact_ms: value
            .get("t_exact_ms")
            .and_then(Value::as_f64)
            .unwrap_or_else(|| value.get("t_ms").and_then(Value::as_u64).unwrap_or(0) as f64),
        encode_ms: value.get("encode_ms")?.as_f64()?,
    })
}

fn top_frames(frames: &[FrameDiagnostic], limit: usize) -> Vec<Value> {
    let mut sorted = frames.to_vec();
    sorted.sort_by(|a, b| {
        b.encode_ms
            .total_cmp(&a.encode_ms)
            .then_with(|| a.seq.cmp(&b.seq))
    });
    sorted
        .into_iter()
        .take(limit)
        .map(|frame| {
            json!({
                "seq": frame.seq,
                "t_ms": frame.t_ms,
                "t_exact_ms": round2(frame.t_exact_ms),
                "encode_ms": round2(frame.encode_ms)
            })
        })
        .collect()
}

fn slow_spans(frames: &[FrameDiagnostic], threshold: f64) -> Vec<Value> {
    let mut spans = Vec::new();
    let mut current: Vec<&FrameDiagnostic> = Vec::new();
    for frame in frames {
        if frame.encode_ms >= threshold {
            current.push(frame);
        } else if !current.is_empty() {
            if let Some(span) = span_json(&current) {
                spans.push(span);
            }
            current.clear();
        }
    }
    if !current.is_empty() {
        if let Some(span) = span_json(&current) {
            spans.push(span);
        }
    }
    spans
}

fn span_json(frames: &[&FrameDiagnostic]) -> Option<Value> {
    let first = frames.first()?;
    let last = frames.last()?;
    let avg = frames.iter().map(|frame| frame.encode_ms).sum::<f64>() / frames.len() as f64;
    let max = frames
        .iter()
        .map(|frame| frame.encode_ms)
        .fold(0.0_f64, f64::max);
    Some(json!({
        "start_frame": first.seq,
        "end_frame": last.seq,
        "start_ms": first.t_ms,
        "end_ms": last.t_ms,
        "frames": frames.len(),
        "avg_ms_per_frame": round2(avg),
        "max_ms_per_frame": round2(max)
    }))
}

fn diagnostics_summary(report: &Value) -> Value {
    json!({
        "duration_ms": report.get("duration_ms").cloned().unwrap_or(Value::Null),
        "frames": report.get("frames").cloned().unwrap_or(Value::Null),
        "avg_ms_per_frame": report.get("avg_ms_per_frame").cloned().unwrap_or(Value::Null),
        "max_ms_per_frame": report.get("max_ms_per_frame").cloned().unwrap_or(Value::Null),
        "slow_threshold_ms": report.get("slow_threshold_ms").cloned().unwrap_or(Value::Null),
        "slow_spans": report.get("slow_spans").and_then(Value::as_array).map_or(0, Vec::len),
        "top_frames": report.get("top_frames").and_then(Value::as_array).map_or(0, Vec::len)
    })
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn write_json_file(path: &Path, value: &serde_json::Value) -> Result<(), NfError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    }
    let bytes = serde_json::to_vec_pretty(value)?;
    fs::write(path, bytes).map_err(|err| NfError::StorageFailed(err.to_string()))
}

fn ensure_project_exists(storage: &JsonStorage, project: &str) -> Result<(), NfError> {
    let path = storage.root().join(project).join("project.json");
    if path.exists() {
        return Ok(());
    }
    Err(NfError::UnknownProject {
        slug: project.to_string(),
        hint: "nf projects list".to_string(),
    })
}

fn ensure_episode_exists(
    storage: &JsonStorage,
    project: &str,
    episode: &str,
) -> Result<(), NfError> {
    let path = storage
        .root()
        .join(project)
        .join("episodes")
        .join(format!("{episode}.json"));
    if path.exists() {
        return Ok(());
    }
    Err(NfError::UnknownEpisode {
        slug: episode.to_string(),
        hint: format!("nf episodes list --project={project}"),
    })
}

fn ensure_composition_exists(
    storage: &JsonStorage,
    project: &str,
    composition: &str,
) -> Result<(), NfError> {
    let path = storage
        .root()
        .join(project)
        .join("compositions")
        .join(format!("{composition}.json"));
    if path.exists() {
        return Ok(());
    }
    Err(NfError::ValidationFailed(format!(
        "composition not found: {project}/{composition}"
    )))
}

fn record_error(err: nf_recorder::record_loop::RecordError) -> NfError {
    NfError::Remote {
        error: err.code_str().to_string(),
        detail: err.to_string(),
        hint: "check the generated .source.json and recorder runtime output".to_string(),
        exit_code: err.exit_code(),
    }
}
