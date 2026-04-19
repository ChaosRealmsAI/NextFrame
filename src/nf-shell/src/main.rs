//! nf-shell — NextFrame desktop shell (v1.21).
//!
//! v1.20 baseline: borderless 1440x900, loads v2-hifi prototype, nf-runtime
//!                 renders the demo.
//! v1.21 delta  : native AppKit titlebar ergonomics ported from archived
//!                v1.19 shell-mac (transparent titlebar + hidden title +
//!                full-size content view + traffic lights survive at y-centred
//!                inset; drag-move / resize / close / min / zoom all live),
//!                IPC (clip-drag + set-param + drag-window), built-in
//!                screenshot CLI (SVG-foreignObject → PNG, no external tool).
//!
//! CLI:
//!   `nf-shell [source.json]`                — interactive
//!   `nf-shell --verify [source.json]`       — run built-in IPC verify suite
//!   `nf-shell --screenshot <out.png> [--delay-ms N] [source.json]`
//!                                            — capture WebView → PNG and exit

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use serde_json::{Map, Value};
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop, EventLoopBuilder};
use tao::platform::macos::WindowBuilderExtMacOS;
use tao::window::WindowBuilder;
use wry::http;
use wry::WebViewBuilder;

const WINDOW_TITLE: &str = "NextFrame";
const WINDOW_W: f64 = 1440.0;
const WINDOW_H: f64 = 900.0;
const TITLEBAR_INSET_X: f64 = 18.0;
const TITLEBAR_INSET_Y: f64 = 18.0;

const PROTOTYPE_HTML: &str = include_str!("../../../spec/versions/v1.20/prototype.html");
const RUNTIME_IIFE: &str = include_str!("../../nf-runtime/dist/runtime-iife.js");
const TRACK_BG: &str = include_str!("../../nf-tracks/official/bg.js");
const TRACK_SCENE: &str = include_str!("../../nf-tracks/official/scene.js");
const TRACK_VIDEO: &str = include_str!("../../nf-tracks/official/video.js");
const TRACK_AUDIO: &str = include_str!("../../nf-tracks/official/audio.js");
const TRACK_CHART: &str = include_str!("../../nf-tracks/official/chart.js");
const TRACK_DATA: &str = include_str!("../../nf-tracks/official/data.js");
const TRACK_SUBTITLE: &str = include_str!("../../nf-tracks/official/subtitle.js");

#[derive(Debug, Clone)]
enum UserEvent {
    EvalScript(String),
    DragWindow,
    ScreenshotNow(PathBuf),
    StartExport {
        path: PathBuf,
        duration_s: f64,
    },
    ExportDone {
        path: PathBuf,
        ok: bool,
        msg: String,
    },
    MenuOpen,
    MenuSave,
    VerifyDone,
    VerifyMediaReport { path: PathBuf, json: String },
}

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

fn build_track_sources(source_json: &Value) -> Map<String, Value> {
    let mut map = Map::new();
    let Some(tracks) = source_json.get("tracks").and_then(|v| v.as_array()) else {
        return map;
    };
    for t in tracks {
        let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let kind = t.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
            continue;
        }
        if let Some(src) = track_source_for(kind) {
            map.insert(id.to_string(), Value::String(src.to_string()));
        }
    }
    map
}

fn find_clip_mut<'a>(source: &'a mut Value, clip_id: &str) -> Option<&'a mut Value> {
    let tracks = source.get_mut("tracks")?.as_array_mut()?;
    for t in tracks.iter_mut() {
        let clips = t.get_mut("clips")?.as_array_mut()?;
        for c in clips.iter_mut() {
            if c.get("id").and_then(|v| v.as_str()) == Some(clip_id) {
                return Some(c);
            }
        }
    }
    None
}

fn apply_clip_drag(source: &mut Value, payload: &Value) -> Result<String> {
    let clip_id = payload
        .get("clipId")
        .and_then(|v| v.as_str())
        .context("clip-drag: clipId missing")?;
    let side = payload
        .get("side")
        .and_then(|v| v.as_str())
        .unwrap_or("right");
    let delta = payload
        .get("deltaT_ms")
        .and_then(|v| v.as_i64())
        .context("clip-drag: deltaT_ms missing or not int")?;
    let clip = find_clip_mut(source, clip_id)
        .with_context(|| format!("clip-drag: clip not found: {clip_id}"))?;
    let key = format!("_v1_21_drag_offset_{side}_ms");
    let current = clip.get(&key).and_then(|v| v.as_i64()).unwrap_or(0);
    clip[key] = Value::from(current + delta);
    Ok(format!("clip-drag applied: {clip_id} {side} {delta:+}ms"))
}

fn apply_set_param(source: &mut Value, payload: &Value) -> Result<String> {
    let clip_id = payload
        .get("clipId")
        .and_then(|v| v.as_str())
        .context("set-param: clipId missing")?;
    let path = payload
        .get("path")
        .and_then(|v| v.as_str())
        .context("set-param: path missing")?;
    let new_value = payload
        .get("value")
        .cloned()
        .context("set-param: value missing")?;
    let clip = find_clip_mut(source, clip_id)
        .with_context(|| format!("set-param: clip not found: {clip_id}"))?;
    let params = clip
        .get_mut("params")
        .context("set-param: clip has no params")?;
    let segments: Vec<&str> = path.split('.').collect();
    let mut cursor: &mut Value = params;
    for seg in &segments[..segments.len() - 1] {
        cursor = if let Ok(idx) = seg.parse::<usize>() {
            cursor
                .get_mut(idx)
                .with_context(|| format!("set-param: index {idx} missing"))?
        } else {
            cursor
                .get_mut(*seg)
                .with_context(|| format!("set-param: key {seg} missing"))?
        };
    }
    let last = segments[segments.len() - 1];
    if let Ok(idx) = last.parse::<usize>() {
        if let Some(arr) = cursor.as_array_mut() {
            if idx < arr.len() {
                arr[idx] = new_value;
            } else {
                anyhow::bail!("set-param: index {idx} out of bounds");
            }
        } else {
            anyhow::bail!("set-param: tail expects array");
        }
    } else if let Some(obj) = cursor.as_object_mut() {
        obj.insert(last.to_string(), new_value);
    } else {
        anyhow::bail!("set-param: tail expects object");
    }
    Ok(format!("set-param applied: {clip_id}.{path}"))
}

enum IpcOutcome {
    Mutated(String),
    DragWindow,
    MenuOpen,
    MenuSave,
    StartExport { path: PathBuf, duration_s: f64 },
    VerifyMediaReport(String),
}

fn dispatch_ipc(source: &mut Value, body: &str) -> Result<IpcOutcome> {
    let env: Value = serde_json::from_str(body).context("IPC body not JSON")?;
    let kind = env
        .get("kind")
        .and_then(|v| v.as_str())
        .context("envelope: kind missing")?;
    let payload = env.get("payload").cloned().unwrap_or(Value::Null);
    match kind {
        "clip-drag" => Ok(IpcOutcome::Mutated(apply_clip_drag(source, &payload)?)),
        "set-param" => Ok(IpcOutcome::Mutated(apply_set_param(source, &payload)?)),
        "drag-window" => Ok(IpcOutcome::DragWindow),
        "menu-open" => Ok(IpcOutcome::MenuOpen),
        "menu-save" => Ok(IpcOutcome::MenuSave),
        "verify-media-report" => {
            let p = env.get("payload").cloned().unwrap_or(Value::Null);
            Ok(IpcOutcome::VerifyMediaReport(
                serde_json::to_string_pretty(&p).unwrap_or_else(|_| "null".into()),
            ))
        }
        "export-mp4" => {
            let path = payload
                .get("path")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .context("export-mp4: path missing")?;
            let duration_s = payload
                .get("duration_s")
                .and_then(|v| v.as_f64())
                .unwrap_or(5.0);
            Ok(IpcOutcome::StartExport { path, duration_s })
        }
        other => anyhow::bail!("unknown ipc kind: {other}"),
    }
}

