//! `record_loop` · v1.14 T-09 main driver loop for `nf-recorder`.
//!
//! Wires together:
//! - T-05 `MacHeadlessShell` (DesktopShell impl · WKWebView + CARenderer)
//! - T-06 CARenderer-backed `snapshot() → IOSurfaceHandle`
//! - T-07 `PipelineH264_1080p` (VT H.264 encoder)
//! - T-08 `Mp4Writer` (AVAssetWriter · moov-front)
//!
//! Contract source: `spec/versions/v1.14/spec/interfaces-delta.json`
//! → `additions.modules[nf-recorder].contracts`.
//!
//! ## Frame-driven contract (FM-ASYNC)
//! For each seq = 0..N: t_ms = seq * (1000/fps).
//! 1. `shell.call_async("return await window.__nf.seek(t_ms)")` must await
//!    `{t, frameReady:true, seq}` before the runtime is considered ready.
//! 2. `shell.snapshot()` pulls an `IOSurfaceHandle` from CARenderer (zero-copy).
//! 3. `pipeline.push_frame(surface, t_ms)` hands it to VT + AVAssetWriter.
//!
//! Any seek that fails or times out (> 5 s per frame) is fatal and maps to
//! `RecordError::FrameReadyTimeout` / exit code 2.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use nf_shell_mac::{DesktopShell, MacHeadlessShell, ShellConfig, ShellError};

use crate::events::{emit, Event};
use crate::frame_pool::FramePool;
use crate::pipeline::h264::PipelineH264_1080p;
use crate::pipeline::{ColorSpec, OutputStats, PipelineError, RecordOpts, RecordPipeline};

/// Per-frame seek await timeout · contract hard cap.
const FRAME_SEEK_TIMEOUT: Duration = Duration::from_secs(5);

/// v1.14 keeps `worker_count = 1` · pool capacity is nominal.
const FRAME_POOL_CAPACITY: usize = 3;

/// Encode progress reporting cadence (every N frames).
const PROGRESS_EVERY: u64 = 30;

/// Validated recorder job parameters · product of `cli::to_config`.
///
/// Fields mirror `interfaces-delta.json` flags one-for-one.
#[derive(Debug, Clone)]
pub struct RecordConfig {
    /// Absolute or relative path to `bundle.html` · must exist on disk.
    pub bundle: PathBuf,
    /// Absolute or relative path to the output MP4.
    pub output: PathBuf,
    /// Viewport width in pixels (1920 for `--res 1080p`).
    pub width: u32,
    /// Viewport height in pixels (1080 for `--res 1080p`).
    pub height: u32,
    /// Frame rate · v1.14 ∈ {30, 60}.
    pub fps: u32,
    /// VT target bitrate in bits per second.
    pub bitrate_bps: u32,
    /// Hard cap on recording duration in seconds · timeout → exit 2.
    pub max_duration_s: u32,
    /// v1.15 · 子进程录制的 frame 子区间 `[start, end)` · None = 录整个 duration。
    /// orchestrator 父 probe duration 算 total_frames · 平分 N 段 · spawn 子进程各拿 (start, end)。
    pub frame_range: Option<(u64, u64)>,
}

/// Record loop fatal errors · mapped to interfaces-delta error codes.
///
/// Variant naming aligns with the hard-constraint list in
/// `spec/versions/v1.14/plan/prompts/task-10-cli-events.md`.
#[derive(Debug, thiserror::Error)]
pub enum RecordError {
    /// CARenderer / sampler boot failure · exit 2.
    #[error("CARenderer init failed: {0}")]
    CARendererInitFailed(String),
    /// VT encoder init or encode failure · exit 2.
    #[error("VideoToolbox encoder failed: {0}")]
    VtEncoderFailed(String),
    /// AVAssetWriter session failed or produced no output · exit 2.
    #[error("AVAssetWriter session failed: {0}")]
    WriterSessionFailed(String),
    /// `window.__nf.seek` did not resolve inside the contract deadline · exit 2.
    #[error("frameReady await timeout: {0}")]
    FrameReadyTimeout(String),
    /// Runtime handshake returned an invalid payload (missing / mismatched fields) · exit 2.
    #[error("frameReady contract violation: {0}")]
    FrameReadyContract(String),
    /// `callAsyncJavaScript` itself returned an error · exit 2.
    #[error("shell error: {0}")]
    ShellError(String),
    /// Pipeline push/finish bubbled an error · exit 2.
    #[error("pipeline error: {0}")]
    PipelineError(String),
    /// Bundle load failed or `window.__nf` missing · exit 1.
    #[error("bundle load failed: {0}")]
    BundleLoadFailed(String),
    /// No frames produced before loop terminated · exit 2.
    #[error("no frames produced")]
    NoFrames,
    /// Host platform not supported (not macOS / too old) · exit 3.
    #[error("unsupported platform: {0}")]
    UnsupportedPlatform(String),
}

