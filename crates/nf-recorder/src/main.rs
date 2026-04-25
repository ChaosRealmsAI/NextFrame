//! `nf-recorder` binary entry point · record / snapshot / verify dispatch.
//!
//! Historical: v1.14 T-09 / T-17 / T-18 entry point.
//!
//! Single-threaded tokio runtime so the inner `call_async` future can pump
//! the macOS main run loop on the calling thread (WKWebView / CARenderer
//! require main thread · see `nf-shell-mac::headless::mac`).
//!
//! ## Dispatch
//! - No subcommand → legacy record path (`record_loop::run`).
//! - `snapshot <bundle> --t-ms ... -o ...` → single-frame PNG (`snapshot::snapshot`).
//! - `verify <file> [...]` → MP4 atom verifier (`verify_mp4::verify`).

use std::process::ExitCode;

use nf_recorder::cli::{self, Command};
use nf_recorder::events::{emit, Event};
use nf_recorder::orchestrator;
use nf_recorder::record_loop::{run, RecordError};
use nf_recorder::snapshot;
use nf_recorder::verify_mp4;
use nf_recorder::{ExportOpts, ExportResolution};

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let parsed = cli::parse();

    match parsed.command {
        Some(Command::ValidateSource { source }) => dispatch_validate_source(source),
        Some(Command::Export {
            source,
            profile,
            output,
            diagnostics,
            events,
            resolution,
            fps,
            parallel,
        }) => {
            dispatch_source_export(SourceExportArgs {
                source,
                profile,
                output,
                diagnostics,
                events,
                resolution,
                fps,
                parallel,
            })
            .await
        }
        Some(Command::SnapshotSource {
            source,
            t_ms,
            output,
            resolution,
        }) => dispatch_snapshot_source(source, t_ms, output, resolution).await,
        Some(Command::Snapshot {
            bundle,
            t_ms,
            output,
            viewport,
        }) => dispatch_snapshot(bundle, t_ms, output, &viewport).await,
        Some(Command::Verify {
            file,
            expect_fps,
            expect_bitrate,
            json: _json,
        }) => dispatch_verify(file, expect_fps, expect_bitrate),
        None => dispatch_record(parsed).await,
    }
}

// ───────────────────────── render_source.v1 paths (v0.22) ─────────────────────────

fn dispatch_validate_source(source: std::path::PathBuf) -> ExitCode {
    match nf_recorder::validate_render_source_file(&source) {
        Ok(summary) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "ok": true,
                    "source": source.display().to_string(),
                    "summary": summary
                }))
                .unwrap_or_else(|_| "{\"ok\":true}".to_string())
            );
            ExitCode::from(0)
        }
        Err(message) => {
            emit(Event::Error {
                code: "SOURCE_INVALID".into(),
                message,
            });
            ExitCode::from(2)
        }
    }
}

struct SourceExportArgs {
    source: std::path::PathBuf,
    output: std::path::PathBuf,
    profile: String,
    diagnostics: Option<std::path::PathBuf>,
    events: bool,
    resolution: Option<String>,
    fps: Option<u32>,
    parallel: Option<usize>,
}