// v1.44 · 老 ffmpeg avfoundation 屏幕录制路径(run_ffmpeg_export / ffmpeg_available)
// 已砍 · 改为走 nf_recorder::run_export_from_source · runtime 驱动 · CARenderer
// + VideoToolbox · 脱屏录制 · 和 preview 像素级一致(ADR-064)。
// 参考历史:v1.22 1179900b / v1.22.1 294316ca 的 run_ffmpeg_export 实现 ·
// 通过 git log 可查 · 若特殊场景需回退可 cherry-pick 回来。
fn run_recorder_export(
    source_path: &std::path::Path,
    out: &std::path::Path,
    duration_s: f64,
) -> Result<u64> {
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).context("mkdir parent")?;
    }
    // MacHeadlessShell 要 main thread · 所以用 current_thread runtime。
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .context("build tokio current-thread runtime")?;
    let stats = rt
        .block_on(nf_recorder::run_export_from_source(
            source_path,
            out,
            nf_recorder::ExportOpts {
                duration_s,
                ..Default::default()
            },
        ))
        .map_err(|e| anyhow::anyhow!("nf-recorder: {e}"))?;
    let bytes = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        anyhow::bail!("nf-recorder produced empty file");
    }
    // stats 用于 log · 不用返回
    let _ = stats;
    Ok(bytes)
}

/// Capture the nf-shell window region via `screencapture -R x,y,w,h`.
/// Rationale: WKWebView does not expose `takeSnapshot` through wry, SVG
/// foreignObject rasterisation hits WebKit's tainted-canvas wall for mixed
/// CSS, and pulling in `core-graphics`/`cocoa` for `CGWindowListCreateImage`
/// just for screenshots would double the binary. `screencapture` is present
/// on every macOS (no brew, no permissions if invoked by the app itself on
/// its own window region) and gives us a 1:1 PNG of what the user sees.
/// The user-facing contract remains "one CLI flag → a PNG on disk".
fn capture_region_png(path: &std::path::Path, x: f64, y: f64, w: f64, h: f64) -> Result<u64> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("mkdir parent")?;
    }
    let region = format!(
        "{},{},{},{}",
        x as i64, y as i64, w as i64, h as i64
    );
    let status = std::process::Command::new("screencapture")
        .arg("-x")
        .arg("-R")
        .arg(&region)
        .arg(path)
        .status()
        .context("spawn screencapture")?;
    if !status.success() {
        anyhow::bail!("screencapture exited with {}", status);
    }
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        anyhow::bail!("screencapture produced empty file");
    }
    Ok(bytes)
}

