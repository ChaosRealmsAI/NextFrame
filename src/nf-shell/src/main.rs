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

/// Check `ffmpeg` is on PATH. Used for export pre-flight.
fn ffmpeg_available() -> bool {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run `ffmpeg -f avfoundation -framerate 30 -i "2:none" -t <dur> -vf "crop=Wx:H:X:Y"
/// -c:v h264 -pix_fmt yuv420p <out.mp4>` for `duration_s` seconds.
///
/// Screen index 2 matches the device enumeration on this machine (confirmed
/// via the v1.22 POC); we pass it through as-is since avfoundation's index
/// space is system-dependent and the POC validated this exact invocation.
fn run_ffmpeg_export(
    out: &std::path::Path,
    duration_s: f64,
    x: i64,
    y: i64,
    w: i64,
    h: i64,
) -> Result<u64> {
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).context("mkdir parent")?;
    }
    // avfoundation coordinates are in *physical* pixels, so multiply by the
    // retina scale (assume 2x on macOS — HiDPI path will refine this in v1.23).
    let px = x * 2;
    let py = y * 2;
    let pw = w * 2;
    let ph = h * 2;
    let crop = format!("crop={pw}:{ph}:{px}:{py}");
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "avfoundation",
            "-framerate",
            "30",
            "-i",
            "2:none",
            "-t",
            &format!("{duration_s}"),
            "-vf",
            &crop,
            "-c:v",
            "h264",
            "-pix_fmt",
            "yuv420p",
        ])
        .arg(out)
        .status()
        .context("spawn ffmpeg")?;
    if !status.success() {
        anyhow::bail!("ffmpeg exited with {}", status);
    }
    let bytes = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        anyhow::bail!("ffmpeg produced empty file");
    }
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