async fn dispatch_source_export(args: SourceExportArgs) -> ExitCode {
    let preset = match source_export_profile(
        &args.profile,
        args.resolution.as_deref(),
        args.fps,
        args.parallel,
    ) {
        Ok(preset) => preset,
        Err(message) => {
            emit(Event::Error {
                code: "CLI_INVALID".into(),
                message,
            });
            return ExitCode::from(1);
        }
    };
    let summary = match nf_recorder::validate_render_source_file(&args.source) {
        Ok(summary) => summary,
        Err(message) => {
            emit(Event::Error {
                code: "SOURCE_INVALID".into(),
                message,
            });
            return ExitCode::from(2);
        }
    };
    if let Some(parent) = args
        .output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        if let Err(err) = std::fs::create_dir_all(parent) {
            emit(Event::Error {
                code: "IO_FAILED".into(),
                message: format!("create output dir: {err}"),
            });
            return ExitCode::from(1);
        }
    }
    if !args.events {
        nf_recorder::events::set_quiet(true);
    }
    let capture = args
        .diagnostics
        .as_ref()
        .map(|_| nf_recorder::events::start_capture());
    let result = nf_recorder::run_export_from_source(
        &args.source,
        &args.output,
        ExportOpts {
            duration_s: summary.duration_ms as f64 / 1000.0,
            fps: preset.fps,
            bitrate_bps: preset.resolution.bitrate_bps(),
            resolution_override: Some(preset.resolution),
            parallel: Some(preset.parallel),
            ..Default::default()
        },
    )
    .await;
    let captured_events = capture
        .map(nf_recorder::events::EventCaptureGuard::finish)
        .unwrap_or_default();
    if !args.events {
        nf_recorder::events::set_quiet(false);
    }
    let stats = match result {
        Ok(stats) => stats,
        Err(err) => {
            emit(Event::Error {
                code: err.code_str().to_string(),
                message: err.to_string(),
            });
            return ExitCode::from(exit_code_u8(&err));
        }
    };
    if let Some(path) = args.diagnostics {
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            if let Err(err) = std::fs::create_dir_all(parent) {
                emit(Event::Error {
                    code: "IO_FAILED".into(),
                    message: format!("create diagnostics dir: {err}"),
                });
                return ExitCode::from(1);
            }
        }
        let report = serde_json::json!({
            "schema_version": "nf.recorder_diagnostics.v1",
            "source": args.source.display().to_string(),
            "out": args.output.display().to_string(),
            "profile": preset.name,
            "resolution": preset.resolution.as_str(),
            "fps": preset.fps,
            "parallel": preset.parallel,
            "stats": {
                "bytes": stats.size_bytes,
                "frames": stats.frames,
                "duration_ms": stats.duration_ms,
                "moov_front": stats.moov_front
            },
            "source_summary": summary,
            "events": captured_events
        });
        if let Err(err) = std::fs::write(
            &path,
            serde_json::to_vec_pretty(&report).unwrap_or_else(|_| b"{}".to_vec()),
        ) {
            emit(Event::Error {
                code: "IO_FAILED".into(),
                message: format!("write diagnostics: {err}"),
            });
            return ExitCode::from(1);
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "out": args.output.display().to_string(),
            "source": args.source.display().to_string(),
            "profile": preset.name,
            "resolution": preset.resolution.as_str(),
            "fps": preset.fps,
            "parallel": preset.parallel,
            "bytes": stats.size_bytes,
            "frames": stats.frames,
            "duration_ms": stats.duration_ms
        }))
        .unwrap_or_else(|_| "{\"ok\":true}".to_string())
    );
    ExitCode::from(0)
}