fn build_init_script(
    source_json: &Value,
    tracks_map: &Map<String, Value>,
    verify_mode: bool,
    screenshot_after_ms: Option<u64>,
    source_path: &str,
    verify_media_mode: bool,
) -> String {
    let source_str = serde_json::to_string(source_json).unwrap_or_else(|_| "{}".to_string());
    let tracks_str = serde_json::to_string(tracks_map).unwrap_or_else(|_| "{}".to_string());
    let source_path_str =
        serde_json::to_string(source_path).unwrap_or_else(|_| "\"<unknown>\"".to_string());
    let verify_block = if verify_mode {
        r#"
setTimeout(function(){
  console.log('[NF-VERIFY] dispatch VP-1 clip-drag');
  window.ipc.postMessage(JSON.stringify({kind:'clip-drag', payload:{clipId:'bg-clip-01', side:'right', deltaT_ms:-1000}}));
}, 1500);
setTimeout(function(){
  console.log('[NF-VERIFY] dispatch VP-2 set-param scene title');
  window.ipc.postMessage(JSON.stringify({kind:'set-param', payload:{clipId:'scene-hero-01', path:'title', value:'Hello v1.21'}}));
}, 3000);
setTimeout(function(){
  console.log('[NF-VERIFY] dispatch VP-3 set-param bg color');
  window.ipc.postMessage(JSON.stringify({kind:'set-param', payload:{clipId:'bg-clip-01', path:'stops.0.color', value:'#ff0066'}}));
}, 4500);
"#
        .to_string()
    } else {
        String::new()
    };
    // Screenshot is driven by the Rust side now (see spawn in main loop);
    // no in-page JS needed for it.
    let _ = screenshot_after_ms;
    let screenshot_block = String::new();

    // v1.28 self-verify media playback:
    // Snapshot all <video>/<audio> element state at t0 and t1 (2s apart).
    // If currentTime advanced → media is playing. If paused=true or
    // currentTime did not change → media did NOT play. Report via IPC.
    let verify_media_block = if verify_media_mode {
        r#"
setTimeout(function() {
  // Kick media elements into playback — WKWebView has autoplay=true (via
  // with_autoplay wry flag) which sets mediaTypesRequiringUserActionForPlayback:0,
  // but nf-runtime only calls v.play() after first user gesture. In
  // verify-media mode we force-play all media so the probe measures actual
  // playback capability, not a gating artefact.
  try {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) { try { vids[i].muted = true; vids[i].play(); } catch(_e){} }
    var auds = document.querySelectorAll('audio');
    for (var j = 0; j < auds.length; j++) { try { auds[j].play(); } catch(_e){} }
    if (window.__nf_handle && typeof window.__nf_handle.play === 'function') {
      try { window.__nf_handle.play(); } catch(_e){}
    }
  } catch(_e){}
}, 1000);
setTimeout(function() {
  function docSummary() {
    var stage = document.querySelector('#nf-stage');
    return {
      doc_videos: document.querySelectorAll('video').length,
      doc_audios: document.querySelectorAll('audio').length,
      stage_exists: !!stage,
      stage_children: stage ? stage.children.length : -1,
      stage_html_head: stage ? (stage.innerHTML || '').slice(0, 400) : '',
      nf_handle: !!window.__nf_handle,
      source_tracks_n: (window.__NF_SOURCE__ && window.__NF_SOURCE__.tracks) ? window.__NF_SOURCE__.tracks.length : 0,
      tracks_map_keys: Object.keys(window.__NF_TRACKS__ || {}),
      nf_playing: !!window.__nf_playing,
      console_errors: window.__nf_errors || [],
      mount_trace: window.__nf_mount_trace || [],
      ready_state: document.readyState
    };
  }
  function snapMedia() {
    var out = {videos:[], audios:[]};
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      out.videos.push({
        idx: i,
        src: v.currentSrc || v.src || '',
        paused: v.paused,
        muted: v.muted,
        currentTime: v.currentTime,
        duration: isFinite(v.duration) ? v.duration : -1,
        readyState: v.readyState,
        error: v.error ? String(v.error.code) : null
      });
    }
    var auds = document.querySelectorAll('audio');
    for (var j = 0; j < auds.length; j++) {
      var a = auds[j];
      out.audios.push({
        idx: j,
        src: a.currentSrc || a.src || '',
        paused: a.paused,
        muted: a.muted,
        volume: a.volume,
        currentTime: a.currentTime,
        duration: isFinite(a.duration) ? a.duration : -1,
        readyState: a.readyState,
        error: a.error ? String(a.error.code) : null
      });
    }
    return out;
  }
  var t0 = snapMedia();
  setTimeout(function() {
    var t1 = snapMedia();
    function verdict(a, b) {
      if (!a || !b) return 'missing';
      if (b.paused && a.paused) return 'paused_stuck';
      if (b.currentTime > a.currentTime + 0.05) return 'PLAYING';
      if (b.readyState < 2) return 'not_loaded';
      return 'stalled_at_' + b.currentTime.toFixed(2);
    }
    var summary = docSummary();
    var report = {
      source_path: window.__NF_SOURCE_PATH__,
      source_name: (window.__NF_SOURCE__ && window.__NF_SOURCE__.meta && window.__NF_SOURCE__.meta.name) || '',
      interval_s: 2.0,
      summary: summary,
      t0: t0, t1: t1,
      videos_verdict: t0.videos.map(function(v0, i) {
        return { src_tail: (v0.src || '').split('/').pop(), verdict: verdict(v0, t1.videos[i]), t0_paused: v0.paused, t1_paused: t1.videos[i] && t1.videos[i].paused, t0_ct: v0.currentTime, t1_ct: t1.videos[i] && t1.videos[i].currentTime, error: t1.videos[i] && t1.videos[i].error };
      }),
      audios_verdict: t0.audios.map(function(a0, i) {
        return { src_tail: (a0.src || '').split('/').pop(), verdict: verdict(a0, t1.audios[i]), t0_paused: a0.paused, t1_paused: t1.audios[i] && t1.audios[i].paused, t0_ct: a0.currentTime, t1_ct: t1.audios[i] && t1.audios[i].currentTime, error: t1.audios[i] && t1.audios[i].error };
      })
    };
    console.log('[NF-VERIFY-MEDIA]', JSON.stringify(report));
    window.ipc.postMessage(JSON.stringify({kind:'verify-media-report', payload: report}));
  }, 2000);
}, 2500);
"#.to_string()
    } else { String::new() };
    format!(
        r#"
window.__NF_SOURCE__ = {source};
window.__NF_TRACKS__ = {tracks};
window.__NF_SOURCE_PATH__ = {source_path};
{runtime}

// v1.23: source badge — fixed top-right chip showing which JSON drives this view.
window.__nf_install_source_badge = function() {{
  if (document.getElementById('nf-source-badge')) return;
  var meta = (window.__NF_SOURCE__ && window.__NF_SOURCE__.meta) || {{}};
  var name = meta.name || '';
  var path = window.__NF_SOURCE_PATH__ || '';
  var tracks = (window.__NF_SOURCE__ && Array.isArray(window.__NF_SOURCE__.tracks)) ? window.__NF_SOURCE__.tracks.length : 0;
  var el = document.createElement('div');
  el.id = 'nf-source-badge';
  el.style.cssText =
    'position:fixed;top:60px;right:14px;z-index:9998;' +
    'background:rgba(0,0,0,0.55);backdrop-filter:blur(12px);' +
    'border:1px solid rgba(167,139,250,0.30);border-radius:8px;' +
    'padding:6px 12px;color:rgba(255,255,255,0.85);' +
    'font:500 11px/1.5 "SF Mono",Menlo,monospace;' +
    'max-width:420px;pointer-events:auto;user-select:text';
  el.innerHTML =
    '<div style="color:#a78bfa;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:9px;margin-bottom:2px">Source · Live JSON</div>' +
    '<div style="color:#fff;font-weight:600;font-size:12px">' + (name ? String(name).replace(/</g,'&lt;') : '(untitled)') + '</div>' +
    '<div style="color:rgba(255,255,255,0.55);font-size:10px;margin-top:2px">' + tracks + ' tracks · ' + String(path).replace(/</g,'&lt;') + '</div>';
  document.body.appendChild(el);
}};

// v1.22.1 letterbox reflow: stage 是 viewport px size · letterbox scale to fit
// plate (取 min(scaleW, scaleH) · 保证等比 · 不变形) · center 留白 pillarbox/letterbox
window.__nf_reflow = function() {{
  var plate = document.querySelector('#nf-plate');
  var stage = document.querySelector('#nf-stage');
  if (!plate || !stage) return;
  var vp = (window.__NF_SOURCE__ && window.__NF_SOURCE__.viewport) || {{w:1920, h:1080}};
  var pw = plate.clientWidth, ph = plate.clientHeight;
  var scale = Math.min(pw / vp.w, ph / vp.h);
  if (!isFinite(scale) || scale <= 0) return;
  var displayW = vp.w * scale, displayH = vp.h * scale;
  stage.style.transform = 'scale(' + scale + ')';
  stage.style.left = ((pw - displayW) / 2) + 'px';
  stage.style.top = ((ph - displayH) / 2) + 'px';
}};

// v1.28: trap console errors for self-verify diagnostics.
window.__nf_errors = [];
(function(){{
  var orig = console.error;
  console.error = function() {{
    try {{ window.__nf_errors.push(Array.prototype.slice.call(arguments).map(String).join(' ')); }} catch(_e){{}}
    return orig.apply(console, arguments);
  }};
  window.addEventListener('error', function(e) {{
    window.__nf_errors.push('window.onerror: ' + (e.message || String(e)));
  }});
}})();

window.__nf_mount_trace = [];
window.__nf_mount = function() {{
  window.__nf_mount_trace.push('enter');
  try {{
    var ps = document.querySelector('.preview-stage');
    var cp = document.querySelector('.canvas-plate.canvas-16-9');
    var host = ps || cp || document.body;
    var vp = (window.__NF_SOURCE__ && window.__NF_SOURCE__.viewport) || {{w:1920, h:1080}};
    // Plate 填充可用空间 (flex container) · 不强制 aspect-ratio (避免宽高约束冲突)
    // stage native size = viewport px · transform-origin:top-left + scale +
    // top/left 由 __nf_reflow 动态计算 · resize 自动重算
    host.innerHTML =
      '<div class="canvas-plate canvas-16-9" id="nf-plate" style="position:relative;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:10px;overflow:hidden;background:#0a0a0f">' +
        '<div id="nf-stage" style="position:absolute;top:0;left:0;width:' + vp.w + 'px;height:' + vp.h + 'px;transform-origin:top left;overflow:hidden;z-index:10"></div>' +
      '</div>';
    window.__nf_mount_trace.push('host.innerHTML set');
    // v1.28: replace rAF with setTimeout — rAF can be suspended in
    // WKWebView when the window is marked offscreen / background during
    // early load, and we observed mount_trace stuck at 'host.innerHTML set'
    // because the rAF callback never fired. setTimeout(0) is reliable.
    setTimeout(function(){{
      window.__nf_mount_trace.push('setTimeout fired');
      window.__nf_reflow();
      // v1.24: force boot at t=0 so preview plays from the start of the
      // timeline (earlier we relied on runtime default which wasn't always 0).
      window.__nf_mount_trace.push('pre-boot · NFRuntime=' + (typeof window.NFRuntime));
      window.__nf_handle = window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: true, startAtMs: 0 }});
      window.__nf_mount_trace.push('post-boot · handle=' + (typeof window.__nf_handle));
      window.__nf_playing = true;
      // Belt-and-suspenders: if the handle exposes seek(), snap to 0.
      try {{ if (window.__nf_handle && typeof window.__nf_handle.seek === 'function') window.__nf_handle.seek(0); }} catch (_e) {{}}
      console.log('[NF] runtime booted · tracks=' + Object.keys(window.__NF_TRACKS__).length + ' · seeked to 0');
      window.__nf_install_drag_handles();
      window.__nf_install_play_button();
      window.__nf_install_source_badge();
      window.__nf_render_timeline();
      window.__nf_install_playhead();
      // v1.28: force media playback — WKWebView has autoplay=true via the
      // wry attribute (mediaTypesRequiringUserActionForPlayback:0), but the
      // nf-runtime keeps a _userEverPlayed gate that prevents auto-play
      // until the first click. The desktop shell wants video/audio to come
      // up ready-to-watch, so we kick every <video>/<audio> once the stage
      // is mounted. 200ms lets diffAndMount settle.
      setTimeout(function() {{
        var stage = document.querySelector('#nf-stage');
        if (!stage) return;
        var vids = stage.querySelectorAll('video');
        for (var i = 0; i < vids.length; i++) {{
          try {{ var vp = vids[i].play(); if (vp && vp.catch) vp.catch(function(){{}}); }} catch(_e){{}}
        }}
        var auds = stage.querySelectorAll('audio');
        for (var j = 0; j < auds.length; j++) {{
          try {{ var ap = auds[j].play(); if (ap && ap.catch) ap.catch(function(){{}}); }} catch(_e){{}}
        }}
      }}, 200);
    }}, 0);
    if (!window.__nf_resize_wired) {{
      window.__nf_resize_wired = true;
      window.addEventListener('resize', window.__nf_reflow);
    }}
  }} catch (e) {{
    console.error('[NF] mount failed:', e && e.stack || e);
  }}
}};

