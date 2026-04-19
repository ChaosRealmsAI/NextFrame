//! v1.44 · High-level export API · 从 source.json 直接产 MP4。
//!
//! 架构(ADR-064):
//! - 输入:source.json 路径 + 输出 MP4 路径 + 持续时长(秒)
//! - 内部:读 source.json + include 的 runtime-iife.js 拼一个自包含 HTML ·
//!   写 tmp · 调 `record_loop::run` 走 CARenderer + VideoToolbox pipeline
//! - 输出:MP4 + OutputStats(主调方拿来 log / verify)
//!
//! 一致性保证:recorder 跑的是跟 preview 同一份 `nf-runtime/dist/runtime-iife.js` ·
//! source.json 也是同一份 · runtime 按 ADR-045 t 纯驱动 · 同 t 同输出。
//! 即使 recorder 用 headless WKWebView · preview 用 wry 可见 WKWebView ·
//! 两条路径结果像素级一致(VP-4 验)。

use std::path::{Path, PathBuf};

use crate::orchestrator;
use crate::record_loop::{self, RecordConfig, RecordError};
use crate::OutputStats;

/// v1.44 · nf-runtime 浏览器端 IIFE 产物 · 编译时 inline · 跟 nf-shell preview 同源。
const RUNTIME_IIFE: &str = include_str!("../../nf-runtime/dist/runtime-iife.js");

/// v1.44 · 7 个官方 track 的 JS 源 · 编译时 inline · 喂给 runtime 解析
/// `__NF_SOURCE__.tracks[].kind` 定位到对应代码。跟 nf-shell preview 同源。
const TRACK_BG: &str = include_str!("../../nf-tracks/official/bg.js");
const TRACK_SCENE: &str = include_str!("../../nf-tracks/official/scene.js");
const TRACK_VIDEO: &str = include_str!("../../nf-tracks/official/video.js");
const TRACK_AUDIO: &str = include_str!("../../nf-tracks/official/audio.js");
const TRACK_CHART: &str = include_str!("../../nf-tracks/official/chart.js");
const TRACK_DATA: &str = include_str!("../../nf-tracks/official/data.js");
const TRACK_SUBTITLE: &str = include_str!("../../nf-tracks/official/subtitle.js");

fn track_source_for(kind: &str) -> Option<&'static str> {
    match kind {
        "bg" => Some(TRACK_BG),
        "scene" => Some(TRACK_SCENE),
        "video" => Some(TRACK_VIDEO),
        "audio" => Some(TRACK_AUDIO),
        "chart" => Some(TRACK_CHART),
        "data" => Some(TRACK_DATA),
        "subtitle" => Some(TRACK_SUBTITLE),
        _ => None,
    }
}

fn build_tracks_map_json(source_json: &serde_json::Value) -> String {
    use serde_json::{Map, Value};
    let mut map: Map<String, Value> = Map::new();
    if let Some(tracks) = source_json.get("tracks").and_then(|v| v.as_array()) {
        for tr in tracks {
            let Some(kind) = tr.get("kind").and_then(|v| v.as_str()) else {
                continue;
            };
            if map.contains_key(kind) {
                continue;
            }
            if let Some(src) = track_source_for(kind) {
                map.insert(kind.to_string(), Value::String(src.to_string()));
            }
        }
    }
    serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string())
}

/// Export 参数 · lib 层封装 · 主调方(nf-shell)不用管内部 `RecordConfig` 细节。
#[derive(Debug, Clone)]
pub struct ExportOpts {
    /// 持续时长(秒)· `>0.0` 必需。
    pub duration_s: f64,
    /// Viewport(宽, 高)· 默认 (1920, 1080)。
    pub viewport: (u32, u32),
    /// 帧率 · ∈ {30, 60} · 默认 60。
    pub fps: u32,
    /// VideoToolbox 目标比特率(bps)· 默认 12Mbps。
    pub bitrate_bps: u32,
    /// v1.44.1 · 并行切片 N(ADR-061)· 默认 1 = 单进程 · ≥2 走 orchestrator。
    /// duration < 6s 时 orchestrator 自动降级单进程(segment boot 开销吃掉收益)。
    pub parallel: usize,
}

