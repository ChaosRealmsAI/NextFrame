//! Stdout JSON-Line event emitter · v1.14 T-09 minimal implementation.
//!
//! Contract source: `spec/versions/v1.14/spec/interfaces-delta.json`
//! → `additions.modules[nf-recorder].subprocess_protocol.stdout_events`.
//!
//! Emits one JSON object per line to stdout, flushed on every call so
//! downstream (nf-cli · verify script · test harness) can read events
//! incrementally without waiting for buffer flushes.
//!
//! **Why sync stdout (not tokio::io)**: recorder pipeline is single-threaded
//! (worker_count = 1 in v1.14) · sync stdout is simpler · avoids tokio
//! runtime contention with the NSRunLoop pump inside `call_async`.

use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;

/// v1.14 recorder stdout events · tagged by `event` field.
#[derive(Debug, Serialize)]
#[serde(tag = "event")]
pub enum Event {
    /// Emitted once before the first frame · announces job parameters.
    #[serde(rename = "record.start")]
    RecordStart {
        bundle: String,
        out: String,
        fps: u32,
        bitrate_bps: u32,
        viewport: [u32; 2],
    },
    /// Emitted per frame after successful encode.
    ///
    /// `t_ms` is the legacy integer-ms value (向后兼容 · v1.14.0/1 字段 · 下游脚本仍用).
    /// `t_exact_ms` is the precise f64 time the recorder sent to `window.__nf.seek`
    /// (v1.14.2 FM-T-QUANTIZATION 新增 · 精确 `seq * 1000 / fps` · VP-3 用它做
    /// "帧间 t 序列严格等距" 断言 · spread < 1e-6).
    #[serde(rename = "record.frame")]
    RecordFrame {
        t_ms: u64,
        t_exact_ms: f64,
        seq: u64,
        encode_ms: f64,
    },
    /// Emitted every N frames (recorder chooses cadence, v1.14 = 30).
    #[serde(rename = "record.encode_progress")]
    RecordEncodeProgress {
        frames_encoded: u64,
        total_frames: u64,
        percent: f64,
    },
    /// Emitted once after MP4 writer closes · final stats.
    #[serde(rename = "record.done")]
    RecordDone {
        out: PathBuf,
        duration_ms: u64,
        size_bytes: u64,
        moov_front: bool,
    },
    /// Emitted once after `nf-recorder snapshot` writes the PNG · T-18.
    ///
    /// Paths are rendered strings (not `PathBuf`) so stdout stays ASCII on
    /// non-UTF-8 platforms; `t_ms` matches the `--t-ms` input.
    #[serde(rename = "snapshot.done")]
    SnapshotDone {
        bundle: String,
        t_ms: u64,
        out: String,
    },
    /// T-17 · MP4 self-verification result · emitted once after `verify` subcommand.
    ///
    /// `asserts` is a list of `{name, expected, actual, pass}` objects. `status`
    /// mirrors all-pass for quick filtering by downstream (no need to re-eval).
    #[serde(rename = "verify.result")]
    VerifyResult {
        file: String,
        status: String,
        moov_front: bool,
        codec: String,
        frame_rate: f64,
        bit_rate: u64,
        color_primaries: String,
        transfer: String,
        has_b_frames: bool,
        duration_ms: u64,
        asserts: Vec<serde_json::Value>,
    },
    /// v1.15 · 并行录制开始 · orchestrator 父进程 probe duration 后 emit。
    #[serde(rename = "record.parallel.start")]
    RecordParallelStart {
        parallel: usize,
        total_frames: u64,
        duration_ms: u64,
    },
    /// v1.15 · segment 子进程启动 · 父进程 spawn 后 emit。
    #[serde(rename = "record.segment.start")]
    RecordSegmentStart {
        idx: usize,
        start: u64,
        end: u64,
        output: String,
    },
    /// v1.15 · segment 子进程完成 · 父进程 wait 成功后 emit。
    #[serde(rename = "record.segment.done")]
    RecordSegmentDone {
        idx: usize,
        start: u64,
        end: u64,
        output: String,
    },
    /// v1.15 · ffmpeg concat 开始。
    #[serde(rename = "record.concat.start")]
    RecordConcatStart { segments: Vec<String> },
    /// v1.15 · 并行录制全部完成 · wall time 统计。
    #[serde(rename = "record.parallel.done")]
    RecordParallelDone {
        parallel: usize,
        wall_time_ms: f64,
    },
    /// Fatal error · recorder exits non-zero after emitting.
    #[serde(rename = "error")]
    Error { code: String, message: String },
}

/// Serialize `e` as a single JSON line to stdout and flush.
///
/// Never panics · serialization or io errors degrade to a stderr notice.
pub fn emit(e: Event) {
    match serde_json::to_string(&e) {
        Ok(line) => {
            let stdout = std::io::stdout();
            let mut lock = stdout.lock();
            let _ = writeln!(lock, "{line}");
            let _ = lock.flush();
        }
        Err(err) => {
            eprintln!("nf-recorder: event serialize error: {err}");
        }
    }
}