window.__nf_apply_source = function(newSource) {{
  window.__NF_SOURCE__ = newSource;
  window.__nf_mount();
}};

// ---- v1.24: Render timeline header + labels + lanes + ruler FROM live JSON.
// Replaces the static 4-track hifi mockup in prototype.html. Track count,
// names, src filename, clip count all driven by __NF_SOURCE__.tracks.
window.__nf_render_timeline = function() {{
  var src = window.__NF_SOURCE__;
  if (!src || !Array.isArray(src.tracks)) return;
  var tracks = src.tracks;
  var durationMs = (typeof src.duration_ms === 'number' && src.duration_ms > 0)
    ? src.duration_ms
    : window.__nf_infer_duration(src) || 60000;

  var title = document.querySelector('.tl-title');
  if (title) title.textContent = 'Timeline · ' + tracks.length + ' tracks';
  var chips = document.querySelectorAll('.tl-info .mini-chip');
  var totalClips = tracks.reduce(function(a,t){{ return a + ((t.clips||[]).length); }}, 0);
  if (chips[0]) chips[0].textContent = tracks.length + ' tracks · ' + totalClips + ' clips';
  if (chips[1]) chips[1].textContent = 'anchors: ' + Object.keys(src.anchors||{{}}).length;

  // Labels column.
  var labels = document.querySelector('.tl-labels');
  if (labels) {{
    var head = labels.querySelector('.tl-labels-head');
    labels.innerHTML = '';
    if (head) labels.appendChild(head);
    else {{ var h=document.createElement('div'); h.className='tl-labels-head'; h.textContent='Track · Component'; labels.appendChild(h); }}
    var iconMap = {{'bg':'B','scene':'S','video':'V','audio':'A','chart':'C','data':'D','subtitle':'T'}};
    tracks.forEach(function(t, i) {{
      var el = document.createElement('div');
      el.className = 'tk-label' + (i === 0 ? ' active' : '');
      var label = iconMap[t.kind] || (t.kind || '?').slice(0,1).toUpperCase();
      var srcFile = t.src ? String(t.src).split('/').pop() : ((t.kind || 'track') + '.js');
      var clipCount = (t.clips || []).length;
      el.innerHTML =
        '<div class="tk-icon v">' + label + '</div>' +
        '<div class="tk-text">' +
          '<div class="tk-name">' + String(t.id || '(no id)').replace(/</g,'&lt;') + '</div>' +
          '<div class="tk-meta">' + srcFile.replace(/</g,'&lt;') + '</div>' +
          '<div class="tk-anim">kind=' + String(t.kind || '?') + ' · ' + clipCount + ' clip(s)</div>' +
        '</div>' +
        '<div class="tk-ctrls"></div>';
      labels.appendChild(el);
    }});
  }}

  // Lanes + ruler.
  var lanes = document.querySelector('.tl-lanes');
  if (lanes) {{
    lanes.innerHTML = '';
    // Ruler: N ticks spanning total duration.
    var ruler = document.createElement('div');
    ruler.className = 'tl-ruler';
    ruler.style.cssText = 'position:relative;height:22px;border-bottom:1px solid rgba(255,255,255,0.08);font:10px/1 "SF Mono",monospace;color:rgba(255,255,255,0.5)';
    var tickCount = 8;
    for (var j = 0; j <= tickCount; j++) {{
      var tick = document.createElement('div');
      var pct = (j / tickCount) * 100;
      var tMs = (durationMs * j / tickCount) | 0;
      tick.style.cssText = 'position:absolute;left:' + pct + '%;top:2px;bottom:2px;border-left:1px solid rgba(255,255,255,0.12);padding-left:4px';
      tick.textContent = window.__nf_fmt_ms(tMs);
      ruler.appendChild(tick);
    }}
    lanes.appendChild(ruler);
    // One lane row per track; clip bars sized by clip.begin/end in ms.
    var palette = ['#a78bfa','#f97316','#34d399','#38bdf8','#f472b6','#fbbf24','#fb7185'];
    tracks.forEach(function(t, i) {{
      var row = document.createElement('div');
      row.style.cssText = 'position:relative;height:44px;border-bottom:1px solid rgba(255,255,255,0.04)';
      var color = palette[i % palette.length];
      (t.clips || []).forEach(function(c) {{
        var beginMs = window.__nf_resolve_ms(c.begin, src, 0);
        var endMs   = window.__nf_resolve_ms(c.end,   src, durationMs);
        var l = (beginMs / durationMs) * 100;
        var w = Math.max(2, ((endMs - beginMs) / durationMs) * 100);
        var bar = document.createElement('div');
        bar.style.cssText =
          'position:absolute;left:' + l + '%;width:' + w + '%;top:6px;bottom:6px;' +
          'background:linear-gradient(90deg,' + color + '55,' + color + 'aa);' +
          'border:1px solid ' + color + 'cc;border-radius:5px;' +
          'padding:6px 10px;box-sizing:border-box;' +
          'font:12px/1.3 -apple-system,sans-serif;color:rgba(255,255,255,0.92);' +
          'overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
        bar.textContent = (c.id || t.id) + ' · ' + window.__nf_fmt_ms(endMs - beginMs);
        bar.title = t.id + '.' + (c.id || '');
        row.appendChild(bar);
      }});
      lanes.appendChild(row);
    }});
  }}
  console.log('[NF] timeline rendered · ' + tracks.length + ' tracks · duration=' + durationMs + 'ms');
}};