impl Default for ExportOpts {
    fn default() -> Self {
        Self {
            duration_s: 5.0,
            viewport: (1920, 1080),
            fps: 60,
            bitrate_bps: 12_000_000,
            parallel: 1,
        }
    }
}

/// v1.44 · 高层 lib API · 输入 source.json 路径 · 输出 MP4。
///
/// 主调方(nf-shell):
/// ```ignore
/// let stats = nf_recorder::run_export_from_source(
///     Path::new("demo/v1.8/source.json"),
///     Path::new("/tmp/out.mp4"),
///     ExportOpts { duration_s: 3.0, ..Default::default() },
/// ).await?;
/// println!("wrote {} bytes", stats.bytes_written);
/// ```
///
/// 内部:构造临时 HTML `{tmp}/nf-export-{pid}-{nanos}.html` · 写 · 喂给
/// `record_loop::run` · 退出时临时文件自动 drop(OS tmp cleanup)。
pub async fn run_export_from_source(
    source_path: &Path,
    output: &Path,
    opts: ExportOpts,
) -> Result<OutputStats, RecordError> {
    if !source_path.exists() {
        return Err(RecordError::BundleLoadFailed(format!(
            "source.json not found: {}",
            source_path.display()
        )));
    }
    if opts.duration_s <= 0.0 {
        return Err(RecordError::FrameReadyContract(format!(
            "duration_s must be > 0 (got {})",
            opts.duration_s
        )));
    }

    // 读 source.json · 直接 inline 到 HTML 的 __NF_SOURCE__ 里。
    let source_text = std::fs::read_to_string(source_path).map_err(|e| {
        RecordError::BundleLoadFailed(format!(
            "read source.json {}: {e}",
            source_path.display()
        ))
    })?;
    // Parse 一次拿到 viewport · 同时用于构建 tracks map。
    let source_json: serde_json::Value =
        serde_json::from_str(&source_text).map_err(|e| {
            RecordError::BundleLoadFailed(format!("source.json not valid JSON: {e}"))
        })?;
    let tracks_map_json = build_tracks_map_json(&source_json);

    let (vp_w, vp_h) = opts.viewport;
    let html = build_export_html(&source_text, &tracks_map_json, vp_w, vp_h);

    // 写 tmp file · macOS /tmp 没 gitignore 问题 · 独占进程 pid + nanos 防撞。
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let tmp_html: PathBuf = std::env::temp_dir().join(format!("nf-export-{pid}-{nanos}.html"));
    std::fs::write(&tmp_html, html.as_bytes()).map_err(|e| {
        RecordError::BundleLoadFailed(format!(
            "write tmp html {}: {e}",
            tmp_html.display()
        ))
    })?;

    // max_duration_s 给 recorder 留一点 buffer · ceil + 2s。
    let max_duration_s = (opts.duration_s.ceil() as u32).saturating_add(2);

    let cfg = RecordConfig {
        bundle: tmp_html.clone(),
        output: output.to_path_buf(),
        width: vp_w,
        height: vp_h,
        fps: opts.fps,
        bitrate_bps: opts.bitrate_bps,
        max_duration_s,
        frame_range: None,
    };

    // v1.44.1 · parallel >= 2 走 orchestrator (spawn N 子进程 + ffmpeg concat) ·
    // 短视频(<6s) orchestrator 内部自动降级单进程 · duration 够长走真并行。
    // 单进程路径用 record_loop::run 拿 OutputStats · 并行路径 orchestrator 返 ()
    // · 用一个 synthetic stats 满足返回类型(size 从文件 metadata 读).
    let result: Result<OutputStats, RecordError> = if opts.parallel >= 2 {
        let total_frames = ((opts.duration_s * f64::from(opts.fps)).round()) as u64;
        match orchestrator::run_parallel(cfg, opts.parallel).await {
            Ok(()) => {
                let size_bytes = std::fs::metadata(output).map(|m| m.len()).unwrap_or(0);
                Ok(OutputStats {
                    path: output.to_path_buf(),
                    frames: total_frames,
                    duration_ms: (opts.duration_s * 1000.0) as u64,
                    size_bytes,
                    moov_front: true, // orchestrator ffmpeg concat 强制 +faststart
                })
            }
            Err(e) => Err(e),
        }
    } else {
        record_loop::run(cfg).await
    };

    // 清临时文件 · 不管 result 成功与否。
    let _ = std::fs::remove_file(&tmp_html);

    result
}