async fn dispatch_snapshot_source(
    source: std::path::PathBuf,
    t_ms: u64,
    output: std::path::PathBuf,
    resolution: Option<String>,
) -> ExitCode {
    let resolution = match resolution.as_deref() {
        Some(raw) => match ExportResolution::parse_str(raw) {
            Some(value) => Some(value),
            None => {
                emit(Event::Error {
                    code: "CLI_INVALID".into(),
                    message: format!("--resolution must be 720p, 1080p or 4k (got '{raw}')"),
                });
                return ExitCode::from(1);
            }
        },
        None => None,
    };
    match nf_recorder::snapshot_from_source(&source, &output, t_ms, resolution).await {
        Ok(()) => {
            emit(Event::SnapshotDone {
                bundle: source.display().to_string(),
                t_ms,
                out: output.display().to_string(),
            });
            ExitCode::from(0)
        }
        Err(e) => {
            let code = e.code_str().to_string();
            let message = e.to_string();
            emit(Event::Error { code, message });
            ExitCode::from(e.exit_code())
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct SourceExportProfile {
    name: &'static str,
    resolution: ExportResolution,
    fps: u32,
    parallel: usize,
}

fn source_export_profile(
    profile: &str,
    resolution: Option<&str>,
    fps: Option<u32>,
    parallel: Option<usize>,
) -> Result<SourceExportProfile, String> {
    let mut preset = match profile.trim().to_ascii_lowercase().as_str() {
        "draft" => SourceExportProfile {
            name: "draft",
            resolution: ExportResolution::P720,
            fps: 30,
            parallel: 1,
        },
        "standard" => SourceExportProfile {
            name: "standard",
            resolution: ExportResolution::P1080,
            fps: 30,
            parallel: 1,
        },
        "final" => SourceExportProfile {
            name: "final",
            resolution: ExportResolution::P1080,
            fps: 60,
            parallel: 1,
        },
        "final-fast" | "fast-final" => SourceExportProfile {
            name: "final-fast",
            resolution: ExportResolution::P1080,
            fps: 60,
            parallel: 2,
        },
        other => {
            return Err(format!(
                "--profile must be draft, standard, final or final-fast (got '{other}')"
            ));
        }
    };
    if let Some(raw) = resolution {
        preset.resolution = ExportResolution::parse_str(raw)
            .ok_or_else(|| format!("--resolution must be 720p, 1080p or 4k (got '{raw}')"))?;
    }
    if let Some(value) = fps {
        if value != 30 && value != 60 {
            return Err(format!("--fps must be 30 or 60 (got {value})"));
        }
        preset.fps = value;
    }
    if let Some(value) = parallel {
        if value == 0 || value > 8 {
            return Err(format!("--parallel must be between 1 and 8 (got {value})"));
        }
        preset.parallel = value;
    }
    Ok(preset)
}

// ───────────────────────── legacy record path ─────────────────────────

async fn dispatch_record(parsed: cli::Cli) -> ExitCode {
    let is_subprocess = parsed.frame_range.is_some();
    let cfg = match cli::to_config(&parsed) {
        Ok(c) => c,
        Err(msg) => {
            emit(Event::Error {
                code: "CLI_INVALID".to_string(),
                message: msg.clone(),
            });
            eprintln!("nf-recorder: {msg}");
            return ExitCode::from(1);
        }
    };
    let parallel =
        match orchestrator::resolve_requested_parallel(parsed.parallel, cfg.width, cfg.height) {
            Ok(n) => n,
            Err(e) => {
                let code = e.code_str().to_string();
                let message = e.to_string();
                emit(Event::Error { code, message });
                return ExitCode::from(exit_code_u8(&e));
            }
        };

    // v1.15 · --parallel N 且不是子进程(无 --frame-range) → 走 orchestrator
    //   orchestrator 内部 probe duration · spawn N 子 · ffmpeg concat
    // 子进程(--frame-range set) 走正常 record_loop 子集
    // 单进程(--parallel=1) 走正常 record_loop 全 range
    if parallel > 1 && !is_subprocess {
        match orchestrator::run_parallel(cfg, parallel).await {
            Ok(()) => return ExitCode::from(0),
            Err(e) => {
                let code = e.code_str().to_string();
                let message = e.to_string();
                emit(Event::Error { code, message });
                return ExitCode::from(exit_code_u8(&e));
            }
        }
    }

    match run(cfg).await {
        Ok(_stats) => ExitCode::from(0),
        Err(e) => {
            let code = e.code_str().to_string();
            let message = e.to_string();
            emit(Event::Error { code, message });
            ExitCode::from(exit_code_u8(&e))
        }
    }
}

fn exit_code_u8(e: &RecordError) -> u8 {
    e.exit_code()
}

// ───────────────────────── snapshot path (T-18) ─────────────────────────

async fn dispatch_snapshot(
    bundle: std::path::PathBuf,
    t_ms: u64,
    output: std::path::PathBuf,
    viewport: &str,
) -> ExitCode {
    let (w, h) = match cli::parse_viewport(viewport) {
        Ok(wh) => wh,
        Err(msg) => {
            emit(Event::Error {
                code: "CLI_INVALID".into(),
                message: msg.clone(),
            });
            eprintln!("nf-recorder: {msg}");
            return ExitCode::from(1);
        }
    };

    match snapshot::snapshot(&bundle, t_ms, &output, w, h).await {
        Ok(()) => {
            emit(Event::SnapshotDone {
                bundle: bundle.display().to_string(),
                t_ms,
                out: output.display().to_string(),
            });
            ExitCode::from(0)
        }
        Err(e) => {
            let code = e.code_str().to_string();
            let message = e.to_string();
            emit(Event::Error { code, message });
            ExitCode::from(e.exit_code())
        }
    }
}

// ───────────────────────── verify path (T-17) ─────────────────────────

fn dispatch_verify(
    file: std::path::PathBuf,
    expect_fps: u32,
    expect_bitrate: Option<u32>,
) -> ExitCode {
    match verify_mp4::verify(&file, expect_fps, expect_bitrate) {
        Ok((verdict, asserts)) => {
            let all_pass = asserts.iter().all(|a| a.pass);
            let status = if all_pass { "PASS" } else { "FAIL" };

            // Serialize asserts via serde_json so downstream can filter.
            let asserts_json: Vec<serde_json::Value> = asserts
                .iter()
                .map(|a| serde_json::to_value(a).unwrap_or(serde_json::Value::Null))
                .collect();

            emit(Event::VerifyResult {
                file: verdict.file.clone(),
                status: status.into(),
                moov_front: verdict.moov_front,
                codec: verdict.codec.clone(),
                frame_rate: verdict.frame_rate,
                bit_rate: verdict.bit_rate,
                color_primaries: verdict.color_primaries.clone(),
                transfer: verdict.transfer.clone(),
                has_b_frames: verdict.has_b_frames,
                duration_ms: verdict.duration_ms,
                asserts: asserts_json,
            });

            if all_pass {
                ExitCode::from(0)
            } else {
                ExitCode::from(4)
            }
        }
        Err(e) => {
            emit(Event::Error {
                code: "VERIFY_FAILED".into(),
                message: format!("{e}"),
            });
            ExitCode::from(2)
        }
    }
}