// v1.25: Playhead red line + drag-to-seek.
// - Subscribes to handle.onTimeUpdate(t_ms) (RAF-driven) to update .left
// - Listens for mousedown/mousemove on .tl-lanes · converts x → t_ms via
//   lanes.clientWidth · calls handle.seek(t_ms, {{pause: true}})
// - Drag-release: resume if was playing before the grab
window.__nf_install_playhead = function() {{
  var lanes = document.querySelector('.tl-lanes');
  if (!lanes) return;
  var handle = window.__nf_handle;
  if (!handle) return;
  // Remove any old playhead (re-mount safety).
  var old = document.getElementById('nf-playhead'); if (old) old.remove();

  var ph = document.createElement('div');
  ph.id = 'nf-playhead';
  ph.style.cssText =
    'position:absolute;top:0;bottom:0;width:0;pointer-events:none;z-index:50;' +
    'border-left:2px solid #ef4444;box-shadow:0 0 8px rgba(239,68,68,0.6);' +
    'will-change:left,transform';
  // Playhead head knob (fat hit area for easy dragging).
  var knob = document.createElement('div');
  knob.style.cssText =
    // visual circle (12×12) wrapped in a 32×32 transparent hit pad so the
    // actual drag target is large and forgiving
    'position:absolute;top:-16px;left:-16px;width:32px;height:32px;' +
    'display:flex;align-items:center;justify-content:center;' +
    'pointer-events:auto;cursor:ew-resize;z-index:51;' +
    'background:transparent';
  var knobDot = document.createElement('div');
  knobDot.style.cssText =
    'width:14px;height:14px;background:#ef4444;border-radius:50%;' +
    'box-shadow:0 0 10px rgba(239,68,68,0.9), inset 0 1px 2px rgba(0,0,0,0.25);' +
    'transition:transform .12s';
  knob.appendChild(knobDot);
  ph.appendChild(knob);
  lanes.style.position = lanes.style.position || 'relative';
  lanes.appendChild(ph);

  // Lanes container is the large click/scrub area. ew-resize cursor makes
  // the whole track visually look scrubbable.
  lanes.style.cursor = 'ew-resize';

  var src = window.__NF_SOURCE__ || {{}};
  var durationMs = window.__nf_infer_duration(src) || 60000;

  function tMsToLeft(tMs) {{
    var w = lanes.clientWidth || 1;
    var pct = Math.max(0, Math.min(1, tMs / Math.max(1, durationMs)));
    return (pct * w) + 'px';
  }}
  var _lastLabelTMs = -1;
  function updatePh(tMs) {{
    // translate3d is GPU-composited — avoids layout thrash that `left` triggers.
    ph.style.left = tMsToLeft(tMs);
    // Update the label at most every 100ms to avoid text reflow hammering
    // during drag.
    if (Math.abs(tMs - _lastLabelTMs) > 100) {{
      var timeLabel = document.getElementById('nf-time-label');
      if (timeLabel) timeLabel.textContent = window.__nf_fmt_ms(tMs) + ' / ' + window.__nf_fmt_ms(durationMs);
      _lastLabelTMs = tMs;
    }}
  }}

  // Time label in the timeline header, next to the play button.
  var tlHead = document.querySelector('.tl-head');
  if (tlHead && !document.getElementById('nf-time-label')) {{
    var lab = document.createElement('span');
    lab.id = 'nf-time-label';
    lab.style.cssText = 'margin-left:10px;font:12px/1 "SF Mono",monospace;color:rgba(255,255,255,0.72);min-width:110px;display:inline-block';
    lab.textContent = window.__nf_fmt_ms(0) + ' / ' + window.__nf_fmt_ms(durationMs);
    var btn = document.getElementById('nf-play-pause');
    if (btn && btn.parentElement) btn.parentElement.insertBefore(lab, btn.nextSibling);
    else tlHead.appendChild(lab);
  }}

  // Subscribe to runtime time ticks.
  if (typeof handle.onTimeUpdate === 'function') {{
    handle.onTimeUpdate(function(t_ms) {{ updatePh(t_ms); }});
  }} else {{
    // Fallback: RAF polling via handle.getStateAt if available.
    (function tick(){{
      try {{
        var st = (typeof handle.getStateAt === 'function') ? handle.getStateAt() : null;
        if (st && typeof st.t_ms === 'number') updatePh(st.t_ms);
      }} catch (_e) {{}}
      requestAnimationFrame(tick);
    }})();
  }}
  updatePh(0);

  // ---- Drag-to-seek (v1.29: rAF-throttled, UI-first, GPU-composited) ----
  // Design:
  //   mousedown / mousemove → update _targetTms + _dirty flag (no runtime call)
  //   rAF pump → if _dirty: update ph.left (GPU compositor) + throttled seek
  //   mouseup → final seek + resume play (if was playing)
  // This decouples mouse event frequency from runtime.seek expense — the
  // UI stays at 60fps even if seek() runs at 20-30fps.
  var dragging = false, wasPlaying = false;
  var _targetTms = 0, _dirty = false;
  var _lastSeekMs = 0, _SEEK_THROTTLE_MS = 40;  // ~25 fps runtime seek
  function xToTms(clientX) {{
    var r = lanes.getBoundingClientRect();
    var x = clientX - r.left;
    var pct = Math.max(0, Math.min(1, x / Math.max(1, r.width)));
    return pct * durationMs;
  }}
  function grab(ev) {{
    dragging = true;
    wasPlaying = !!window.__nf_playing;
    // Hard pause — runtime RAF must not race our seek()s.
    try {{ if (wasPlaying && handle.pause) handle.pause(); }} catch(_e){{}}
    window.__nf_playing = false;
    _targetTms = xToTms(ev.clientX);
    _dirty = true;
    knob.style.cursor = 'grabbing';
    knobDot.style.transform = 'scale(1.4)';
    ev.preventDefault();
    // Kick the first seek immediately so click-to-seek doesn't wait for rAF.
    try {{ handle.seek(_targetTms, {{pause: true}}); }} catch(_e){{}}
    updatePh(_targetTms);
    _lastSeekMs = performance.now();
  }}
  function move(ev) {{
    if (!dragging) return;
    _targetTms = xToTms(ev.clientX);
    _dirty = true;
    ev.preventDefault();  // stop text-selection drag-lag
  }}
  function release() {{
    if (!dragging) return;
    dragging = false;
    knob.style.cursor = 'ew-resize';
    knobDot.style.transform = '';
    // Final seek to land precisely at release point.
    try {{ handle.seek(_targetTms, {{pause: !wasPlaying}}); }} catch(_e){{}}
    updatePh(_targetTms);
    if (wasPlaying) {{
      try {{ if (handle.play) handle.play(); }} catch(_e){{}}
      window.__nf_playing = true;
      // Sync play button label icon.
      var pbtn = document.getElementById('nf-play-pause');
      if (pbtn) {{
        var svg = pbtn.querySelector('svg');
        if (svg && svg.outerHTML.indexOf('L9 6') !== -1) {{
          // Currently showing ▶ — flip to ⏸.
          pbtn.innerHTML = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="1" y="1" width="2.5" height="10" rx="0.5"/><rect x="6.5" y="1" width="2.5" height="10" rx="0.5"/></svg><span>暂停</span>';
        }}
      }}
    }}
  }}
  // rAF pump — UI updates every frame, seek throttled to 40ms.
  function pump() {{
    if (_dirty && dragging) {{
      updatePh(_targetTms);
      var now = performance.now();
      if (now - _lastSeekMs >= _SEEK_THROTTLE_MS) {{
        try {{ handle.seek(_targetTms, {{pause: true}}); }} catch(_e){{}}
        _lastSeekMs = now;
      }}
      _dirty = false;
    }}
    requestAnimationFrame(pump);
  }}
  requestAnimationFrame(pump);

  // Events: mousedown on lanes (click anywhere) or knob (drag). move+up bind
  // on document so drag works even if cursor leaves lanes.
  lanes.addEventListener('mousedown', grab);
  knob.addEventListener('mousedown', function(ev) {{ grab(ev); ev.stopPropagation(); }});
  document.addEventListener('mousemove', move, {{ passive: false }});
  document.addEventListener('mouseup', release);
  // Touch support (trackpad / iOS-like) — map to same handlers.
  lanes.addEventListener('touchstart', function(ev) {{
    var t = ev.touches[0]; if (t) grab({{clientX: t.clientX, preventDefault: function(){{}}}});
  }}, {{ passive: true }});
  document.addEventListener('touchmove', function(ev) {{
    var t = ev.touches[0]; if (t) move({{clientX: t.clientX, preventDefault: function(){{}}}});
  }}, {{ passive: true }});
  document.addEventListener('touchend', release);
}};

window.__nf_fmt_ms = function(ms) {{
  if (!isFinite(ms) || ms < 0) return '0s';
  if (ms < 1000) return ms + 'ms';
  var s = ms / 1000;
  if (s < 60) return (s.toFixed(s < 10 ? 1 : 0)) + 's';
  var m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}};