impl RecordError {
    /// Enum-string code used in the `error` stdout event.
    #[must_use]
    pub fn code_str(&self) -> &'static str {
        match self {
            Self::CARendererInitFailed(_) => "CARENDERER_INIT_FAILED",
            Self::VtEncoderFailed(_) => "VT_ENCODER_FAILED",
            Self::WriterSessionFailed(_) => "WRITER_SESSION_FAILED",
            Self::FrameReadyTimeout(_) => "FRAME_READY_TIMEOUT",
            Self::FrameReadyContract(_) => "FRAME_READY_CONTRACT",
            Self::ShellError(_) => "SHELL_ERROR",
            Self::PipelineError(_) => "PIPELINE_ERROR",
            Self::BundleLoadFailed(_) => "BUNDLE_LOAD_FAILED",
            Self::NoFrames => "NO_FRAMES",
            Self::UnsupportedPlatform(_) => "UNSUPPORTED_PLATFORM",
        }
    }

    /// Process exit code · per `interfaces-delta.json.exit_codes`:
    /// - 1 = user error (bundle not loadable)
    /// - 2 = internal (CARenderer / VT / Writer / timeout / contract / no frames)
    /// - 3 = env (unsupported platform)
    #[must_use]
    pub fn exit_code(&self) -> u8 {
        match self {
            Self::BundleLoadFailed(_) => 1,
            Self::UnsupportedPlatform(_) => 3,
            _ => 2,
        }
    }
}

impl From<ShellError> for RecordError {
    fn from(e: ShellError) -> Self {
        match e {
            ShellError::UnsupportedPlatform => Self::UnsupportedPlatform(
                "shell reports unsupported platform".into(),
            ),
            ShellError::SnapshotFailed(m) => Self::CARendererInitFailed(m),
            ShellError::JsCallFailed(m) => Self::ShellError(m),
            ShellError::BundleLoadFailed(m) => Self::BundleLoadFailed(m),
        }
    }
}

impl From<PipelineError> for RecordError {
    fn from(e: PipelineError) -> Self {
        match e {
            PipelineError::EncoderInitFailed => {
                Self::VtEncoderFailed("encoder init failed".into())
            }
            PipelineError::WriterSessionFailed => {
                Self::WriterSessionFailed("writer session failed".into())
            }
            PipelineError::FrameOutOfOrder => {
                Self::PipelineError("frame out of order".into())
            }
            PipelineError::Timeout => {
                Self::FrameReadyTimeout("pipeline internal timeout".into())
            }
            PipelineError::IoError(m) => Self::PipelineError(m),
        }
    }
}

