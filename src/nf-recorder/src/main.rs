//! `nf-recorder` binary entry point · v1.14 T-09 / T-17 / T-18.
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

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let parsed = cli::parse();

    match parsed.command {
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

// ───────────────────────── legacy record path ─────────────────────────

async fn dispatch_record(parsed: cli::Cli) -> ExitCode {
    let parallel = parsed.parallel;
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