// Naive ms resolver: matches v1.19.1 liteResolve's anchor arithmetic for the
// common cases used in the demos (literal "Ns", "begin"/"end", "anchor.begin + Ns").
window.__nf_resolve_ms = function(expr, src, fallbackMs) {{
  if (typeof expr === 'number') return expr;
  if (typeof expr !== 'string') return fallbackMs;
  var s = expr.trim();
  var mNum = s.match(/^(-?\d+(\.\d+)?)(ms|s|m)?$/);
  if (mNum) {{
    var n = parseFloat(mNum[1]);
    var unit = mNum[3] || 's';
    return unit === 'ms' ? n : (unit === 'm' ? n * 60000 : n * 1000);
  }}
  // anchor.begin / anchor.end / anchor.end - Ns / anchor.begin + Ns
  var mAnchor = s.match(/^(\w+)\.(begin|end)\s*([+\-])?\s*(\d+(\.\d+)?)(ms|s|m)?$/);
  if (mAnchor) {{
    var anchorKey = mAnchor[1], side = mAnchor[2];
    var a = (src.anchors || {{}})[anchorKey];
    var base = 0;
    if (a) {{
      base = window.__nf_resolve_ms(a[side] || (side === 'begin' ? '0' : a.end), src, fallbackMs);
    }} else if (anchorKey === 'demo') {{
      base = side === 'begin' ? 0 : fallbackMs;
    }}
    if (mAnchor[3]) {{
      var delta = parseFloat(mAnchor[4]);
      var unit2 = mAnchor[6] || 's';
      var deltaMs = unit2 === 'ms' ? delta : (unit2 === 'm' ? delta * 60000 : delta * 1000);
      base += (mAnchor[3] === '-' ? -deltaMs : deltaMs);
    }}
    return base;
  }}
  return fallbackMs;
}};

window.__nf_infer_duration = function(src) {{
  // Try to resolve end of the "demo" anchor or first anchor's .end.
  var anchors = src.anchors || {{}};
  var keys = Object.keys(anchors);
  if (!keys.length) return 60000;
  var first = anchors[keys[0]];
  if (!first) return 60000;
  // Resolve anchor.end in ms — treat "demo.begin + 60s" → 60000.
  return window.__nf_resolve_ms(first.end, src, 60000);
}};

// ---- Play / Pause button injected into Timeline header (.tl-head) ----
window.__nf_install_play_button = function() {{
  var tlHead = document.querySelector('.tl-head');
  if (!tlHead || tlHead.querySelector('#nf-play-pause')) return;
  var btn = document.createElement('button');
  btn.id = 'nf-play-pause';
  btn.title = 'Play / Pause (Space)';
  btn.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;margin:0 14px 0 12px;' +
    'padding:6px 14px;background:rgba(167,139,250,0.18);color:#a78bfa;' +
    'border:1px solid rgba(167,139,250,0.32);border-radius:999px;' +
    'font:600 13px/1 -apple-system,"SF Pro",sans-serif;cursor:pointer;' +
    'transition:background .15s';
  btn.onmouseenter = function(){{ btn.style.background = 'rgba(167,139,250,0.28)'; }};
  btn.onmouseleave = function(){{ btn.style.background = 'rgba(167,139,250,0.18)'; }};
  var pauseSvg = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="1" y="1" width="2.5" height="10" rx="0.5"/><rect x="6.5" y="1" width="2.5" height="10" rx="0.5"/></svg>';
  var playSvg  = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><path d="M1 1 L9 6 L1 11 Z"/></svg>';
  function render(){{
    btn.innerHTML = (window.__nf_playing ? (pauseSvg + '<span>暂停</span>') : (playSvg + '<span>播放</span>'));
  }}
  btn.addEventListener('click', function(){{
    if (!window.__nf_handle) return;
    try {{
      if (window.__nf_playing) {{
        window.__nf_handle.pause();
        window.__nf_playing = false;
      }} else {{
        window.__nf_handle.play();
        window.__nf_playing = true;
      }}
      render();
      console.log('[NF] play/pause toggled · playing=' + window.__nf_playing);
    }} catch (e) {{ console.error('[NF] play/pause failed:', e); }}
  }});
  render();
  var tlTitle = tlHead.querySelector('.tl-title');
  if (tlTitle && tlTitle.nextSibling) {{
    tlHead.insertBefore(btn, tlTitle.nextSibling);
  }} else {{
    tlHead.appendChild(btn);
  }}
  if (!window.__nf_spacebar_wired) {{
    window.__nf_spacebar_wired = true;
    document.addEventListener('keydown', function(e){{
      if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) {{
        e.preventDefault();
        btn.click();
      }}
    }});
  }}
}};

// ---- Drag-window: click topbar + non-button → Rust window.drag_window() ----
window.__nf_install_drag_handles = function() {{
  var topbar = document.querySelector('.topbar');
  if (!topbar || topbar.__nf_drag_wired) return;
  topbar.__nf_drag_wired = true;
  topbar.addEventListener('mousedown', function(ev) {{
    // Ignore clicks on interactive descendants so buttons still work.
    var t = ev.target;
    while (t && t !== topbar) {{
      var tag = t.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || t.classList && t.classList.contains('traffic-lights')) return;
      t = t.parentElement;
    }}
    // Also reserve the 80px left gutter for native traffic-lights overlay.
    if (ev.clientX < 80 && ev.clientY < 48) return;
    window.ipc.postMessage(JSON.stringify({{kind:'drag-window'}}));
  }});
}};

if (document.readyState === 'loading') {{
  document.addEventListener('DOMContentLoaded', window.__nf_mount);
}} else {{
  window.__nf_mount();
}}
{verify}
{screenshot}
{verify_media}
"#,
        source = source_str,
        tracks = tracks_str,
        source_path = source_path_str,
        runtime = RUNTIME_IIFE,
        verify = verify_block,
        screenshot = screenshot_block,
        verify_media = verify_media_block,
    )
}

struct CliOpts {
    verify_mode: bool,
    screenshot_path: Option<PathBuf>,
    screenshot_delay_ms: u64,
    export_path: Option<PathBuf>,
    export_duration_s: f64,
    menu_test: bool,
    window_x: f64,
    window_y: f64,
    verify_media_path: Option<PathBuf>,
    source_arg: String,
}

fn parse_cli() -> CliOpts {
    let args: Vec<String> = std::env::args().collect();
    let mut verify_mode = false;
    let mut screenshot_path: Option<PathBuf> = None;
    let mut screenshot_delay_ms: u64 = 2500;
    let mut export_path: Option<PathBuf> = None;
    let mut export_duration_s: f64 = 5.0;
    let mut menu_test = false;
    // Auto-cascade: count sibling nf-shell processes · stagger 40px per window.
    let cascade = count_running_nf_shell_pids();
    let mut window_x: f64 = 120.0 + (cascade as f64) * 40.0;
    let mut window_y: f64 = 80.0 + (cascade as f64) * 40.0;
    let mut verify_media_path: Option<PathBuf> = None;
    let mut positional: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        let a = &args[i];
        match a.as_str() {
            "--verify" => verify_mode = true,
            "--screenshot" => {
                i += 1;
                if i < args.len() {
                    screenshot_path = Some(PathBuf::from(&args[i]));
                }
            }
            "--delay-ms" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<u64>() {
                        screenshot_delay_ms = v;
                    }
                }
            }
            "--export" => {
                i += 1;
                if i < args.len() {
                    export_path = Some(PathBuf::from(&args[i]));
                }
            }
            "--menu-test" => menu_test = true,
            "--x" => {
                i += 1;
                if i < args.len() { if let Ok(v) = args[i].parse::<f64>() { window_x = v; } }
            }
            "--y" => {
                i += 1;
                if i < args.len() { if let Ok(v) = args[i].parse::<f64>() { window_y = v; } }
            }
            "--verify-media" => {
                i += 1;
                if i < args.len() { verify_media_path = Some(PathBuf::from(&args[i])); }
            }
            "--duration" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<f64>() {
                        export_duration_s = v;
                    }
                }
            }
            other if !other.starts_with("--") && positional.is_none() => {
                positional = Some(other.to_string());
            }
            _ => {}
        }
        i += 1;
    }
    CliOpts {
        verify_mode,
        screenshot_path,
        screenshot_delay_ms,
        export_path,
        export_duration_s,
        menu_test,
        window_x,
        window_y,
        verify_media_path,
        source_arg: positional.unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string()),
    }
}

