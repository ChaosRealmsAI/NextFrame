//! `record_loop` · frame-driven main driver loop for `nf-recorder`.
//!
//! Historical: v1.14 T-09 main driver loop.
//! Wires together:
//! - T-05 `MacHeadlessShell` (DesktopShell impl · WKWebView + CARenderer)
//! - T-06 CARenderer-backed `snapshot() → IOSurfaceHandle`
//! - T-07 `PipelineH264_1080p` (VT H.264 encoder)
//! - T-08 `Mp4Writer` (AVAssetWriter · moov-front)
//!
//! Historical: contract source `spec/versions/v1.14/spec/interfaces-delta.json`
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
use crate::pipeline::hevc::PipelineHevcMain;
use crate::pipeline::{
    ColorSpec, OutputStats, PipelineError, RecordOpts, RecordPipeline, VideoCodec,
};

/// Per-frame seek await timeout · contract hard cap.
const FRAME_SEEK_TIMEOUT: Duration = Duration::from_secs(5);

/// Pool capacity is nominal while the recorder runs as a single frame driver.
/// Historical: v1.14 kept `worker_count = 1`.
const FRAME_POOL_CAPACITY: usize = 3;

/// Encode progress reporting cadence (every N frames).
const PROGRESS_EVERY: u64 = 30;
const EXPORT_SEEK_SETTLE: Duration = Duration::from_millis(12);

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
    /// Frame rate · ∈ {30, 60}.
    /// Historical: v1.14 accepted 30 / 60 fps.
    pub fps: u32,
    /// VT target bitrate in bits per second.
    pub bitrate_bps: u32,
    /// Encoder codec preset.
    /// Historical: v1.55 codec preset.
    pub codec: VideoCodec,
    /// Hard cap on recording duration in seconds · timeout → exit 2.
    pub max_duration_s: u32,
    /// 子进程录制的 frame 子区间 `[start, end)` · None = 录整个 duration。
    /// orchestrator 父 probe duration 算 total_frames · 平分 N 段 · spawn 子进程各拿 (start, end)。
    /// Historical: v1.15 frame-range worker slicing.
    pub frame_range: Option<(u64, u64)>,
}

/// Record loop fatal errors · mapped to interfaces-delta error codes.
///
/// Variant naming aligns with the hard-constraint list in
/// Historical: `spec/versions/v1.14/plan/prompts/task-10-cli-events.md`.
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
            ShellError::UnsupportedPlatform => {
                Self::UnsupportedPlatform("shell reports unsupported platform".into())
            }
            ShellError::SnapshotFailed(m) => Self::CARendererInitFailed(m),
            ShellError::JsCallFailed(m) => Self::ShellError(m),
            ShellError::BundleLoadFailed(m) => Self::BundleLoadFailed(m),
        }
    }
}

impl From<PipelineError> for RecordError {
    fn from(e: PipelineError) -> Self {
        match e {
            PipelineError::EncoderInitFailed => Self::VtEncoderFailed("encoder init failed".into()),
            PipelineError::WriterSessionFailed => {
                Self::WriterSessionFailed("writer session failed".into())
            }
            PipelineError::FrameOutOfOrder => Self::PipelineError("frame out of order".into()),
            PipelineError::Timeout => Self::FrameReadyTimeout("pipeline internal timeout".into()),
            PipelineError::IoError(m) => Self::PipelineError(m),
        }
    }
}

enum ActivePipeline {
    H264(PipelineH264_1080p),
    Hevc(PipelineHevcMain),
}

impl ActivePipeline {
    fn push_frame(
        &mut self,
        surface: nf_shell_mac::IOSurfaceHandle,
        pts_ms: u64,
    ) -> Result<(), PipelineError> {
        match self {
            Self::H264(p) => p.push_frame(surface, pts_ms),
            Self::Hevc(p) => p.push_frame(surface, pts_ms),
        }
    }