/// Run the full record loop · returns `OutputStats` on success.
///
/// The underlying shell pumps the macOS main run loop inside `call_async`
/// (see `MacHeadlessShell`). Callers must therefore use a
/// `tokio::runtime::Builder::new_current_thread()` runtime so all AppKit /
/// WebKit interaction stays on the main thread.
pub async fn run(cfg: RecordConfig) -> Result<OutputStats, RecordError> {
    // 1. Boot the headless shell.
    let shell = MacHeadlessShell::new_headless(ShellConfig {
        viewport: (cfg.width, cfg.height),
        device_pixel_ratio: 1.0,
        bundle_url: cfg.bundle.clone(),
    })?;

    // Register a best-effort bridge listener. `callAsync` return value is the
    // primary frameReady signal · this is the double-insurance channel from
    // interfaces-delta.json · we only log unexpected topics here.
    shell.on_bridge_message(|event, _payload| {
        if event != "frameReady" {
            // stderr · stdout is reserved for JSON-Line events.
            eprintln!("nf-recorder: bridge message (non-frameReady): {event}");
        }
    });

    // 2. Load bundle + wait for navigation finished.
    shell
        .load_bundle(&cfg.bundle)
        .map_err(|e| RecordError::BundleLoadFailed(format!("{e}")))?;

    // 2.1 Probe runtime duration · fall back to `max_duration_s` on miss.
    let duration_script =
        "return (window.__nf && typeof window.__nf.getDuration === 'function') \
         ? window.__nf.getDuration() : null;";
    let probe = shell.call_async(duration_script).await?;
    let probed_ms = js_number_as_u64(Some(&probe));
    let max_cap_ms = u64::from(cfg.max_duration_s).saturating_mul(1000);
    let duration_ms: u64 = match probed_ms {
        Some(0) | None => max_cap_ms,
        Some(d) => d.min(max_cap_ms),
    };
    if duration_ms == 0 {
        return Err(RecordError::BundleLoadFailed(
            "duration resolves to 0 (check --max-duration and bundle getDuration)".into(),
        ));
    }

    // 2.2 Flip runtime into record mode (RAF off · audio muted · per ADR-041).
    // v1.14.4: 同时强制 viewport meta + body size. WKWebView off-screen 默认 desktop
    // viewport 980px · CSS `100vh` 相对 980×?? 计算 · body flex layout 塌陷 ·
    // takeSnapshot 只截 stage 漏 controls + timeline UI (playhead/clip). 强制 1920×1080
    // 让 flex 计算对 · DOM 完整 layout · snapshot 拿全画面.
    let mode_switch = r#"
        var vp = document.querySelector('meta[name="viewport"]');
        if (!vp) {
            vp = document.createElement('meta');
            vp.setAttribute('name', 'viewport');
            document.head.appendChild(vp);
        }
        vp.setAttribute('content', 'width=1920,height=1080,initial-scale=1,user-scalable=no');
        var s = document.getElementById('__nf_record_force_size');
        if (!s) {
            s = document.createElement('style');
            s.id = '__nf_record_force_size';
            document.head.appendChild(s);
        }
        s.textContent = 'html,body{width:1920px!important;height:1080px!important;min-height:1080px!important;margin:0!important;padding:0!important;background:#ff00ff!important;}';
        document.body.dataset.mode = 'record';
        return { bodyW: document.body.clientWidth, bodyH: document.body.clientHeight, vpContent: vp.content };
    "#;
    let _ = shell.call_async(mode_switch).await?;

    // 3. Construct encoder/writer pipeline.
    let mut pipeline = PipelineH264_1080p::new(RecordOpts {
        width: cfg.width,
        height: cfg.height,
        fps: cfg.fps,
        bitrate_bps: cfg.bitrate_bps,
        output: cfg.output.clone(),
        color: ColorSpec::BT709_SDR_8bit,
    })?;

    let mut pool = FramePool::new(FRAME_POOL_CAPACITY);

    // 4. Announce job.
    emit(Event::RecordStart {
        bundle: cfg.bundle.display().to_string(),
        out: cfg.output.display().to_string(),
        fps: cfg.fps,
        bitrate_bps: cfg.bitrate_bps,
        viewport: [cfg.width, cfg.height],
    });

    // 5. Drive the loop · seq = 0..N · t_ms = seq * (1000/fps).
    let frame_dur_ms = 1000.0_f64 / f64::from(cfg.fps);
    let total_frames_f = (duration_ms as f64) / frame_dur_ms;
    let total_frames: u64 = total_frames_f.round() as u64;
    if total_frames == 0 {
        return Err(RecordError::NoFrames);
    }

    // v1.15 · frame-range subprocess mode · record only [start, end) · seq 仍按 global t 走
    // 让 IDR 按 MaxKeyFrameInterval 在 original timeline 对齐（pts 不偏）· VT 会在 pipeline 首帧
    // 强制 IDR (见 h264.rs push_frame frames_pushed==0) · 所以每 segment 首帧必 keyframe。
    let (range_start, range_end) = match cfg.frame_range {
        Some((s, e)) => (s.min(total_frames), e.min(total_frames)),
        None => (0, total_frames),
    };
    if range_end <= range_start {
        return Err(RecordError::NoFrames);
    }
    let mut frames_encoded: u64 = 0;

    for seq in range_start..range_end {
        // FM-T-QUANTIZATION: precise f64 · 禁 round 到整 ms。
        // 旧: `((seq as f64) * frame_dur_ms).round() as u64` · 每帧 17/16/17/17/16 抖。
        // 新: 精确 f64 · 渲染时间基均匀 · VP-3 帧间 t 序列等距断言守护 (spread < 1e-6)。
        let t_exact_ms: f64 = seq as f64 * 1000.0 / f64::from(cfg.fps);
        // 向后兼容的整数 t_ms · pipeline.push_frame / event.t_ms 仍用。
        let t_ms: u64 = t_exact_ms.round() as u64;
        let frame_start = Instant::now();

        // 5.1 Drive runtime seek · await frameReady · hard 5 s timeout.
        // 传 f64 精确值给 bundle · runtime.js seek() 本是 JS Number (f64) 吃 f64 不 reject。
        let seek_script = format!("return await window.__nf.seek({t_exact_ms:.6});");
        let seek_fut = shell.call_async(&seek_script);
        let result = match tokio::time::timeout(FRAME_SEEK_TIMEOUT, seek_fut).await {
            Ok(r) => r?,
            Err(_elapsed) => {
                return Err(RecordError::FrameReadyTimeout(format!(
                    "{}ms at t_exact_ms={t_exact_ms:.6}",
                    FRAME_SEEK_TIMEOUT.as_millis()
                )));
            }
        };

        // Validate frameReady handshake shape (f64 容差判 · 不严格整数相等).
        verify_frame_ready(&result, t_exact_ms)?;

        // FM-COMPOSITOR-COMMIT-ASYNC (BUG-20260419-v1.14-compositor-commit):
        // v1.14.3 fix · 真正的 commit barrier 在 `shell.snapshot()` 内部:
        //   displayIfNeeded + CATransaction::flush + pump_main_run_loop(16ms)
        // (见 nf-shell-mac/src/headless/mac.rs `fn snapshot`)
        //
        // record_loop 只需正常调 snapshot · 每帧多花 ~16ms main run loop pump
        // (540 帧 9s 视频录制总时长 ~12-15s · 可接受)。
        //
        // 历史尝试 (方案 A 固定 2 次 setTimeout(0) pump / 方案 B 中心像素 diff
        // 判据) 均不足:JS setTimeout pump 不能驱动 CALayer render pass 同步;
        // 中心像素 driver-push 判据假阳性(中心像素偶然稳定不代表全画面没变)。
        // 真修复 = AppKit displayIfNeeded 强制 CALayer 子树同步重绘 + CATransaction
        // flush 把 pending commit 立刻刷出到 render server。
        //
        // 5.2 Sample CARenderer → IOSurface (zero-copy). Snapshot failures
        // are logged + skipped so one bad frame does not kill the whole run.
        let surface = match shell.snapshot() {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "nf-recorder: snapshot skipped at t_exact_ms={t_exact_ms:.6} seq={seq} · {e}"
                );
                continue;
            }
        };

        // 5.3 Push into pipeline (encode + mux · drains VT output queue).
        // 注: pipeline.push_frame t_ms 仅供编码侧 pts 计算参考 · VT 内部按 fps 同步 pts ·
        // 不依赖此 t_ms 的精度（ffprobe 验 pts 严格 16.67ms 等距）。
        pipeline.push_frame(surface, t_ms)?;
        pool.note_submitted();
        frames_encoded = frames_encoded.saturating_add(1);

        // 5.4 Per-frame event (t_ms 向后兼容 · t_exact_ms 给 verify 序列断言用).
        let encode_ms = frame_start.elapsed().as_secs_f64() * 1000.0;
        emit(Event::RecordFrame {
            t_ms,
            t_exact_ms,
            seq,
            encode_ms,
        });

        // 5.5 Progress event every N frames (skip seq 0 · we just announced).
        if seq > 0 && seq.is_multiple_of(PROGRESS_EVERY) {
            let percent = (seq as f64) / (total_frames as f64) * 100.0;
            emit(Event::RecordEncodeProgress {
                frames_encoded: seq,
                total_frames,
                percent,
            });
        }
    }

    if frames_encoded == 0 {
        return Err(RecordError::NoFrames);
    }

    // 6. Flush encoder + close writer.
    let stats = pipeline.finish()?;

    // 7. Final event.
    emit(Event::RecordDone {
        out: stats.path.clone(),
        duration_ms: stats.duration_ms,
        size_bytes: stats.size_bytes,
        moov_front: stats.moov_front,
    });

    Ok(stats)
}