/// Walk tracks[].clips[].params and rewrite any "src" that starts with
/// `file://` to the `nf-asset://x<abs-path>` custom protocol URL.
fn rewrite_file_srcs(v: &mut Value) {
    let Some(tracks) = v.get_mut("tracks").and_then(|t| t.as_array_mut()) else { return; };
    for t in tracks.iter_mut() {
        let Some(clips) = t.get_mut("clips").and_then(|c| c.as_array_mut()) else { continue; };
        for c in clips.iter_mut() {
            let Some(params) = c.get_mut("params") else { continue; };
            if let Some(src) = params.get("src").and_then(|s| s.as_str()) {
                if let Some(abs) = src.strip_prefix("file://") {
                    // nf-asset://x/<abs> where abs already has leading /
                    let new_src = format!("nf-asset://x{abs}");
                    params["src"] = Value::String(new_src);
                }
            }
        }
    }
}

/// Naive percent-decoder — handles the common %20/%2F/%3A cases seen in
/// file paths without pulling in urlencoding as a dep.
fn percent_decode_str(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16)?;
            let lo = (bytes[i + 2] as char).to_digit(16)?;
            out.push(((hi << 4) | lo) as u8);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn guess_mime_from_path(p: &std::path::Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) {
        Some(ref e) if e == "mp4" => "video/mp4",
        Some(ref e) if e == "m4v" => "video/mp4",
        Some(ref e) if e == "mov" => "video/quicktime",
        Some(ref e) if e == "webm" => "video/webm",
        Some(ref e) if e == "mp3" => "audio/mpeg",
        Some(ref e) if e == "m4a" => "audio/mp4",
        Some(ref e) if e == "wav" => "audio/wav",
        Some(ref e) if e == "ogg" => "audio/ogg",
        Some(ref e) if e == "flac" => "audio/flac",
        Some(ref e) if e == "png" => "image/png",
        Some(ref e) if e == "jpg" || e == "jpeg" => "image/jpeg",
        Some(ref e) if e == "webp" => "image/webp",
        Some(ref e) if e == "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Count sibling `nf-shell` processes for auto-cascade window positioning.
/// Falls back to 0 if `pgrep` missing or errors.
fn count_running_nf_shell_pids() -> usize {
    let out = std::process::Command::new("pgrep")
        .args(["-f", "nf-shell"])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let me = std::process::id();
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .filter(|pid| *pid != me)
                .count()
        }
        _ => 0,
    }
}