window.__nf_mount = function() {{
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
    requestAnimationFrame(function(){{
      window.__nf_reflow();
      // v1.24: force boot at t=0 so preview plays from the start of the
      // timeline (earlier we relied on runtime default which wasn't always 0).
      window.__nf_handle = window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: true, startAtMs: 0 }});
      window.__nf_playing = true;
      // Belt-and-suspenders: if the handle exposes seek(), snap to 0.
      try {{ if (window.__nf_handle && typeof window.__nf_handle.seek === 'function') window.__nf_handle.seek(0); }} catch (_e) {{}}
      console.log('[NF] runtime booted · tracks=' + Object.keys(window.__NF_TRACKS__).length + ' · seeked to 0');
      window.__nf_install_drag_handles();
      window.__nf_install_play_button();
      window.__nf_install_source_badge();
      window.__nf_render_timeline();
      window.__nf_install_playhead();
    }});
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
    'border-left:2px solid #ef4444;box-shadow:0 0 8px rgba(239,68,68,0.6)';
  // Playhead head knob (easier to see + drag target).
  var knob = document.createElement('div');
  knob.style.cssText =
    'position:absolute;top:-4px;left:-7px;width:14px;height:14px;' +
    'background:#ef4444;border-radius:50%;box-shadow:0 0 10px rgba(239,68,68,0.8);' +
    'pointer-events:auto;cursor:grab';
  ph.appendChild(knob);
  lanes.style.position = lanes.style.position || 'relative';
  lanes.appendChild(ph);

  // Ensure lanes can receive mouse events (prototype CSS may set pointer-events).
  lanes.style.cursor = 'pointer';

  var src = window.__NF_SOURCE__ || {{}};
  var durationMs = window.__nf_infer_duration(src) || 60000;

  function tMsToLeft(tMs) {{
    var w = lanes.clientWidth || 1;
    var pct = Math.max(0, Math.min(1, tMs / Math.max(1, durationMs)));
    return (pct * w) + 'px';
  }}
  function updatePh(tMs) {{
    ph.style.left = tMsToLeft(tMs);
    var timeLabel = document.getElementById('nf-time-label');
    if (timeLabel) timeLabel.textContent = window.__nf_fmt_ms(tMs) + ' / ' + window.__nf_fmt_ms(durationMs);
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

  // ---- Drag-to-seek ----
  var dragging = false, wasPlaying = false;
  function xToTms(clientX) {{
    var r = lanes.getBoundingClientRect();
    var x = clientX - r.left;
    var pct = Math.max(0, Math.min(1, x / Math.max(1, r.width)));
    return pct * durationMs;
  }}
  function grab(ev) {{
    dragging = true;
    wasPlaying = !!window.__nf_playing;
    if (wasPlaying && handle.pause) {{ try {{ handle.pause(); }} catch(_e){{}} window.__nf_playing = false; }}
    var t = xToTms(ev.clientX);
    try {{ handle.seek(t, {{pause: true}}); }} catch(_e){{}}
    updatePh(t);
    knob.style.cursor = 'grabbing';
    ev.preventDefault();
  }}
  function move(ev) {{
    if (!dragging) return;
    var t = xToTms(ev.clientX);
    try {{ handle.seek(t, {{pause: true}}); }} catch(_e){{}}
    updatePh(t);
  }}
  function release() {{
    if (!dragging) return;
    dragging = false;
    knob.style.cursor = 'grab';
    if (wasPlaying && handle.play) {{ try {{ handle.play(); }} catch(_e){{}} window.__nf_playing = true;
      // Sync play button label.
      var pbtn = document.getElementById('nf-play-pause'); if (pbtn) pbtn.click && setTimeout(function(){{ /* no-op · handle already playing */ }}, 0);
    }}
  }}
  // Click anywhere on lanes to seek (ruler + empty row also trigger).
  lanes.addEventListener('mousedown', grab);
  knob.addEventListener('mousedown', grab);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', release);
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
"#,
        source = source_str,
        tracks = tracks_str,
        source_path = source_path_str,
        runtime = RUNTIME_IIFE,
        verify = verify_block,
        screenshot = screenshot_block,
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
        source_arg: positional.unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string()),
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

    let source_text = std::fs::read_to_string(&opts.source_arg)
        .with_context(|| format!("read source.json at {}", opts.source_arg))?;
    let source_json: Value =
        serde_json::from_str(&source_text).context("source.json not valid JSON")?;
    let tracks_map = build_track_sources(&source_json);
    let n_tracks = tracks_map.len();

    let source_state = Arc::new(Mutex::new(source_json.clone()));

    let init_script = build_init_script(
        &source_json,
        &tracks_map,
        opts.verify_mode,
        opts.screenshot_path.as_ref().map(|_| opts.screenshot_delay_ms),
        &opts.source_arg,
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

    let webview = WebViewBuilder::new(&window)
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

    // If --export was passed, kick off the export right after initial mount.
    if let Some(path) = opts.export_path.clone() {
        if !ffmpeg_available() {
            eprintln!(
                "[NF-EXPORT] ffmpeg not on PATH — install with `brew install ffmpeg` then re-run"
            );
            return Ok(());
        }
        let duration = opts.export_duration_s;
        let proxy_exp = proxy.clone();
        std::thread::spawn(move || {
            // Let the runtime mount + stabilise before recording.
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let _ = proxy_exp.send_event(UserEvent::StartExport {
                path,
                duration_s: duration,
            });
        });
    }

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
            Event::UserEvent(UserEvent::StartExport { path, duration_s }) => {
                let pos = window_for_loop
                    .outer_position()
                    .map(|p| p.to_logical::<f64>(window_for_loop.scale_factor()))
                    .unwrap_or(LogicalPosition::new(120.0, 80.0));
                let sz = window_for_loop
                    .outer_size()
                    .to_logical::<f64>(window_for_loop.scale_factor());
                println!(
                    "[NF-EXPORT] start · duration={duration_s}s · region {}x{} @({},{}) → {}",
                    sz.width as i64,
                    sz.height as i64,
                    pos.x as i64,
                    pos.y as i64,
                    path.display()
                );
                let path_thread = path.clone();
                let proxy_exp = proxy.clone();
                // Run ffmpeg on a worker thread so the event loop keeps pumping.
                std::thread::spawn(move || {
                    let result = run_ffmpeg_export(
                        &path_thread,
                        duration_s,
                        pos.x as i64,
                        pos.y as i64,
                        sz.width as i64,
                        sz.height as i64,
                    );
                    let (ok, msg) = match result {
                        Ok(bytes) => (true, format!("wrote {bytes} bytes")),
                        Err(e) => (false, format!("{e}")),
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