/// 构造自包含 export HTML · 含 runtime + __NF_SOURCE__ + mount。
///
/// 关键点(ADR-064):
/// - runtime-iife.js inline (同 preview 同源)
/// - __NF_SOURCE__ 全 JSON inline (同 preview 同源)
/// - 挂载到 body · stage 固定尺寸 viewport px
/// - boot({startAtMs:0}) · autoplay · 后续 record_loop 用 seek(t) 精确驱动
/// - 暴露 window.__nf.{seek, getDuration} 给 recorder 调
fn build_export_html(source_json: &str, tracks_map_json: &str, vp_w: u32, vp_h: u32) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width={vp_w},height={vp_h},initial-scale=1,user-scalable=no">
<title>nf-export</title>
<style>
html,body{{margin:0;padding:0;background:#000;width:{vp_w}px;height:{vp_h}px;overflow:hidden}}
#nf-stage{{position:absolute;top:0;left:0;width:{vp_w}px;height:{vp_h}px;transform-origin:top left}}
</style>
</head>
<body>
<div id="nf-stage"></div>
<script>
window.__NF_SOURCE__ = {source_json};
window.__NF_TRACKS__ = {tracks_map_json};
{runtime}

(function(){{
  try {{
    var handle = window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: false, startAtMs: 0 }});
    window.__nf = window.__nf || {{}};
    window.__nf.handle = handle;
    // recorder 合约 (v1.14 FrameReadyContract):
    // - seek(t_ms) 返 {{t, frameReady:true, seq}} · t 在 0.01ms 容差内等于 t_ms · seq 单调递增
    // - 外部 t 纯驱动 (ADR-045) · 不依赖 RAF
    var _seq = 0;
    window.__nf.seek = function(t_ms) {{
      var t = Number(t_ms) || 0;
      try {{
        if (handle && typeof handle.seek === 'function') handle.seek(t);
      }} catch (e) {{
        // track update 抛错不让录制中断 · 记 console · 继续下一帧
        try {{ console.error('[NF-EXPORT] track.update threw at t=' + t, e && e.message); }} catch (_e) {{}}
      }}
      _seq += 1;
      // JSON 往返 · 防 WKWebView callAsyncJavaScript 抛 "unsupported type" ·
      // 保证返回值总是纯可序列化 JSON。
      return JSON.parse(JSON.stringify({{ t: t, frameReady: true, seq: _seq }}));
    }};
    window.__nf.getDuration = function() {{
      if (handle && typeof handle.getDuration === 'function') return handle.getDuration();
      // fallback · 读 source.meta.duration_ms / duration_ms / max(track.clips.end_ms)
      var src = window.__NF_SOURCE__ || {{}};
      if (src.meta && typeof src.meta.duration_ms === 'number') return src.meta.duration_ms;
      if (typeof src.duration_ms === 'number') return src.duration_ms;
      var max = 0;
      (src.tracks||[]).forEach(function(tr){{ (tr.clips||[]).forEach(function(c){{
        if (typeof c.end_ms === 'number' && c.end_ms > max) max = c.end_ms;
      }}); }});
      return max || 5000;
    }};
    console.log('[NF-EXPORT] runtime booted · viewport {vp_w}x{vp_h}');
  }} catch (e) {{
    console.error('[NF-EXPORT] boot failed:', e);
  }}
}})();
</script>
</body>
</html>
"#,
        runtime = RUNTIME_IIFE,
    )
}