fn main() -> Result<()> {
    let opts = parse_cli();

    // v1.44 · CLI --export 快捷路径:不启 tao event_loop · 不开窗口 ·
    // 直接用 headless WKWebView + CARenderer (nf-recorder) 产 MP4 · 退出。
    // 一致性靠 ADR-045 t 纯驱动 + viewport 绑 source.json · 跟 preview 像素级一致。
    if let Some(export_path) = opts.export_path.clone() {
        println!(
            "[NF-RECORDER] CLI --export direct mode · source={} · out={} · duration={}s",
            opts.source_arg,
            export_path.display(),
            opts.export_duration_s
        );
        let src_path = PathBuf::from(&opts.source_arg);
        match run_recorder_export(&src_path, &export_path, opts.export_duration_s) {
            Ok(bytes) => {
                println!(
                    "[NF-RECORDER] done · wrote {} bytes → {}",
                    bytes,
                    export_path.display()
                );
                return Ok(());
            }
            Err(e) => {
                eprintln!("[NF-RECORDER] failed · {e}");
                return Err(e);
            }
        }
    }

    let source_text = std::fs::read_to_string(&opts.source_arg)
        .with_context(|| format!("read source.json at {}", opts.source_arg))?;
    let mut source_json: Value =
        serde_json::from_str(&source_text).context("source.json not valid JSON")?;
    // v1.28: rewrite file:// URLs to nf-asset:// so WKWebView will actually
    // load them (WebKit blocks <video src="file:..."> with MEDIA_ERR_SRC_NOT_SUPPORTED).
    rewrite_file_srcs(&mut source_json);
    let tracks_map = build_track_sources(&source_json);
    let n_tracks = tracks_map.len();

    let source_state = Arc::new(Mutex::new(source_json.clone()));

    let init_script = build_init_script(
        &source_json,
        &tracks_map,
        opts.verify_mode,
        opts.screenshot_path.as_ref().map(|_| opts.screenshot_delay_ms),
        &opts.source_arg,
        opts.verify_media_path.is_some(),
    );

    // Inline init into prototype HTML; hand the full document string directly
    // to wry via `.with_html(...)` — avoids the wry-0.45 `file://` + long
    // tmp-dir path URI parse crash.
    let injected_marker = "<!-- __nf_runtime_inject__ -->";
    let injected = format!(
        "<script id=\"__nf_runtime_bootstrap\">\n{init_script}\n</script>\n{injected_marker}\n</body>"
    );
    let full_html = PROTOTYPE_HTML.replacen("</body>", &injected, 1);

    let event_loop: EventLoop<UserEvent> = EventLoopBuilder::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title(WINDOW_TITLE)
        .with_inner_size(LogicalSize::new(WINDOW_W, WINDOW_H))
        .with_position(LogicalPosition::new(opts.window_x, opts.window_y))
        .with_resizable(true)
        .with_min_inner_size(LogicalSize::new(960.0, 600.0))
        .with_title_hidden(true)
        .with_titlebar_transparent(true)
        .with_fullsize_content_view(true)
        .with_has_shadow(true)
        .with_traffic_light_inset(LogicalPosition::new(TITLEBAR_INSET_X, TITLEBAR_INSET_Y))
        .build(&event_loop)
        .context("window build")?;
    window.set_focus();

    let source_state_for_handler = Arc::clone(&source_state);
    let proxy_for_handler = proxy.clone();
    let verify_mode = opts.verify_mode;
    let verify_count = Arc::new(Mutex::new(0u32));
    let verify_count_for_handler = Arc::clone(&verify_count);
    let verify_media_path_for_handler = opts.verify_media_path.clone();

    let webview = WebViewBuilder::new(&window)
        .with_custom_protocol(
            "nf-asset".to_string(),
            move |req| {
                // URL shape: nf-asset://x/ABSOLUTE/PATH/TO/FILE.mp4
                // WKWebView normalises host → lowercase + strips leading slash.
                // We reconstruct the absolute filesystem path from path + query.
                let uri = req.uri().to_string();
                let path_str = uri
                    .strip_prefix("nf-asset://x/")
                    .or_else(|| uri.strip_prefix("nf-asset://x"))
                    .or_else(|| uri.strip_prefix("nf-asset:"))
                    .unwrap_or(&uri);
                let mut path_owned = String::from("/");
                path_owned.push_str(path_str);
                // Strip query fragment if any.
                if let Some(q) = path_owned.find('?') {
                    path_owned.truncate(q);
                }
                let p = std::path::PathBuf::from(percent_decode_str(&path_owned).unwrap_or(path_owned));
                let body = std::fs::read(&p).unwrap_or_default();
                let mime = guess_mime_from_path(&p);
                http::Response::builder()
                    .status(if body.is_empty() { 404 } else { 200 })
                    .header("Content-Type", mime)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-store")
                    .body(std::borrow::Cow::Owned(body))
                    .unwrap_or_else(|_| {
                        http::Response::builder()
                            .status(500)
                            .body(std::borrow::Cow::Owned(Vec::new()))
                            .unwrap_or_else(|_| http::Response::new(std::borrow::Cow::Owned(Vec::new())))
                    })
            },
        )
        .with_html(&full_html)
        .with_devtools(true)
        .with_ipc_handler(move |req| {
            let body: &str = req.body().as_ref();
            let mut state = match source_state_for_handler.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("[NF-IPC] state lock poisoned: {e}");
                    return;
                }
            };
            match dispatch_ipc(&mut state, body) {
                Ok(IpcOutcome::Mutated(msg)) => {
                    println!("[NF-IPC] {msg}");
                    let new_src = state.clone();
                    drop(state);
                    let new_src_str =
                        serde_json::to_string(&new_src).unwrap_or_else(|_| "null".to_string());
                    let js = format!("window.__nf_apply_source({new_src_str});");
                    let _ = proxy_for_handler.send_event(UserEvent::EvalScript(js));
                    if verify_mode {
                        if let Ok(mut c) = verify_count_for_handler.lock() {
                            *c += 1;
                            if *c >= 3 {
                                let _ = proxy_for_handler.send_event(UserEvent::VerifyDone);
                            }
                        }
                    }
                }
                Ok(IpcOutcome::DragWindow) => {
                    let _ = proxy_for_handler.send_event(UserEvent::DragWindow);
                }
                Ok(IpcOutcome::MenuOpen) => {
                    let _ = proxy_for_handler.send_event(UserEvent::MenuOpen);
                }
                Ok(IpcOutcome::MenuSave) => {
                    let _ = proxy_for_handler.send_event(UserEvent::MenuSave);
                }
                Ok(IpcOutcome::StartExport { path, duration_s }) => {
                    let _ = proxy_for_handler.send_event(UserEvent::StartExport {
                        path,
                        duration_s,
                    });
                }
                Ok(IpcOutcome::VerifyMediaReport(json)) => {
                    if let Some(ref p) = verify_media_path_for_handler {
                        let _ = proxy_for_handler.send_event(UserEvent::VerifyMediaReport {
                            path: p.clone(),
                            json,
                        });
                    }
                }
                Err(e) => {
                    println!("[NF-IPC] error: {e}");
                }
            }
        })
        .build()
        .context("webview build")?;

    println!(
        "[NF] window {WINDOW_W}x{WINDOW_H} · titlebar transparent + traffic lights · resizable · source={} · tracks={} · verify={} · screenshot={}",
        opts.source_arg,
        n_tracks,
        opts.verify_mode,
        opts.screenshot_path.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "off".to_string()),
    );

    // Schedule a delayed screenshot via a dedicated thread that fires a
    // UserEvent on the event loop (which has the proxy to talk to the
    // main-thread window).
    if let Some(path) = opts.screenshot_path.clone() {
        let delay = std::time::Duration::from_millis(opts.screenshot_delay_ms);
        let proxy_shot = proxy.clone();
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            let _ = proxy_shot.send_event(UserEvent::ScreenshotNow(path));
        });
    }

    // --menu-test: fire menu-open + menu-save IPC after mount, exit ~3s later.
    if opts.menu_test {
        let proxy_m = proxy.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let _ = proxy_m.send_event(UserEvent::MenuOpen);
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = proxy_m.send_event(UserEvent::MenuSave);
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let _ = proxy_m.send_event(UserEvent::VerifyDone);
        });
    }

    // v1.44 · --export 模式改走 nf-recorder (runtime 驱动 · 脱屏录制) ·
    // 不依赖 tao 窗口可见 · 菜单 IPC 触发时仍走 StartExport 事件 (spawn 自身子进程)。
    // CLI 直接 --export 在 main() 开头已短路退出 (见 fn main 首部) · 这里不再处理。
    let _ = proxy.clone(); // 保留 proxy · 其他事件仍用。

    let window_for_loop = window;
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::EvalScript(js)) => {
                let _ = webview.evaluate_script(&js);
            }
            Event::UserEvent(UserEvent::DragWindow) => {
                let _ = window_for_loop.drag_window();
            }
            Event::UserEvent(UserEvent::ScreenshotNow(path)) => {
                let pos = window_for_loop
                    .outer_position()
                    .map(|p| p.to_logical::<f64>(window_for_loop.scale_factor()))
                    .unwrap_or(LogicalPosition::new(120.0, 80.0));
                let sz = window_for_loop
                    .outer_size()
                    .to_logical::<f64>(window_for_loop.scale_factor());
                match capture_region_png(&path, pos.x, pos.y, sz.width, sz.height) {
                    Ok(n) => println!(
                        "[NF-SHOT] wrote {} ({} bytes · region {}x{} @({},{}))",
                        path.display(),
                        n,
                        sz.width as i64,
                        sz.height as i64,
                        pos.x as i64,
                        pos.y as i64
                    ),
                    Err(e) => eprintln!("[NF-SHOT] failed: {e}"),
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::VerifyDone) => {
                println!("[NF-VERIFY] all IPC mutations applied · exit in 1500ms");
                std::thread::sleep(std::time::Duration::from_millis(1500));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::VerifyMediaReport { path, json }) => {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match std::fs::write(&path, &json) {
                    Ok(_) => println!(
                        "[NF-VERIFY-MEDIA] wrote {} ({} bytes)",
                        path.display(),
                        json.len()
                    ),
                    Err(e) => eprintln!("[NF-VERIFY-MEDIA] write failed: {e}"),
                }
                // exit so caller (cron / ci / dev) gets result and releases port.
                std::thread::sleep(std::time::Duration::from_millis(200));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::StartExport { path, duration_s }) => {
                // v1.44 · 菜单 IPC 触发 · spawn 自身子进程跑 --export · 不阻塞
                // 交互 preview 窗口。子进程在 fn main() 开头的 early-exit 分支里用
                // current_thread tokio 跑 nf_recorder::run_export_from_source。
                println!(
                    "[NF-RECORDER] start · duration={duration_s}s → {}",
                    path.display()
                );
                let self_exe = std::env::current_exe().unwrap_or_default();
                let source_arg = opts.source_arg.clone();
                let path_thread = path.clone();
                let proxy_exp = proxy.clone();
                std::thread::spawn(move || {
                    let status = std::process::Command::new(&self_exe)
                        .arg(&source_arg)
                        .arg("--export")
                        .arg(&path_thread)
                        .arg("--duration")
                        .arg(format!("{duration_s}"))
                        .status();
                    let (ok, msg) = match status {
                        Ok(s) if s.success() => {
                            let bytes = std::fs::metadata(&path_thread)
                                .map(|m| m.len())
                                .unwrap_or(0);
                            (true, format!("wrote {bytes} bytes"))
                        }
                        Ok(s) => (false, format!("child exited {s}")),
                        Err(e) => (false, format!("spawn child: {e}")),
                    };
                    let _ = proxy_exp.send_event(UserEvent::ExportDone {
                        path: path_thread,
                        ok,
                        msg,
                    });
                });
            }
            Event::UserEvent(UserEvent::ExportDone { path, ok, msg }) => {
                if ok {
                    println!("[NF-EXPORT] done · {} · {msg}", path.display());
                } else {
                    eprintln!("[NF-EXPORT] failed · {} · {msg}", path.display());
                }
                // If invoked via CLI --export, exit the app; if invoked via
                // menu IPC, keep running.
                if opts.export_path.is_some() {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(UserEvent::MenuOpen) => {
                println!("[NF-MENU] open dispatched · showing NSOpenPanel");
                // Spawn on a worker thread — rfd blocks until the user picks.
                std::thread::spawn(move || {
                    let picked = rfd::FileDialog::new()
                        .add_filter("NextFrame source", &["json"])
                        .set_title("Open source.json")
                        .pick_file();
                    match picked {
                        Some(p) => println!("[NF-MENU] open selected: {}", p.display()),
                        None => println!("[NF-MENU] open cancelled"),
                    }
                });
            }
            Event::UserEvent(UserEvent::MenuSave) => {
                println!("[NF-MENU] save dispatched · showing NSSavePanel");
                std::thread::spawn(move || {
                    let picked = rfd::FileDialog::new()
                        .add_filter("NextFrame source", &["json"])
                        .set_file_name("source.json")
                        .save_file();
                    match picked {
                        Some(p) => println!("[NF-MENU] save to: {}", p.display()),
                        None => println!("[NF-MENU] save cancelled"),
                    }
                });
            }
            _ => {}
        }
    });
}