    fn finish(self) -> Result<OutputStats, PipelineError> {
        match self {
            Self::H264(p) => p.finish(),
            Self::Hevc(p) => p.finish(),
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
    let duration_script = "return (window.__nf && typeof window.__nf.getDuration === 'function') \
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
    // Historical: v1.14.4 同时强制 viewport meta + body size. WKWebView off-screen 默认 desktop
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
        vp.setAttribute('content', 'width=__NF_WIDTH__,height=__NF_HEIGHT__,initial-scale=1,user-scalable=no');
        var s = document.getElementById('__nf_record_force_size');
        if (!s) {
            s = document.createElement('style');
            s.id = '__nf_record_force_size';
            document.head.appendChild(s);
        }
        s.textContent = 'html,body{width:__NF_WIDTH__px!important;height:__NF_HEIGHT__px!important;min-height:__NF_HEIGHT__px!important;margin:0!important;padding:0!important;background:#ff00ff!important;}';
        document.body.dataset.mode = 'record';
        return true;
    "#
    .replace("__NF_WIDTH__", &cfg.width.to_string())
    .replace("__NF_HEIGHT__", &cfg.height.to_string());
    let _ = shell.call_async(&mode_switch).await?;

    let has_export_seek_bridge = shell
        .eval_sync("return !!(window.__nf_seek_export && window.__nf_read_seek_export);")
        .await?
        .as_bool()
        == Some(true);
    let has_video_state_probe = shell
        .eval_sync("return !!(window.__nf && typeof window.__nf.getVideoState === 'function');")
        .await?
        .as_bool()
        == Some(true);
    let has_active_video_probe = if has_video_state_probe {
        let initial_probe = shell
            .eval_sync(
                "return JSON.stringify((window.__nf && typeof window.__nf.getVideoState === 'function') \
                 ? window.__nf.getVideoState() : { count: 0, clips: [] });",
            )
            .await?;
        let initial_state = parse_json_result(initial_probe, "video-state bootstrap")?;
        js_number_as_u64(initial_state.get("count")).unwrap_or(0) > 0
    } else {
        false
    };

    // 3. Construct encoder/writer pipeline.
    let mut pipeline = match cfg.codec {
        VideoCodec::H264 => ActivePipeline::H264(PipelineH264_1080p::new(RecordOpts {
            width: cfg.width,
            height: cfg.height,
            fps: cfg.fps,
            bitrate_bps: cfg.bitrate_bps,
            codec: cfg.codec,
            output: cfg.output.clone(),
            color: ColorSpec::BT709_SDR_8bit,
        })?),
        VideoCodec::HevcMain8 => ActivePipeline::Hevc(PipelineHevcMain::new(RecordOpts {
            width: cfg.width,
            height: cfg.height,
            fps: cfg.fps,
            bitrate_bps: cfg.bitrate_bps,
            codec: cfg.codec,
            output: cfg.output.clone(),
            color: ColorSpec::BT709_SDR_8bit,
        })?),
    };

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
    let mut last_export_seq: u64 = 0;

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
        let result = if has_export_seek_bridge {
            let seek_script = format!("window.__nf_seek_export({t_exact_ms:.6});");
            shell.eval_fire_and_forget(&seek_script)?;

            if has_active_video_probe {
                let value = wait_for_export_seek_ready(&shell, t_exact_ms, last_export_seq).await?;
                last_export_seq = js_number_as_u64(value.get("seq")).unwrap_or(last_export_seq);
                wait_for_video_state_ready(&shell, t_exact_ms).await?;
                value
            } else {
                shell.pump_for(EXPORT_SEEK_SETTLE);
                last_export_seq = last_export_seq.saturating_add(1);
                serde_json::json!({
                    "t": t_exact_ms,
                    "frameReady": true,
                    "seq": last_export_seq
                })
            }
        } else {
            let seek_script =
                format!("return JSON.stringify(await window.__nf.seek({t_exact_ms:.6}));");
            let seek_fut = shell.call_async(&seek_script);
            let raw_result = match tokio::time::timeout(FRAME_SEEK_TIMEOUT, seek_fut).await {
                Ok(r) => r?,
                Err(_elapsed) => {
                    return Err(RecordError::FrameReadyTimeout(format!(
                        "{}ms at t_exact_ms={t_exact_ms:.6}",
                        FRAME_SEEK_TIMEOUT.as_millis()
                    )));
                }
            };
            parse_json_result(raw_result, "seek result")?
        };

        // Validate frameReady handshake shape (f64 容差判 · 不严格整数相等).
        verify_frame_ready(&result, t_exact_ms, None)?;

        // Historical: FM-COMPOSITOR-COMMIT-ASYNC (BUG-20260419-v1.14-compositor-commit):
        // Historical: v1.14.3 fix · 真正的 commit barrier 在 `shell.snapshot()` 内部:
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

pub(crate) async fn wait_for_video_state_ready(
    shell: &MacHeadlessShell,
    expected_t: f64,
) -> Result<(), RecordError> {
    let started = Instant::now();
    loop {
        let raw = shell
            .eval_sync(
                "return JSON.stringify((window.__nf && typeof window.__nf.getVideoState === 'function') \
                 ? window.__nf.getVideoState() : { count: 0, clips: [] });",
            )
            .await?;
        let value = parse_json_result(raw, "video-state")?;
        if video_state_is_ready(&value, expected_t)? {
            return Ok(());
        }
        if started.elapsed() >= FRAME_SEEK_TIMEOUT {
            return Err(RecordError::FrameReadyTimeout(format!(
                "video-state not ready after {}ms at expected_t={expected_t:.6}",
                FRAME_SEEK_TIMEOUT.as_millis()
            )));
        }
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
}

pub(crate) async fn wait_for_export_seek_ready(
    shell: &MacHeadlessShell,
    expected_t: f64,
    min_seq_exclusive: u64,
) -> Result<serde_json::Value, RecordError> {
    let started = Instant::now();
    loop {
        let raw = shell
            .eval_sync("return window.__nf_read_seek_export();")
            .await?;
        let value = parse_json_result(raw, "export seek result")?;
        let runtime_seq = js_number_as_u64(value.get("seq")).unwrap_or(0);
        if runtime_seq > min_seq_exclusive {
            verify_frame_ready(&value, expected_t, Some(min_seq_exclusive))?;
            return Ok(value);
        }
        if started.elapsed() >= FRAME_SEEK_TIMEOUT {
            return Err(RecordError::FrameReadyTimeout(format!(
                "export seek not ready after {}ms at expected_t={expected_t:.6}",
                FRAME_SEEK_TIMEOUT.as_millis()
            )));
        }
        tokio::time::sleep(Duration::from_millis(4)).await;
    }
}

/// Validate `{t, frameReady, seq}` returned by `window.__nf.seek`.
///
/// Contract (interfaces-delta.json `nf-runtime::record-mode`):
/// - `frameReady` must be boolean `true`.
/// - `t` must equal the `expected_t` (f64) we sent (within 0.01 ms tolerance ·
///   JSON round-trip is exact for IEEE-754 doubles in the range we care about,
///   but runtime.js may return slightly different float after its own math).
/// - `seq` must be present as a number.
/// - when provided, `min_seq_exclusive` rejects stale export-poll results.
///
/// Tolerance rationale: with FM-T-QUANTIZATION fix (f64 pass-through · no round),
/// sent t values are `seq * 1000 / fps` which are generally not exactly representable
/// (e.g. 16.666...). JSON emit + JS parse preserves 52-bit mantissa · any tolerance
/// < 1e-10 is unnecessarily strict; 0.01ms is the explicit "integer-ms-era" compat.
pub(crate) fn verify_frame_ready(
    value: &serde_json::Value,
    expected_t: f64,
    min_seq_exclusive: Option<u64>,
) -> Result<(), RecordError> {
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

    let runtime_seq = js_number_as_u64(obj.get("seq")).ok_or_else(|| {
        RecordError::FrameReadyContract(format!("missing seq at expected_t={expected_t:.6}"))
    })?;
    if let Some(min_seq_exclusive) = min_seq_exclusive {
        if runtime_seq <= min_seq_exclusive {
            return Err(RecordError::FrameReadyContract(format!(
                "stale seq: expected > {min_seq_exclusive} got {runtime_seq} at expected_t={expected_t:.6}"
            )));
        }
    }

    Ok(())
}

pub(crate) fn parse_json_result(
    value: serde_json::Value,
    context: &str,
) -> Result<serde_json::Value, RecordError> {
    if let Some(s) = value.as_str() {
        serde_json::from_str::<serde_json::Value>(s).map_err(|e| {
            RecordError::FrameReadyContract(format!(
                "{context} returned non-JSON string: {e} · raw={s}"
            ))
        })
    } else {
        Ok(value)
    }
}

pub(crate) fn video_state_is_ready(
    value: &serde_json::Value,
    expected_t: f64,
) -> Result<bool, RecordError> {
    let Some(obj) = value.as_object() else {
        return Err(RecordError::FrameReadyContract(format!(
            "video-state expected object at expected_t={expected_t:.6} · got: {value}"
        )));
    };
    let count = js_number_as_u64(obj.get("count")).unwrap_or(0);
    if count == 0 {
        return Ok(true);
    }
    let Some(clips) = obj.get("clips").and_then(serde_json::Value::as_array) else {
        return Err(RecordError::FrameReadyContract(format!(
            "video-state missing clips at expected_t={expected_t:.6} · payload={value}"
        )));
    };
    let target_ms = expected_t.round() as i64;
    for clip in clips {
        let Some(clip_obj) = clip.as_object() else {
            return Err(RecordError::FrameReadyContract(format!(
                "video-state clip not object at expected_t={expected_t:.6} · payload={clip}"
            )));
        };
        let frame_ready = clip_obj
            .get("frame_ready")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let ready_state = js_number_as_u64(clip_obj.get("ready_state")).unwrap_or(0);
        let current_time_ms = clip_obj
            .get("current_time_ms")
            .and_then(serde_json::Value::as_i64)
            .or_else(|| {
                clip_obj
                    .get("current_time_ms")
                    .and_then(serde_json::Value::as_f64)
                    .filter(|v| v.is_finite())
                    .map(|v| v.round() as i64)
            })
            .unwrap_or(-1);
        if !frame_ready || ready_state < 2 {
            return Ok(false);
        }
        if (current_time_ms - target_ms).abs() > 80 {
            return Ok(false);
        }
    }
    Ok(true)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(payload: &str) -> Result<serde_json::Value, serde_json::Error> {
        serde_json::from_str(payload)
    }

    #[test]
    fn seek_result_frame_ready_false_rejected() -> Result<(), serde_json::Error> {
        let payload = parsed(r#"{"t": 0, "frameReady": false, "seq": 0}"#)?;
        let result = verify_frame_ready(&payload, 0.0, None);

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
        Ok(())
    }

    #[test]
    fn seek_result_missing_seq_rejected() -> Result<(), serde_json::Error> {
        let payload = parsed(r#"{"t": 0, "frameReady": true}"#)?;
        let result = verify_frame_ready(&payload, 0.0, None);

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
        Ok(())
    }

    #[test]
    fn seek_result_t_out_of_tolerance_rejected() -> Result<(), serde_json::Error> {
        let payload = parsed(r#"{"t": 100, "frameReady": true, "seq": 1}"#)?;
        let result = verify_frame_ready(&payload, 0.0, None);

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
        Ok(())
    }

    #[test]
    fn parse_json_result_malformed_rejected() {
        let raw = serde_json::Value::String("{not json".to_string());
        let result = parse_json_result(raw, "seek result");

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
    }

    #[test]
    fn seek_result_stale_seq_rejected() -> Result<(), serde_json::Error> {
        let payload = parsed(r#"{"t": 0, "frameReady": true, "seq": 3}"#)?;
        let result = verify_frame_ready(&payload, 0.0, Some(5));

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
        Ok(())
    }

    #[test]
    fn video_state_malformed_timeout() -> Result<(), serde_json::Error> {
        let payload = parsed(r#"{"count": 1, "clips": {"bad": true}}"#)?;
        let result = video_state_is_ready(&payload, 0.0);

        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
        Ok(())
    }
}