/// Validate `{t, frameReady, seq}` returned by `window.__nf.seek`.
///
/// Contract (interfaces-delta.json `nf-runtime::record-mode`):
/// - `frameReady` must be boolean `true`.
/// - `t` must equal the `expected_t` (f64) we sent (within 0.01 ms tolerance ·
///   JSON round-trip is exact for IEEE-754 doubles in the range we care about,
///   but runtime.js may return slightly different float after its own math).
/// - `seq` must be present as a number (monotonic checks live downstream).
///
/// Tolerance rationale: with FM-T-QUANTIZATION fix (f64 pass-through · no round),
/// sent t values are `seq * 1000 / fps` which are generally not exactly representable
/// (e.g. 16.666...). JSON emit + JS parse preserves 52-bit mantissa · any tolerance
/// < 1e-10 is unnecessarily strict; 0.01ms is the explicit "integer-ms-era" compat.
fn verify_frame_ready(value: &serde_json::Value, expected_t: f64) -> Result<(), RecordError> {
    let obj = value.as_object().ok_or_else(|| {
        RecordError::FrameReadyContract(format!(
            "expected object at expected_t={expected_t:.6} · got: {value}"
        ))
    })?;

    let ready = obj
        .get("frameReady")
        .and_then(serde_json::Value::as_bool)
        .ok_or_else(|| {
            RecordError::FrameReadyContract(format!(
                "missing frameReady boolean at expected_t={expected_t:.6}"
            ))
        })?;
    if !ready {
        return Err(RecordError::FrameReadyContract(format!(
            "frameReady=false at expected_t={expected_t:.6}"
        )));
    }

    let received_t = obj
        .get("t")
        .and_then(serde_json::Value::as_f64)
        .ok_or_else(|| {
            RecordError::FrameReadyContract(format!(
                "missing t (f64) at expected_t={expected_t:.6}"
            ))
        })?;
    if (received_t - expected_t).abs() > 0.01 {
        return Err(RecordError::FrameReadyContract(format!(
            "t mismatch: sent {expected_t:.6} got {received_t:.6}"
        )));
    }

    // seq must be present + numeric · specific value is not asserted here
    // (monotonic / strictly-increasing checks are downstream verify tasks).
    let _runtime_seq = js_number_as_u64(obj.get("seq")).ok_or_else(|| {
        RecordError::FrameReadyContract(format!(
            "missing seq at expected_t={expected_t:.6}"
        ))
    })?;

    Ok(())
}

/// JS returns numbers as doubles · NSNumber round-trip lands them as `f64` in
/// `serde_json::Value`. `Value::as_u64()` only accepts native-integer variants ·
/// so for interop we also accept integer-valued `f64` / `i64`. Fractional /
/// negative / NaN all reject.
pub fn js_number_as_u64(v: Option<&serde_json::Value>) -> Option<u64> {
    let v = v?;
    if let Some(u) = v.as_u64() {
        return Some(u);
    }
    if let Some(i) = v.as_i64() {
        if i >= 0 {
            return Some(i as u64);
        }
    }
    if let Some(f) = v.as_f64() {
        if f.is_finite() && f >= 0.0 && f.fract() == 0.0 && f <= u64::MAX as f64 {
            return Some(f as u64);
        }
    }
    None
}

