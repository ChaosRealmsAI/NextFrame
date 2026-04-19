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
//!   `nf-shell --verify-select [source.json]`— run clip-selection + inspector verify
//!   `nf-shell --verify-zoom [source.json]`  — run timeline zoom + scroll verify
//!   `nf-shell --screenshot <out.png> [--delay-ms N] [source.json]`
//!                                            — capture WebView → PNG and exit

mod editor;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use editor::{EditorState, Selection};
use serde_json::{json, Map, Value};
use tao::dpi::{LogicalPosition, LogicalSize, PhysicalPosition};
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

const PROTOTYPE_HTML: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../spec/versions/v1.20/prototype.html"
));
const DESIGN_TOKENS_CSS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../spec/design/tokens.css"
));
const RUNTIME_IIFE: &str = include_str!("../../nf-runtime/dist/runtime-iife.js");
const TRACK_BG: &str = include_str!("../../nf-tracks/official/bg.js");
const TRACK_SCENE: &str = include_str!("../../nf-tracks/official/scene.js");
const TRACK_VIDEO: &str = include_str!("../../nf-tracks/official/video.js");
const TRACK_AUDIO: &str = include_str!("../../nf-tracks/official/audio.js");
const TRACK_CHART: &str = include_str!("../../nf-tracks/official/chart.js");
const TRACK_DATA: &str = include_str!("../../nf-tracks/official/data.js");
const TRACK_SUBTITLE: &str = include_str!("../../nf-tracks/official/subtitle.js");
// v1.41 · L2 community Track · WebGL particles
const TRACK_WEBGL_PARTICLES: &str = include_str!("../../nf-tracks/community/webgl-particles.js");
// v1.46 · scene Hero family (3 L1 community Tracks)
const TRACK_SCENE_HERO_CENTERED: &str =
    include_str!("../../nf-tracks/community/scene-hero-centered.js");
const TRACK_SCENE_HERO_SPLIT: &str = include_str!("../../nf-tracks/community/scene-hero-split.js");
const TRACK_SCENE_HERO_OVERLAY: &str =
    include_str!("../../nf-tracks/community/scene-hero-overlay.js");
// v1.47 · scene Data family (3 L1 community Tracks)
const TRACK_SCENE_STAT_GIANT: &str = include_str!("../../nf-tracks/community/scene-stat-giant.js");
const TRACK_SCENE_METRIC_GRID: &str =
    include_str!("../../nf-tracks/community/scene-metric-grid.js");
const TRACK_SCENE_KPI_CALLOUT: &str =
    include_str!("../../nf-tracks/community/scene-kpi-callout.js");
// v1.48 · scene Narrative family (3 L1 community Tracks)
const TRACK_SCENE_QUOTE: &str = include_str!("../../nf-tracks/community/scene-quote.js");
const TRACK_SCENE_LIST_BULLETS: &str =
    include_str!("../../nf-tracks/community/scene-list-bullets.js");
const TRACK_SCENE_TIMELINE: &str = include_str!("../../nf-tracks/community/scene-timeline.js");
// v1.49 · editor verify-select output paths
const VERIFY_SELECT_JSON_PATH: &str = "spec/versions/v1.49/verify/verify-select.json";
const VERIFY_SELECT_SCREENSHOT_PATH: &str = "tmp/v1.49-verify-select.png";
// v1.50 · timeline zoom verify output paths
const VERIFY_ZOOM_JSON_PATH: &str = "tmp/v1.50-verify.json";
const VERIFY_ZOOM_SCREENSHOT_PATH: &str = "tmp/v1.50-60s-demo-30s-click.png";

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
    VerifyMediaReport {
        path: PathBuf,
        json: String,
    },
    VerifySelectReport {
        payload: Value,
    },
    VerifyZoomReport {
        payload: Value,
    },
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
        "webgl-particles" => Some(TRACK_WEBGL_PARTICLES),
        "scene-hero-centered" => Some(TRACK_SCENE_HERO_CENTERED),
        "scene-hero-split" => Some(TRACK_SCENE_HERO_SPLIT),
        "scene-hero-overlay" => Some(TRACK_SCENE_HERO_OVERLAY),
        "scene-stat-giant" => Some(TRACK_SCENE_STAT_GIANT),
        "scene-metric-grid" => Some(TRACK_SCENE_METRIC_GRID),
        "scene-kpi-callout" => Some(TRACK_SCENE_KPI_CALLOUT),
        "scene-quote" => Some(TRACK_SCENE_QUOTE),
        "scene-list-bullets" => Some(TRACK_SCENE_LIST_BULLETS),
        "scene-timeline" => Some(TRACK_SCENE_TIMELINE),
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

/// FIX-4 (v1.31): clip-drag now mutates the REAL begin/end that runtime
/// resolves, not a fake `_v1_21_drag_offset_*` field that nothing reads.
/// Side effects: keeps `end > begin + 100ms` (min clip length) · clamps to
/// [0, duration_ms] if the source has a top-level anchor that resolves to a
/// known total.
fn apply_clip_drag(source: &mut Value, payload: &Value) -> Result<String> {
    let clip_id = payload
        .get("clipId")
        .and_then(|v| v.as_str())
        .context("clip-drag: clipId missing")?;
    let side = payload
        .get("side")
        .and_then(|v| v.as_str())
        .unwrap_or("right");
    if side != "left" && side != "right" {
        anyhow::bail!("clip-drag: side must be 'left' or 'right', got {side}");
    }
    let delta_ms = payload
        .get("deltaT_ms")
        .and_then(|v| v.as_i64())
        .context("clip-drag: deltaT_ms missing or not int")?;
    let clip = find_clip_mut(source, clip_id)
        .with_context(|| format!("clip-drag: clip not found: {clip_id}"))?;
    // Read current begin/end. Anchor expressions get numericised at this
    // point (lossy — the user opted in by dragging, so we freeze the value).
    let old_begin_ms = clip.get("begin").and_then(ms_from_value).context(
        "clip-drag: clip.begin not numeric (anchor expressions not yet supported in drag edit)",
    )?;
    let old_end_ms = clip.get("end").and_then(ms_from_value).context(
        "clip-drag: clip.end not numeric (anchor expressions not yet supported in drag edit)",
    )?;
    const MIN_LEN_MS: i64 = 100;
    let (new_begin, new_end) = if side == "left" {
        let candidate = (old_begin_ms + delta_ms).max(0);
        let clamped = candidate.min(old_end_ms - MIN_LEN_MS);
        (clamped.max(0), old_end_ms)
    } else {
        let candidate = old_end_ms + delta_ms;
        let clamped = candidate.max(old_begin_ms + MIN_LEN_MS);
        (old_begin_ms, clamped)
    };
    clip["begin"] = Value::from(new_begin);
    clip["end"] = Value::from(new_end);
    Ok(format!(
        "clip-drag applied: {clip_id} {side} {delta_ms:+}ms · {old_begin_ms}→{new_begin} / {old_end_ms}→{new_end}"
    ))
}

/// Accept either a plain number (ms) or a "Ns"/"Nms"/"Nm" literal string.
/// Anchor-expression strings like "demo.begin + 10s" return None — caller
/// must error out so the user knows drag on anchor-bound clips isn't wired
/// yet (documented, not silent).
fn ms_from_value(v: &Value) -> Option<i64> {
    if let Some(n) = v.as_i64() {
        return Some(n);
    }
    if let Some(f) = v.as_f64() {
        return Some(f as i64);
    }
    let s = v.as_str()?.trim();
    // N / Ns / Nms / Nm
    let (num_part, unit) = if let Some(rest) = s.strip_suffix("ms") {
        (rest, "ms")
    } else if let Some(rest) = s.strip_suffix('s') {
        (rest, "s")
    } else if let Some(rest) = s.strip_suffix('m') {
        (rest, "m")
    } else {
        (s, "s")
    };
    let n: f64 = num_part.trim().parse().ok()?;
    Some(match unit {
        "ms" => n as i64,
        "s" => (n * 1000.0) as i64,
        "m" => (n * 60_000.0) as i64,
        _ => n as i64,
    })
}

enum IpcOutcome {
    EvalScript {
        message: Option<String>,
        js: String,
        mutation: bool,
    },
    DragWindow,
    MenuOpen,
    MenuSave,
    StartExport {
        path: PathBuf,
        duration_s: f64,
    },
    VerifyMediaReport(String),
    VerifySelectReport(Value),
    VerifyZoomReport(Value),
}

fn selection_value(selection: &Selection) -> Value {
    json!({
        "kind": selection.kind.clone(),
        "clip_id": selection.clip_id.clone(),
        "track_id": selection.track_id.clone(),
        "multi": selection.multi.clone(),
    })
}

fn editor_state_value(editor: &EditorState) -> Value {
    json!({
        "source": editor.source.clone(),
        "selection": selection_value(&editor.selection),
        "undo_stack_size": editor.undo_stack.len(),
        "redo_stack_size": editor.redo_stack.len(),
        "commit_token": editor.commit_token.clone(),
        "config": {
            "max_undo": editor.config.max_undo,
            "debounce_ms": editor.config.debounce_ms,
            "autosave": editor.config.autosave,
        }
    })
}

fn value_to_js(value: &Value) -> String {
    match serde_json::to_string(value) {
        Ok(serialized) => serialized,
        Err(_) => "null".to_string(),
    }
}

fn editor_js_call(method: &str, payload: &Value) -> String {
    format!(
        "if (window.__nf_editor && typeof window.__nf_editor.{method} === 'function') {{ window.__nf_editor.{method}({}); }}",
        value_to_js(payload)
    )
}

fn pretty_json(value: &Value) -> String {
    match serde_json::to_string_pretty(value) {
        Ok(serialized) => serialized,
        Err(_) => "null".to_string(),
    }
}

fn apply_clip_drag_editor(editor: &mut EditorState, payload: &Value) -> Result<String> {
    let message = apply_clip_drag(&mut editor.source, payload)?;
    editor.redo_stack.clear();
    editor.bump_commit_token();
    Ok(message)
}

fn dispatch_ipc(editor: &mut EditorState, body: &str) -> Result<IpcOutcome> {
    let env: Value = serde_json::from_str(body).context("IPC body not JSON")?;
    let kind = env
        .get("kind")
        .or_else(|| env.get("type"))
        .and_then(|v| v.as_str())
        .context("envelope: kind missing")?;
    let payload = match env.get("payload") {
        Some(value) => value.clone(),
        None => {
            let mut cloned = env.clone();
            if let Some(obj) = cloned.as_object_mut() {
                obj.remove("kind");
                obj.remove("type");
            }
            cloned
        }
    };
    match kind {
        "clip-drag" => {
            let message = apply_clip_drag_editor(editor, &payload)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(message),
                js: editor_js_call("receiveSourceUpdate", &editor_state_value(editor)),
                mutation: true,
            })
        }
        "select-clip" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let selection = editor.select_clip(clip_id.clone());
            let message = match clip_id {
                Some(id) => format!("select-clip applied: {id}"),
                None => "select-clip cleared".to_string(),
            };
            Ok(IpcOutcome::EvalScript {
                message: Some(message),
                js: editor_js_call("receiveSelection", &selection_value(&selection)),
                mutation: false,
            })
        }
        "set-param" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .context("set-param: clip_id missing")?;
            let path = payload
                .get("path")
                .and_then(Value::as_str)
                .context("set-param: path missing")?;
            let value = payload
                .get("value")
                .cloned()
                .context("set-param: value missing")?;
            let _ = editor
                .set_param(clip_id, path, value)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("set-param applied: {clip_id}.{path}")),
                js: editor_js_call("receiveSourceUpdate", &editor_state_value(editor)),
                mutation: true,
            })
        }
        "get-state" => Ok(IpcOutcome::EvalScript {
            message: None,
            js: editor_js_call("receiveState", &editor_state_value(editor)),
            mutation: false,
        }),
        "undo" => {
            let _ = editor.undo();
            Ok(IpcOutcome::EvalScript {
                message: Some("undo processed".to_string()),
                js: editor_js_call("receiveSourceUpdate", &editor_state_value(editor)),
                mutation: true,
            })
        }
        "redo" => {
            let _ = editor.redo();
            Ok(IpcOutcome::EvalScript {
                message: Some("redo processed".to_string()),
                js: editor_js_call("receiveSourceUpdate", &editor_state_value(editor)),
                mutation: true,
            })
        }
        "drag-window" => Ok(IpcOutcome::DragWindow),
        "menu-open" => Ok(IpcOutcome::MenuOpen),
        "menu-save" => Ok(IpcOutcome::MenuSave),
        "verify-media-report" => Ok(IpcOutcome::VerifyMediaReport(pretty_json(&payload))),
        "verify-select-report" => Ok(IpcOutcome::VerifySelectReport(payload)),
        "verify-zoom-report" => Ok(IpcOutcome::VerifyZoomReport(payload)),
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
    parallel: usize,
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
                parallel,
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
    ensure_parent_dir(path)?;
    let region = format!("{},{},{},{}", x as i64, y as i64, w as i64, h as i64);
    let status = std::process::Command::new("screencapture")
        .arg("-x")
        .arg("-R")
        .arg(&region)
        .arg(path)
        .status()
        .context("spawn screencapture")?;
    if status.success() {
        let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if bytes > 0 {
            return Ok(bytes);
        }
    }
    capture_window_png_pyobjc(path)
}

fn capture_window_png_pyobjc(path: &std::path::Path) -> Result<u64> {
    ensure_parent_dir(path)?;
    let owner_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "nf-shell".to_string());
    let script = r#"
import sys
import Quartz
from AppKit import NSBitmapImageRep, NSPNGFileType

out_path, owner_name, window_name = sys.argv[1:4]
window_id = None
windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
for window in windows:
    owner = str(window.get("kCGWindowOwnerName") or "")
    name = str(window.get("kCGWindowName") or "")
    if owner == owner_name and name == window_name:
        window_id = window.get("kCGWindowNumber")
        break
if window_id is None:
    for window in windows:
        name = str(window.get("kCGWindowName") or "")
        if name == window_name:
            window_id = window.get("kCGWindowNumber")
            break
if window_id is None:
    raise SystemExit(2)
image = Quartz.CGWindowListCreateImage(
    Quartz.CGRectNull,
    Quartz.kCGWindowListOptionIncludingWindow,
    window_id,
    Quartz.kCGWindowImageBoundsIgnoreFraming,
)
if image is None:
    raise SystemExit(3)
rep = NSBitmapImageRep.alloc().initWithCGImage_(image)
data = rep.representationUsingType_properties_(NSPNGFileType, None)
if data is None:
    raise SystemExit(4)
if not data.writeToFile_atomically_(out_path, True):
    raise SystemExit(5)
"#;
    let status = std::process::Command::new("python3")
        .arg("-c")
        .arg(script)
        .arg(path)
        .arg(owner_name)
        .arg(WINDOW_TITLE)
        .status()
        .context("spawn python3 pyobjc screenshot fallback")?;
    if !status.success() {
        anyhow::bail!("pyobjc screenshot fallback exited with {}", status);
    }
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        anyhow::bail!("pyobjc screenshot fallback produced empty file");
    }
    Ok(bytes)
}

fn build_init_script(
    source_json: &Value,
    tracks_map: &Map<String, Value>,
    initial_editor_state: &Value,
    verify_mode: bool,
    verify_select_mode: bool,
    screenshot_after_ms: Option<u64>,
    source_path: &str,
    verify_media_mode: bool,
    verify_zoom_mode: bool,
) -> String {
    let source_str = serde_json::to_string(source_json).unwrap_or_else(|_| "{}".to_string());
    let tracks_str = serde_json::to_string(tracks_map).unwrap_or_else(|_| "{}".to_string());
    let initial_editor_state_str =
        serde_json::to_string(initial_editor_state).unwrap_or_else(|_| "null".to_string());
    let design_tokens_str =
        serde_json::to_string(DESIGN_TOKENS_CSS).unwrap_or_else(|_| "\"\"".to_string());
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
    let verify_select_flag = if verify_select_mode { "true" } else { "false" };
    let verify_zoom_flag = if verify_zoom_mode { "true" } else { "false" };
    let timeline_zoom_block = r#"
window.__nfTimeline = window.__nfTimeline || { zoom: 1.0, scroll_ms: 0, min_zoom: 0.2, max_zoom: 10.0 };
window.__nf_timeline_clamp = function(value, min, max) {
  if (!isFinite(value)) value = min;
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = min;
  if (max < min) max = min;
  return Math.max(min, Math.min(max, value));
};
window.__nf_timeline_state = function() {
  var state = window.__nfTimeline || {};
  if (!isFinite(state.zoom)) state.zoom = 1.0;
  if (!isFinite(state.scroll_ms)) state.scroll_ms = 0;
  if (!isFinite(state.min_zoom)) state.min_zoom = 0.2;
  if (!isFinite(state.max_zoom)) state.max_zoom = 10.0;
  window.__nfTimeline = state;
  return state;
};
window.__nf_timeline_lanes = function() {
  return document.querySelector('.tl-lanes');
};
window.__nf_timeline_duration_ms = function(lanes) {
  var dur = lanes ? parseFloat(lanes.dataset.nfDurationMs || '0') : 0;
  if (!(dur > 0)) {
    var src = window.__NF_SOURCE__ || {};
    dur = (typeof src.duration_ms === 'number' && src.duration_ms > 0)
      ? src.duration_ms
      : (window.__nf_infer_duration(src) || 60000);
  }
  return dur > 0 ? dur : 60000;
};
window.__nf_timeline_px_per_second = function(lanes, durationMs) {
  var dur = durationMs || window.__nf_timeline_duration_ms(lanes);
  var laneWidth = lanes && lanes.clientWidth ? lanes.clientWidth : 0;
  if (!(laneWidth > 0) || !(dur > 0)) return 20;
  return Math.max(20, laneWidth / Math.max(1, dur / 1000));
};
window.__nf_timeline_bar_width_px = function(beginMs, endMs, lanes, durationMs) {
  var state = window.__nf_timeline_state();
  var pxPerSecond = window.__nf_timeline_px_per_second(lanes, durationMs);
  return Math.max(2, ((endMs - beginMs) / 1000) * pxPerSecond * state.zoom);
};
window.__nf_timeline_view_ms = function(lanes, durationMs) {
  var state = window.__nf_timeline_state();
  var laneWidth = lanes && lanes.clientWidth ? lanes.clientWidth : 0;
  var pxPerSecond = window.__nf_timeline_px_per_second(lanes, durationMs);
  if (!(laneWidth > 0) || !(pxPerSecond > 0) || !(state.zoom > 0)) return durationMs || 60000;
  return (laneWidth / (pxPerSecond * state.zoom)) * 1000;
};
window.__nf_timeline_max_scroll_ms = function(lanes, durationMs) {
  var dur = durationMs || window.__nf_timeline_duration_ms(lanes);
  return Math.max(0, dur - Math.max(0, window.__nf_timeline_view_ms(lanes, dur)));
};
window.__nf_timeline_clamp_scroll = function(scrollMs, lanes, durationMs) {
  var dur = durationMs || window.__nf_timeline_duration_ms(lanes);
  return window.__nf_timeline_clamp(scrollMs, 0, window.__nf_timeline_max_scroll_ms(lanes, dur));
};
window.__nf_timeline_ms_to_px = function(ms, lanes, durationMs) {
  var state = window.__nf_timeline_state();
  var pxPerSecond = window.__nf_timeline_px_per_second(lanes, durationMs);
  return ((ms - state.scroll_ms) / 1000) * pxPerSecond * state.zoom;
};
window.__nf_timeline_px_to_ms = function(px, lanes, durationMs) {
  var state = window.__nf_timeline_state();
  var pxPerSecond = window.__nf_timeline_px_per_second(lanes, durationMs);
  if (!(pxPerSecond > 0) || !(state.zoom > 0)) return state.scroll_ms;
  return state.scroll_ms + (px / (pxPerSecond * state.zoom)) * 1000;
};
window.__nf_timeline_snapshot = function() {
  var lanes = window.__nf_timeline_lanes();
  var durationMs = window.__nf_timeline_duration_ms(lanes);
  var state = window.__nf_timeline_state();
  var snapshot = {
    zoom: Number(state.zoom.toFixed(4)),
    scroll_ms: Math.round(state.scroll_ms),
    min_zoom: state.min_zoom,
    max_zoom: state.max_zoom,
    duration_ms: Math.round(durationMs),
    px_per_second: Number(window.__nf_timeline_px_per_second(lanes, durationMs).toFixed(4))
  };
  if (lanes) snapshot.lanes_width_px = lanes.clientWidth || 0;
  return snapshot;
};
window.__nf_timeline_find_bar_at_ms = function(ms) {
  var bars = document.querySelectorAll('.nf-tl-bar');
  for (var i = 0; i < bars.length; i++) {
    var beginMs = parseFloat(bars[i].dataset.nfBeginMs || '0');
    var endMs = parseFloat(bars[i].dataset.nfEndMs || '0');
    if (ms >= beginMs && ms < endMs) return bars[i];
  }
  return bars.length ? bars[bars.length - 1] : null;
};
window.__nf_ensure_timeline_zoom_style = function() {
  if (document.getElementById('nf-timeline-zoom-style')) return;
  var style = document.createElement('style');
  style.id = 'nf-timeline-zoom-style';
  style.textContent = '.tl-zoom .z-bar::before{width:var(--nf-zoom-pct,42%)!important;}';
  document.head.appendChild(style);
};
window.__nf_update_timeline_meta = function() {
  var state = window.__nf_timeline_state();
  var timeline = document.querySelector('.timeline');
  if (timeline) {
    timeline.dataset.zoom = state.zoom.toFixed(2);
    timeline.dataset.scrollMs = String(Math.round(state.scroll_ms));
  }
  window.__nf_ensure_timeline_zoom_style();
  var zoomEl = document.querySelector('.tl-zoom');
  if (!zoomEl) return;
  var zoomBar = zoomEl.querySelector('.z-bar');
  if (zoomBar) {
    var denom = Math.max(0.0001, state.max_zoom - state.min_zoom);
    var pct = ((state.zoom - state.min_zoom) / denom) * 100;
    zoomBar.style.setProperty('--nf-zoom-pct', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
  }
  for (var n = zoomEl.childNodes.length - 1; n >= 0; n--) {
    if (zoomEl.childNodes[n].nodeType === 3) zoomEl.removeChild(zoomEl.childNodes[n]);
  }
  var label = zoomEl.querySelector('.nf-zoom-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'nf-zoom-label';
    zoomEl.appendChild(label);
  }
  label.textContent = Math.round(state.zoom * 100) + '%';
};
window.__nf_set_timeline_zoom = function(nextZoom, anchorPx, lanes) {
  var targetLanes = lanes || window.__nf_timeline_lanes();
  var durationMs = window.__nf_timeline_duration_ms(targetLanes);
  var state = window.__nf_timeline_state();
  var clampedZoom = window.__nf_timeline_clamp(nextZoom, state.min_zoom, state.max_zoom);
  if (!(targetLanes && targetLanes.clientWidth)) {
    state.zoom = clampedZoom;
    state.scroll_ms = window.__nf_timeline_clamp_scroll(state.scroll_ms, targetLanes, durationMs);
    window.__nf_update_timeline_meta();
    return window.__nf_timeline_snapshot();
  }
  var localX = isFinite(anchorPx) ? anchorPx : (targetLanes.clientWidth / 2);
  localX = window.__nf_timeline_clamp(localX, 0, targetLanes.clientWidth || 0);
  var anchorMs = window.__nf_timeline_px_to_ms(localX, targetLanes, durationMs);
  state.zoom = clampedZoom;
  state.scroll_ms = anchorMs - (localX / (window.__nf_timeline_px_per_second(targetLanes, durationMs) * state.zoom)) * 1000;
  state.scroll_ms = window.__nf_timeline_clamp_scroll(state.scroll_ms, targetLanes, durationMs);
  window.__nf_reflow_timeline();
  return window.__nf_timeline_snapshot();
};
window.__nf_timeline_zoom_by = function(factor, anchorPx, lanes) {
  var state = window.__nf_timeline_state();
  return window.__nf_set_timeline_zoom(state.zoom * factor, anchorPx, lanes);
};
window.__nf_scroll_timeline = function(deltaMs, lanes) {
  var targetLanes = lanes || window.__nf_timeline_lanes();
  var durationMs = window.__nf_timeline_duration_ms(targetLanes);
  var state = window.__nf_timeline_state();
  state.scroll_ms = window.__nf_timeline_clamp_scroll(state.scroll_ms + deltaMs, targetLanes, durationMs);
  window.__nf_reflow_timeline();
  return window.__nf_timeline_snapshot();
};
window.__nf_install_timeline_wheel = function() {
  var timeline = document.querySelector('.timeline');
  if (!timeline || timeline.__nf_timeline_wheel_wired) return;
  timeline.__nf_timeline_wheel_wired = true;
  timeline.addEventListener('wheel', function(e) {
    var lanes = window.__nf_timeline_lanes();
    if (!lanes) return;
    var rect = lanes.getBoundingClientRect();
    var localX = e.clientX - rect.left;
    if (e.metaKey) {
      e.preventDefault();
      window.__nf_timeline_zoom_by(e.deltaY < 0 ? 1.1 : 0.9, localX, lanes);
    } else if (e.shiftKey) {
      e.preventDefault();
      window.__nf_scroll_timeline(e.deltaY * 10, lanes);
    }
  }, { passive: false });
};
"#
    .to_string();
    let control_surface_block = format!(
        r#"
window.__NF_VERIFY_ZOOM__ = {verify_zoom};
window.nfEditor = window.nfEditor || {{}};
window.nfEditor.zoom = function(factor) {{
  return window.__nf_timeline_zoom_by ? window.__nf_timeline_zoom_by(factor) : null;
}};
window.nfEditor.zoomTo = function(zoom, anchorPx) {{
  return window.__nf_set_timeline_zoom ? window.__nf_set_timeline_zoom(zoom, anchorPx) : null;
}};
window.nfEditor.scroll = function(deltaMs) {{
  return window.__nf_scroll_timeline ? window.__nf_scroll_timeline(deltaMs) : null;
}};
window.nfEditor.timelineState = function() {{
  return window.__nf_timeline_snapshot ? window.__nf_timeline_snapshot() : null;
}};
"#,
        verify_zoom = verify_zoom_flag,
    );
    let verify_zoom_block = if verify_zoom_mode {
        r#"
(function() {
  if (!window.__NF_VERIFY_ZOOM__) return;
  function sleep(ms) {
    return new Promise(function(resolve) { window.setTimeout(resolve, ms); });
  }
  function wheel(target, init) {
    target.dispatchEvent(new WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true }, init)));
  }
  async function waitForTimeline() {
    var deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      var timeline = document.querySelector('.timeline');
      var lanes = document.querySelector('.tl-lanes');
      var bars = document.querySelectorAll('.nf-tl-bar');
      if (timeline && lanes && bars.length) return { timeline: timeline, lanes: lanes };
      await sleep(150);
    }
    return null;
  }
  async function run() {
    try {
      var ready = await waitForTimeline();
      if (!ready) {
        window.ipc.postMessage(JSON.stringify({kind:'verify-zoom-report', payload:{ ok:false, error:'timeline not ready' }}));
        return;
      }
      var timeline = ready.timeline;
      var lanes = ready.lanes;
      var lanesRect = lanes.getBoundingClientRect();
      var anchorClientX = lanesRect.left + Math.max(8, Math.min(lanesRect.width - 8, lanesRect.width * 0.55));
      var anchorLocalX = anchorClientX - lanesRect.left;
      var anchorClientY = lanesRect.top + 12;
      if (window.nfEditor && typeof window.nfEditor.zoomTo === 'function') window.nfEditor.zoomTo(1.0, anchorLocalX);
      if (window.nfEditor && typeof window.nfEditor.scroll === 'function') window.nfEditor.scroll(-1e9);
      await sleep(160);

      for (var i = 0; i < 5; i++) {
        wheel(timeline, { deltaY: -100, metaKey: true, clientX: anchorClientX, clientY: anchorClientY });
      }
      await sleep(160);
      var afterZoom = window.nfEditor.timelineState();
      var vp1Zoom = afterZoom && typeof afterZoom.zoom === 'number' ? afterZoom.zoom : 0;
      var vp1Pass = vp1Zoom >= 1.60;

      if (window.nfEditor && typeof window.nfEditor.scroll === 'function') window.nfEditor.scroll(-1e9);
      await sleep(120);
      for (var j = 0; j < 10; j++) {
        wheel(timeline, { deltaY: 150, shiftKey: true, clientX: anchorClientX, clientY: anchorClientY });
      }
      await sleep(160);
      var afterScroll = window.nfEditor.timelineState();
      var scrollMs = afterScroll && typeof afterScroll.scroll_ms === 'number' ? afterScroll.scroll_ms : 0;
      var vp4Pass = Math.abs(scrollMs - 15000) <= 250;

      var targetMs = 30500;
      var targetBar = window.__nf_timeline_find_bar_at_ms(targetMs);
      var targetX = window.__nf_timeline_ms_to_px(targetMs, lanes, afterScroll && afterScroll.duration_ms);
      var targetBarRect = targetBar ? targetBar.getBoundingClientRect() : null;
      var geometryHit = !!(targetBarRect && (lanesRect.left + targetX) >= targetBarRect.left - 1 && (lanesRect.left + targetX) <= targetBarRect.right + 1);
      if (targetBar) {
        targetBar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: lanesRect.left + targetX, clientY: targetBarRect.top + Math.max(6, targetBarRect.height / 2) }));
        targetBar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: lanesRect.left + targetX, clientY: targetBarRect.top + Math.max(6, targetBarRect.height / 2) }));
      }
      await sleep(360);
      var selectedClipId = window.__nf_editor && window.__nf_editor.state && window.__nf_editor.state.selection
        ? window.__nf_editor.state.selection.clip_id || null
        : null;
      var vp2Pass = geometryHit && selectedClipId === 'clip-30s';

      if (window.__nf_handle && typeof window.__nf_handle.seek === 'function') {
        try { window.__nf_handle.seek(30000, { pause: true }); } catch (_err) {}
      }
      await sleep(260);
      var playhead = document.getElementById('nf-playhead');
      var playheadActual = playhead ? parseFloat(playhead.style.left || '0') : NaN;
      var playheadExpected = window.__nf_timeline_ms_to_px(30000, lanes, afterScroll && afterScroll.duration_ms);
      var playheadOffset = Math.abs((isFinite(playheadActual) ? playheadActual : 0) - playheadExpected);
      var vp3Pass = playheadOffset <= 2;

      var factorToMax = vp1Zoom > 0 ? (10 / vp1Zoom) : 10;
      if (window.nfEditor && typeof window.nfEditor.zoom === 'function') window.nfEditor.zoom(factorToMax);
      await sleep(160);
      var afterMaxZoom = window.nfEditor.timelineState();
      var highZoomBar = window.__nf_timeline_find_bar_at_ms(targetMs);
      var barWidth = highZoomBar ? parseFloat(highZoomBar.style.width || '0') : 0;
      var vp5Pass = barWidth >= 200;

      var report = {
        cmd_wheel_5_times: { final_zoom: Number(vp1Zoom.toFixed(2)), pass: vp1Pass },
        click_at_30s: {
          target_ms: targetMs,
          target_x_px: Number(targetX.toFixed(2)),
          selected_clip_id: selectedClipId,
          pass: vp2Pass
        },
        playhead_offset_px: Number(playheadOffset.toFixed(2)),
        shift_wheel_scroll: { scroll_ms: Math.round(scrollMs), pass: vp4Pass },
        high_zoom_bar_width: {
          zoom: afterMaxZoom && typeof afterMaxZoom.zoom === 'number' ? Number(afterMaxZoom.zoom.toFixed(2)) : 0,
          bar_width_px: Number(barWidth.toFixed(2)),
          pass: vp5Pass
        },
        ok: vp1Pass && vp2Pass && vp3Pass && vp4Pass && vp5Pass
      };
      window.ipc.postMessage(JSON.stringify({kind:'verify-zoom-report', payload: report}));
    } catch (err) {
      window.ipc.postMessage(JSON.stringify({
        kind:'verify-zoom-report',
        payload:{ ok:false, error:String(err && err.stack || err) }
      }));
    }
  }
  window.setTimeout(run, 2200);
})();
"#
        .to_string()
    } else {
        String::new()
    };
    let editor_ui_block = format!(
        r#"
window.__NF_EDITOR_INITIAL_STATE__ = {initial_state};
window.__NF_COMMIT_TOKEN__ = (window.__NF_EDITOR_INITIAL_STATE__ && window.__NF_EDITOR_INITIAL_STATE__.commit_token) || null;
window.__NF_VERIFY_SELECT__ = {verify_select};
(function() {{
  var TOKENS_CSS = {tokens_css};
  function esc(value) {{
    return String(value == null ? '' : value).replace(/[&<>"]/g, function(ch) {{
      return ch === '&' ? '&amp;' : (ch === '<' ? '&lt;' : (ch === '>' ? '&gt;' : '&quot;'));
    }});
  }}
  function ensureStyle() {{
    if (document.getElementById('nf-editor-style')) return;
    var style = document.createElement('style');
    style.id = 'nf-editor-style';
    style.textContent = TOKENS_CSS + '\n' +
      ':root{{--token-bg:var(--color-bg,#050507);--token-panel:rgba(7,10,18,0.78);--token-panel-soft:rgba(255,255,255,0.04);--token-accent:var(--color-accent,#a78bfa);--token-accent-strong:var(--color-accent-strong,#8b5cf6);--token-border:rgba(255,255,255,0.10);--token-text:var(--text-100,rgba(255,255,255,0.96));--token-text-soft:var(--text-60,rgba(255,255,255,0.60));--token-warm:var(--color-warm,#f97316);}}' +
      '/* v1.46 · inspector overlay 右侧 · 独立 z-index · 不干扰 prototype 内部 flex */' +
      '#nf-inspector-panel{{position:fixed;top:56px;right:8px;bottom:8px;width:280px;display:flex;flex-direction:column;overflow:hidden;background:var(--token-panel);border:1px solid var(--token-border);border-radius:12px;backdrop-filter:blur(18px);z-index:500;box-shadow:0 24px 60px rgba(0,0,0,0.45);}}' +
      '#nf-inspector-panel .g-body{{display:flex;flex-direction:column;height:100%;min-height:0;}}' +
      '.nf-inspector-head{{padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:6px;}}' +
      '.nf-inspector-kicker{{font:600 10px/1.2 var(--font-mono,"SF Mono",monospace);letter-spacing:0.08em;text-transform:uppercase;color:var(--token-accent);}}' +
      '#nf-inspector-title{{font:600 16px/1.2 var(--font-sans,-apple-system,sans-serif);color:var(--token-text);}}' +
      '#nf-inspector-meta{{font:500 11px/1.4 var(--font-mono,"SF Mono",monospace);color:var(--token-text-soft);}}' +
      '#nf-inspector-body{{padding:14px 14px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px;min-height:0;background:linear-gradient(180deg,rgba(255,255,255,0.02),transparent);}}' +
      '.nf-inspector-empty{{padding:14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.10);font:500 12px/1.5 var(--font-sans,-apple-system,sans-serif);color:var(--token-text-soft);}}' +
      '.nf-inspector-field{{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;background:var(--token-panel-soft);border:1px solid rgba(255,255,255,0.06);}}' +
      '.nf-inspector-label{{font:600 11px/1.2 var(--font-mono,"SF Mono",monospace);letter-spacing:0.04em;text-transform:uppercase;color:var(--token-text-soft);}}' +
      '.nf-inspector-field input[type="text"],.nf-inspector-field input[type="number"],.nf-inspector-field input[type="color"],.nf-inspector-field textarea{{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:rgba(10,13,22,0.88);color:var(--token-text);padding:9px 10px;font:500 13px/1.45 var(--font-sans,-apple-system,sans-serif);outline:none;}}' +
      '.nf-inspector-field textarea{{min-height:96px;resize:vertical;font-family:var(--font-mono,"SF Mono",monospace);font-size:12px;}}' +
      '.nf-inspector-field input[type="color"]{{padding:4px;height:42px;}}' +
      '.nf-inspector-field input:focus,.nf-inspector-field textarea:focus{{border-color:rgba(167,139,250,0.55);box-shadow:0 0 0 1px rgba(167,139,250,0.24),0 0 14px rgba(167,139,250,0.18);}}' +
      '.nf-inspector-bool{{display:flex;align-items:center;justify-content:space-between;gap:12px;}}' +
      '.nf-inspector-bool input{{width:18px;height:18px;accent-color:var(--token-accent);}}' +
      '.nf-tl-bar{{transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease;cursor:pointer;}}' +
      '.nf-tl-bar.selected{{border:2px solid var(--token-accent)!important;box-shadow:0 0 0 1px rgba(167,139,250,0.24),0 0 18px rgba(167,139,250,0.20);transform:translateY(-1px);}}' +
      '@media (max-width: 1120px){{#nf-inspector-panel{{width:232px;top:52px;right:4px;bottom:4px;}}}}';
    document.head.appendChild(style);
  }}

  window.__nf_editor = window.__nf_editor || {{}};
  var api = window.__nf_editor;
  api.state = window.__NF_EDITOR_INITIAL_STATE__ || null;
  api.pending = api.pending || {{}};
  api.last_applied_token = (api.state && api.state.commit_token) || null;
  api.verify_select_started = false;

  api.clipIdentity = function(clip) {{
    if (!clip || typeof clip !== 'object') return '';
    if (clip.id) return String(clip.id);
    if (clip.begin) return String(clip.begin);
    return '';
  }};

  api.send = function(kind, payload) {{
    window.ipc.postMessage(JSON.stringify({{ kind: kind, payload: payload || {{}} }}));
  }};

  api.ensureShellLayout = function() {{
    ensureStyle();
    document.body.classList.add('nf-editor-open');
    if (document.getElementById('nf-inspector-panel')) return;
    var inspector = document.createElement('div');
    inspector.id = 'nf-inspector-panel';
    inspector.className = 'glass';
    inspector.innerHTML =
      '<div class="g-body">' +
        '<div class="nf-inspector-head">' +
          '<span class="nf-inspector-kicker">Inspector</span>' +
          '<div id="nf-inspector-title">Clip: none</div>' +
          '<div id="nf-inspector-meta">Select a clip in the timeline.</div>' +
        '</div>' +
        '<div id="nf-inspector-body"></div>' +
      '</div>';
    document.body.appendChild(inspector);
  }};

  api.selectedClip = function() {{
    var state = api.state;
    if (!state || !state.source || !state.selection || state.selection.kind !== 'clip' || !state.selection.clip_id) return null;
    var tracks = Array.isArray(state.source.tracks) ? state.source.tracks : [];
    for (var ti = 0; ti < tracks.length; ti++) {{
      var track = tracks[ti] || {{}};
      var clips = Array.isArray(track.clips) ? track.clips : [];
      for (var ci = 0; ci < clips.length; ci++) {{
        var clip = clips[ci] || {{}};
        if (api.clipIdentity(clip) === state.selection.clip_id) {{
          return {{ track: track, clip: clip, track_idx: ti, clip_idx: ci }};
        }}
      }}
    }}
    return null;
  }};

  api.fieldKind = function(value) {{
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string' && /^#([0-9a-fA-F]{{3}}|[0-9a-fA-F]{{6}})$/.test(value)) return 'color';
    if (value && typeof value === 'object') return 'json';
    return 'text';
  }};

  api.readFieldValue = function(el, kind) {{
    if (!el) return undefined;
    if (kind === 'boolean') return !!el.checked;
    if (kind === 'number') {{
      if (el.value === '') return 0;
      var num = Number(el.value);
      return isFinite(num) ? num : undefined;
    }}
    if (kind === 'json') {{
      try {{
        el.dataset.invalid = '0';
        return JSON.parse(el.value);
      }} catch (_err) {{
        el.dataset.invalid = '1';
        return undefined;
      }}
    }}
    return el.value;
  }};

  api.scheduleCommit = function(clipId, path, value) {{
    var delay = (api.state && api.state.config && api.state.config.debounce_ms) || 300;
    var key = clipId + '::' + path;
    if (api.pending[key]) window.clearTimeout(api.pending[key]);
    api.pending[key] = window.setTimeout(function() {{
      delete api.pending[key];
      api.send('set-param', {{ clip_id: clipId, path: path, value: value }});
    }}, delay);
  }};

  api.bindField = function(el) {{
    if (!el || el.__nf_editor_wired) return;
    el.__nf_editor_wired = true;
    var eventName = el.dataset.nfKind === 'boolean' ? 'change' : 'input';
    el.addEventListener(eventName, function() {{
      var selected = api.selectedClip();
      if (!selected) return;
      var value = api.readFieldValue(el, el.dataset.nfKind || 'text');
      if (typeof value === 'undefined') return;
      api.scheduleCommit(api.clipIdentity(selected.clip), el.dataset.nfPath || '', value);
    }});
  }};

  api.renderInspector = function() {{
    api.ensureShellLayout();
    var titleEl = document.getElementById('nf-inspector-title');
    var metaEl = document.getElementById('nf-inspector-meta');
    var body = document.getElementById('nf-inspector-body');
    if (!titleEl || !metaEl || !body) return;
    var selected = api.selectedClip();
    if (!selected) {{
      titleEl.textContent = 'Clip: none';
      metaEl.textContent = 'Select a clip in the timeline.';
      body.innerHTML = '<div class="nf-inspector-empty">No clip selected.</div>';
      return;
    }}
    var clip = selected.clip || {{}};
    var params = clip.params || {{}};
    var clipTitle = params.title || clip.id || selected.track.id || 'clip';
    titleEl.textContent = 'Clip: ' + clipTitle;
    metaEl.textContent = String(selected.track.id || 'track') + ' · ' + String(api.clipIdentity(clip) || 'clip') + ' · undo ' + String((api.state && api.state.undo_stack_size) || 0);
    var keys = Object.keys(params);
    if (!keys.length) {{
      body.innerHTML = '<div class="nf-inspector-empty">Clip has no params.</div>';
      return;
    }}
    var html = '';
    for (var i = 0; i < keys.length; i++) {{
      var key = keys[i];
      var value = params[key];
      var kind = api.fieldKind(value);
      if (kind === 'boolean') {{
        html += '<label class="nf-inspector-field nf-inspector-bool" data-nf-inspector-field="1">' +
          '<span><span class="nf-inspector-label">' + esc(key) + '</span></span>' +
          '<input data-nf-kind="boolean" data-nf-path="' + esc(key) + '" type="checkbox"' + (value ? ' checked' : '') + ' />' +
        '</label>';
      }} else if (kind === 'json') {{
        html += '<label class="nf-inspector-field" data-nf-inspector-field="1">' +
          '<span class="nf-inspector-label">' + esc(key) + '</span>' +
          '<textarea data-nf-kind="json" data-nf-path="' + esc(key) + '">' + esc(JSON.stringify(value, null, 2)) + '</textarea>' +
        '</label>';
      }} else {{
        var inputType = kind === 'number' ? 'number' : (kind === 'color' ? 'color' : 'text');
        var inputValue = kind === 'number' ? String(value) : String(value == null ? '' : value);
        html += '<label class="nf-inspector-field" data-nf-inspector-field="1">' +
          '<span class="nf-inspector-label">' + esc(key) + '</span>' +
          '<input data-nf-kind="' + esc(kind) + '" data-nf-path="' + esc(key) + '" type="' + inputType + '" value="' + esc(inputValue) + '" />' +
        '</label>';
      }}
    }}
    body.innerHTML = html;
    var fields = body.querySelectorAll('[data-nf-path]');
    for (var fi = 0; fi < fields.length; fi++) api.bindField(fields[fi]);
  }};

  api.applySelection = function() {{
    var selectedId = api.state && api.state.selection ? api.state.selection.clip_id : null;
    var bars = document.querySelectorAll('.nf-tl-bar');
    for (var i = 0; i < bars.length; i++) {{
      var active = !!selectedId && bars[i].dataset.clipId === selectedId;
      bars[i].classList.toggle('selected', active);
    }}
  }};

  api.decorateTimeline = function() {{
    var state = api.state;
    var source = state && state.source ? state.source : window.__NF_SOURCE__;
    var tracks = source && Array.isArray(source.tracks) ? source.tracks : [];
    var bars = document.querySelectorAll('.nf-tl-bar');
    var cursor = 0;
    for (var ti = 0; ti < tracks.length; ti++) {{
      var track = tracks[ti] || {{}};
      var clips = Array.isArray(track.clips) ? track.clips : [];
      for (var ci = 0; ci < clips.length; ci++) {{
        var clip = clips[ci] || {{}};
        var bar = bars[cursor++];
        if (!bar) continue;
        bar.dataset.clipId = api.clipIdentity(clip);
        bar.dataset.trackIdx = String(ti);
        bar.dataset.trackId = String(track.id || '');
        if (!bar.__nf_select_wired) {{
          bar.__nf_select_wired = true;
          bar.addEventListener('mousedown', function(ev) {{
            ev.preventDefault();
            ev.stopPropagation();
          }});
          bar.addEventListener('click', function(ev) {{
            ev.preventDefault();
            ev.stopPropagation();
            api.send('select-clip', {{ clip_id: this.dataset.clipId || null }});
          }});
        }}
      }}
    }}
    api.applySelection();
  }};

  api.requestState = function() {{
    api.send('get-state', {{}});
  }};

  api.receiveState = function(state) {{
    if (!state) return;
    api.state = state;
    api.last_applied_token = state.commit_token || null;
    if (state.source) window.__NF_SOURCE__ = state.source;
    if (state.commit_token) window.__NF_COMMIT_TOKEN__ = state.commit_token;
    api.renderInspector();
    api.decorateTimeline();
  }};

  api.receiveSelection = function(selection) {{
    api.state = api.state || {{}};
    api.state.selection = selection || {{ kind: 'none', clip_id: null, track_id: null, multi: [] }};
    api.applySelection();
    api.renderInspector();
  }};

  api.receiveSourceUpdate = function(state) {{
    if (!state) return;
    if (state.commit_token && api.last_applied_token === state.commit_token) {{
      api.state = state;
      api.applySelection();
      api.renderInspector();
      return;
    }}
    api.state = state;
    api.last_applied_token = state.commit_token || null;
    if (state.commit_token) window.__NF_COMMIT_TOKEN__ = state.commit_token;
    if (state.source) window.__NF_SOURCE__ = state.source;
    window.__nf_apply_source(state.source, state.commit_token || null);
    window.setTimeout(function() {{
      api.applySelection();
      api.renderInspector();
    }}, 120);
  }};

  api.finishVerifySelect = function() {{
    var stage = document.getElementById('nf-stage');
    var titleApplied = !!(stage && stage.textContent && stage.textContent.indexOf('VerifyTitle') !== -1);
    var fieldCount = document.querySelectorAll('[data-nf-inspector-field]').length;
    var selectedBar = document.querySelector('.nf-tl-bar.selected');
    var undoSize = api.state && typeof api.state.undo_stack_size === 'number' ? api.state.undo_stack_size : -1;
    api.send('verify-select-report', {{
      selected_clip_id: api.state && api.state.selection ? api.state.selection.clip_id || null : null,
      inspector_field_count: fieldCount,
      title_applied: titleApplied,
      selected_class: !!selectedBar,
      undo_stack_size: undoSize,
      three_panel_layout: !!document.querySelector('.preview-panel') && !!document.querySelector('.timeline') && !!document.getElementById('nf-inspector-panel') && !!document.body.classList.contains('nf-editor-open'),
      ok: fieldCount > 0 && titleApplied && !!selectedBar && undoSize === 1
    }});
  }};

  api.runVerifySelect = function() {{
    if (!window.__NF_VERIFY_SELECT__ || api.verify_select_started) return;
    api.verify_select_started = true;
    window.setTimeout(function() {{
      var bars = document.querySelectorAll('.nf-tl-bar');
      var target = bars.length > 1 ? bars[1] : null;
      if (target) target.click();
      window.setTimeout(function() {{
        var titleInput = document.querySelector('#nf-inspector-body [data-nf-path="title"]');
        if (titleInput) {{
          titleInput.value = 'VerifyTitle';
          titleInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
        }}
        window.setTimeout(api.finishVerifySelect, 2200);
      }}, 350);
    }}, 2000);
  }};

  if (!window.__nf_apply_source_base) {{
    window.__nf_apply_source_base = window.__nf_apply_source;
    window.__nf_apply_source = function(newSource, commitToken) {{
      window.__NF_SOURCE__ = newSource;
      if (commitToken) window.__NF_COMMIT_TOKEN__ = commitToken;
      return window.__nf_apply_source_base(newSource);
    }};
  }}
  if (!window.__nf_render_timeline_base) {{
    window.__nf_render_timeline_base = window.__nf_render_timeline;
    window.__nf_render_timeline = function() {{
      var result = window.__nf_render_timeline_base();
      api.decorateTimeline();
      api.renderInspector();
      return result;
    }};
  }}
  if (!window.__nf_mount_base) {{
    window.__nf_mount_base = window.__nf_mount;
    window.__nf_mount = function() {{
      api.ensureShellLayout();
      if (window.NFRuntime && !window.NFRuntime.__nf_editor_patched) {{
        var baseBoot = window.NFRuntime.boot;
        window.NFRuntime.boot = function(options) {{
          options = options || {{}};
          if (!options.source && window.__NF_SOURCE__) options.source = window.__NF_SOURCE__;
          if (!options.tracks && window.__NF_TRACKS__) options.tracks = window.__NF_TRACKS__;
          if (!options.commit_token && window.__NF_COMMIT_TOKEN__) options.commit_token = window.__NF_COMMIT_TOKEN__;
          return baseBoot(options);
        }};
        window.NFRuntime.__nf_editor_patched = true;
      }}
      var result = window.__nf_mount_base();
      window.setTimeout(function() {{
        if (api.state) api.receiveState(api.state);
        api.requestState();
        api.runVerifySelect();
      }}, 160);
      return result;
    }};
  }}
}})();
"#,
        tokens_css = design_tokens_str,
        initial_state = initial_editor_state_str,
        verify_select = verify_select_flag,
    );

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
      }),
      timeline_alignment: (function() {
        var lanes = document.querySelector('.tl-lanes');
        if (!lanes) return { error: 'no .tl-lanes' };
        var dur = parseFloat(lanes.dataset.nfDurationMs || '60000');
        var w = lanes.clientWidth;
        function expectedPx(ms) {
          if (window.__nf_timeline_ms_to_px) return Math.round(window.__nf_timeline_ms_to_px(ms, lanes, dur));
          return Math.round((ms / dur) * w);
        }
        var ph = document.getElementById('nf-playhead');
        var phLeft = ph ? parseFloat(ph.style.left || '0') : -1;
        var firstBar = lanes.querySelector('.nf-tl-bar');
        var firstTick = lanes.querySelector('.nf-tl-tick');
        var lastTick = lanes.querySelectorAll('.nf-tl-tick');
        lastTick = lastTick.length ? lastTick[lastTick.length - 1] : null;
        return {
          duration_ms: dur,
          lanes_width_px: w,
          ph_t_ms: (document.querySelector('video') && document.querySelector('video').currentTime * 1000) || 0,
          ph_left_px: phLeft,
          tick_first_left: firstTick ? parseFloat(firstTick.style.left || '0') : -1,
          tick_first_expected: expectedPx(0),
          tick_last_left: lastTick ? parseFloat(lastTick.style.left || '0') : -1,
          tick_last_expected: expectedPx(dur),
          bar_first_left: firstBar ? parseFloat(firstBar.style.left || '0') : -1,
          bar_first_expected: firstBar ? expectedPx(parseFloat(firstBar.dataset.nfBeginMs || '0')) : -1,
          bar_first_width: firstBar ? parseFloat(firstBar.style.width || '0') : -1,
          bar_first_width_expected: firstBar
            ? (window.__nf_timeline_bar_width_px
                ? Math.max(2, Math.round(window.__nf_timeline_bar_width_px(
                    parseFloat(firstBar.dataset.nfBeginMs || '0'),
                    parseFloat(firstBar.dataset.nfEndMs || '0'),
                    lanes,
                    dur
                  )))
                : Math.max(2, Math.round(((parseFloat(firstBar.dataset.nfEndMs || '0') - parseFloat(firstBar.dataset.nfBeginMs || '0')) / dur) * w)))
            : -1
        };
      })()
    };
    console.log('[NF-VERIFY-MEDIA]', JSON.stringify(report));
    window.ipc.postMessage(JSON.stringify({kind:'verify-media-report', payload: report}));
  }, 2000);
}, 2500);
"#.to_string()
    } else {
        String::new()
    };
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

// FIX-1 (v1.31): teardown registry · every mount registers listeners /
// timers / rAF handles here so the next mount cleanly destroys them.
// Before v1.31 every clip-drag remount stacked a new mousemove/mouseup +
// rAF pump, explaining the user-reported "drag becomes unresponsive" +
// "CPU climbs over time" + "crash-like freezes".
window.__nf_teardown_stack = [];
window.__nf_teardown = function() {{
  while (window.__nf_teardown_stack.length) {{
    var fn = window.__nf_teardown_stack.pop();
    try {{ fn(); }} catch (_e) {{}}
  }}
  // Pause + null the old runtime handle so its internal RAF loop stops.
  if (window.__nf_handle && typeof window.__nf_handle.pause === 'function') {{
    try {{ window.__nf_handle.pause(); }} catch (_e) {{}}
  }}
  window.__nf_handle = null;
  window.__nf_playing = false;
}};
window.__nf_register_listener = function(target, evt, handler, opts) {{
  target.addEventListener(evt, handler, opts);
  window.__nf_teardown_stack.push(function() {{
    try {{ target.removeEventListener(evt, handler, opts); }} catch (_e) {{}}
  }});
}};
window.__nf_register_raf = function(loop_fn) {{
  var running = true;
  function tick() {{ if (!running) return; loop_fn(); requestAnimationFrame(tick); }}
  requestAnimationFrame(tick);
  window.__nf_teardown_stack.push(function() {{ running = false; }});
}};

window.__nf_mount_trace = [];
window.__nf_mount = function() {{
  // Teardown any previous session before building a fresh one.
  window.__nf_teardown();
  window.__nf_mount_trace = ['enter'];
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
      // FIX-3 (v1.31): DO NOT seek(0) after boot · GPT-5.4 review found this
      // puts runtime into pause state. boot(autoplay:true) already starts
      // at t=0 playing. If we need to re-seek on remount we must pass
      // pause:false explicitly so the runtime continues playback.
      window.__nf_mount_trace.push('pre-boot · NFRuntime=' + (typeof window.NFRuntime));
      window.__nf_handle = window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: true }});
      window.__nf_mount_trace.push('post-boot · handle=' + (typeof window.__nf_handle));
      window.__nf_playing = true;
      console.log('[NF] runtime booted · tracks=' + Object.keys(window.__NF_TRACKS__).length + ' · autoplay');
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

{timeline_zoom}

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
  // v1.50: all x positions now flow through shared timeline helpers so
  // zoom / horizontal scroll / playhead stay in lock-step.
  var lanes = document.querySelector('.tl-lanes');
  if (lanes) {{
    lanes.innerHTML = '';
    lanes.style.position = 'relative';
    lanes.dataset.nfDurationMs = String(durationMs);

    // Ruler row (22px tall). Ticks positioned in px.
    var ruler = document.createElement('div');
    ruler.className = 'tl-ruler';
    ruler.id = 'nf-tl-ruler';
    ruler.style.cssText = 'position:relative;height:22px;border-bottom:1px solid rgba(255,255,255,0.08);font:10px/1 "SF Mono",monospace;color:rgba(255,255,255,0.55);box-sizing:border-box';
    var tickCount = 10;
    for (var j = 0; j <= tickCount; j++) {{
      var tick = document.createElement('div');
      var tMs = (durationMs * j / tickCount) | 0;
      tick.className = 'nf-tl-tick';
      tick.dataset.nfMs = String(tMs);
      tick.style.cssText =
        'position:absolute;top:0;bottom:0;' +
        'border-left:1px solid rgba(255,255,255,0.14);' +
        'padding-left:4px;white-space:nowrap;pointer-events:none';
      tick.textContent = window.__nf_fmt_time(tMs, durationMs);
      ruler.appendChild(tick);
    }}
    lanes.appendChild(ruler);

    // Lane rows · clip bars. Use data-nf-begin-ms / data-nf-end-ms for
    // reflow to re-position on window resize.
    var palette = ['#a78bfa','#f97316','#34d399','#38bdf8','#f472b6','#fbbf24','#fb7185'];
    tracks.forEach(function(t, i) {{
      var row = document.createElement('div');
      row.className = 'nf-tl-row';
      row.style.cssText = 'position:relative;height:44px;border-bottom:1px solid rgba(255,255,255,0.04);box-sizing:border-box';
      var color = palette[i % palette.length];
      (t.clips || []).forEach(function(c) {{
        var beginMs = window.__nf_resolve_ms(c.begin, src, 0);
        var endMs   = window.__nf_resolve_ms(c.end,   src, durationMs);
        var bar = document.createElement('div');
        bar.className = 'nf-tl-bar';
        bar.dataset.nfBeginMs = String(beginMs);
        bar.dataset.nfEndMs = String(endMs);
        bar.style.cssText =
          'position:absolute;top:6px;bottom:6px;' +
          'background:linear-gradient(90deg,' + color + '55,' + color + 'aa);' +
          'border:1px solid ' + color + 'cc;border-radius:5px;' +
          'padding:6px 10px;box-sizing:border-box;' +
          'font:12px/1.3 -apple-system,sans-serif;color:rgba(255,255,255,0.92);' +
          'overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
        bar.textContent = (c.id || t.id) + ' · ' + window.__nf_fmt_ms(endMs - beginMs);
        bar.title = t.id + '.' + (c.id || '') + ' [' + window.__nf_fmt_ms(beginMs) + '→' + window.__nf_fmt_ms(endMs) + ']';
        row.appendChild(bar);
      }});
      lanes.appendChild(row);
    }});
    window.__nf_reflow_timeline();
    window.__nf_install_timeline_wheel();
    window.__nf_update_timeline_meta();
    if (!window.__nf_tl_resize_wired) {{
      window.__nf_tl_resize_wired = true;
      window.addEventListener('resize', window.__nf_reflow_timeline);
    }}
  }}
  console.log('[NF] timeline rendered · ' + tracks.length + ' tracks · duration=' + durationMs + 'ms');
}};

// v1.30: reflow all timeline ms→px positions from a single source of truth.
// This is the ONLY place left/width for ticks/bars gets set after render.
window.__nf_reflow_timeline = function() {{
  var lanes = document.querySelector('.tl-lanes');
  if (!lanes) return;
  var dur = window.__nf_timeline_duration_ms(lanes);
  var state = window.__nf_timeline_state();
  state.scroll_ms = window.__nf_timeline_clamp_scroll(state.scroll_ms, lanes, dur);
  var ticks = lanes.querySelectorAll('.nf-tl-tick');
  for (var i = 0; i < ticks.length; i++) {{
    var tMs = parseFloat(ticks[i].dataset.nfMs || '0');
    var x = Math.round(window.__nf_timeline_ms_to_px(tMs, lanes, dur));
    ticks[i].style.left = x + 'px';
  }}
  var bars = lanes.querySelectorAll('.nf-tl-bar');
  for (var k = 0; k < bars.length; k++) {{
    var b = parseFloat(bars[k].dataset.nfBeginMs || '0');
    var e = parseFloat(bars[k].dataset.nfEndMs || '0');
    var left = Math.round(window.__nf_timeline_ms_to_px(b, lanes, dur));
    var wid  = Math.max(2, Math.round(window.__nf_timeline_bar_width_px(b, e, lanes, dur)));
    bars[k].style.left = left + 'px';
    bars[k].style.width = wid + 'px';
  }}
  lanes.dataset.nfPxPerSecond = String(window.__nf_timeline_px_per_second(lanes, dur));
  window.__nf_update_timeline_meta();
  if (typeof window.__nf_update_playhead_position === 'function') {{
    window.__nf_update_playhead_position(window.__nf_last_playhead_t_ms || 0);
  }}
}};

// v1.30: format time as m:ss or h:mm:ss · exactly like JianYing/PR timecode.
// Short durations use 0.0s fraction for precision at the head of the ruler.
window.__nf_fmt_time = function(ms, total) {{
  if (!isFinite(ms) || ms < 0) ms = 0;
  var totalH = total / 3600000;
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  var h = Math.floor(m / 60);
  var sec = s % 60, min = m % 60;
  var pad = function(n) {{ return n < 10 ? '0' + n : String(n); }};
  if (totalH >= 1 || h >= 1) return h + ':' + pad(min) + ':' + pad(sec);
  return m + ':' + pad(sec);
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

  var durationMs = window.__nf_timeline_duration_ms(lanes);

  // v1.50: use the SAME ms→px math as ruler ticks and clip bars, including
  // zoom + scroll offset.
  function tMsToLeftPx(tMs) {{
    var clamped = Math.max(0, Math.min(durationMs, tMs));
    return Math.round(window.__nf_timeline_ms_to_px(clamped, lanes, durationMs));
  }}
  var _lastLabelTMs = -1;
  function updatePh(tMs) {{
    durationMs = window.__nf_timeline_duration_ms(lanes);
    var px = tMsToLeftPx(tMs);
    ph.style.left = px + 'px';
    window.__nf_last_playhead_t_ms = tMs;
    // Update the label at most every 100ms to avoid text reflow hammering
    // during drag.
    if (Math.abs(tMs - _lastLabelTMs) > 100) {{
      var timeLabel = document.getElementById('nf-time-label');
      if (timeLabel) {{
        timeLabel.textContent = window.__nf_fmt_time(tMs, durationMs) + ' / ' + window.__nf_fmt_time(durationMs, durationMs);
      }}
      _lastLabelTMs = tMs;
    }}
  }}
  window.__nf_update_playhead_position = updatePh;

  // Time label in the timeline header, next to the play button.
  var tlHead = document.querySelector('.tl-head');
  if (tlHead && !document.getElementById('nf-time-label')) {{
    var lab = document.createElement('span');
    lab.id = 'nf-time-label';
    lab.style.cssText = 'margin-left:10px;font:12px/1 "SF Mono",monospace;color:rgba(255,255,255,0.72);min-width:110px;display:inline-block';
    lab.textContent = window.__nf_fmt_time(0, durationMs) + ' / ' + window.__nf_fmt_time(durationMs, durationMs);
    var btn = document.getElementById('nf-play-pause');
    if (btn && btn.parentElement) btn.parentElement.insertBefore(lab, btn.nextSibling);
    else tlHead.appendChild(lab);
  }}

  // FIX (v1.31 hotfix): user report "首次播放 进度条没跟进" ·
  // WKWebView suspends runtime's rAF pump in early-load · handle.onTimeUpdate
  // cb may never fire. Use a multi-source driver:
  //   1. runtime handle.onTimeUpdate (cheap · accurate · preferred if fires)
  //   2. <video> / <audio> currentTime (independent decoder clock · always ticks)
  //   3. setInterval 100ms · always running · register for teardown
  if (typeof handle.onTimeUpdate === 'function') {{
    handle.onTimeUpdate(function(t_ms) {{ updatePh(t_ms); }});
  }}
  var _startedAt = performance.now();
  var _pollId = setInterval(function() {{
    // Prefer first playing video/audio as the clock source (ground truth).
    var media = document.querySelector('video, audio');
    if (media && !media.paused && media.currentTime > 0) {{
      updatePh(media.currentTime * 1000);
      return;
    }}
    // Fallback: handle.getStateAt()
    try {{
      var st = (typeof handle.getStateAt === 'function') ? handle.getStateAt() : null;
      if (st && typeof st.t_ms === 'number' && st.t_ms > 0) {{
        updatePh(st.t_ms);
        return;
      }}
    }} catch (_e) {{}}
    // Last resort: wall-clock if runtime/media clocks both stuck.
    if (window.__nf_playing) {{
      var el = performance.now() - _startedAt;
      if (el < durationMs) updatePh(el);
    }}
  }}, 100);
  window.__nf_teardown_stack.push(function() {{ clearInterval(_pollId); }});
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
    durationMs = window.__nf_timeline_duration_ms(lanes);
    return window.__nf_timeline_clamp(
      window.__nf_timeline_px_to_ms(x, lanes, durationMs),
      0,
      durationMs
    );
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
  // FIX-1: registered via __nf_register_raf so remount tears it down.
  window.__nf_register_raf(function() {{
    if (_dirty && dragging) {{
      updatePh(_targetTms);
      var now = performance.now();
      if (now - _lastSeekMs >= _SEEK_THROTTLE_MS) {{
        try {{ handle.seek(_targetTms, {{pause: true}}); }} catch(_e){{}}
        _lastSeekMs = now;
      }}
      _dirty = false;
    }}
  }});

  // Events: mousedown on lanes (click anywhere) or knob (drag). move+up bind
  // on document so drag works even if cursor leaves lanes.
  // FIX-1: use __nf_register_listener so remount removes previous handlers.
  window.__nf_register_listener(lanes, 'mousedown', grab);
  window.__nf_register_listener(knob, 'mousedown', function(ev) {{ grab(ev); ev.stopPropagation(); }});
  window.__nf_register_listener(document, 'mousemove', move, {{ passive: false }});
  window.__nf_register_listener(document, 'mouseup', release);
  window.__nf_register_listener(lanes, 'touchstart', function(ev) {{
    var t = ev.touches[0]; if (t) grab({{clientX: t.clientX, preventDefault: function(){{}}}});
  }}, {{ passive: true }});
  window.__nf_register_listener(document, 'touchmove', function(ev) {{
    var t = ev.touches[0]; if (t) move({{clientX: t.clientX, preventDefault: function(){{}}}});
  }}, {{ passive: true }});
  window.__nf_register_listener(document, 'touchend', release);
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

{editor_ui}
{control_surface}

if (document.readyState === 'loading') {{
  document.addEventListener('DOMContentLoaded', window.__nf_mount);
}} else {{
  window.__nf_mount();
}}
{verify}
{screenshot}
{verify_media}
{verify_zoom}
"#,
        source = source_str,
        tracks = tracks_str,
        source_path = source_path_str,
        runtime = RUNTIME_IIFE,
        timeline_zoom = timeline_zoom_block,
        editor_ui = editor_ui_block,
        control_surface = control_surface_block,
        verify = verify_block,
        screenshot = screenshot_block,
        verify_media = verify_media_block,
        verify_zoom = verify_zoom_block,
    )
}

struct CliOpts {
    verify_mode: bool,
    verify_select_mode: bool,
    verify_zoom_mode: bool,
    screenshot_path: Option<PathBuf>,
    screenshot_delay_ms: u64,
    export_path: Option<PathBuf>,
    export_duration_s: f64,
    /// v1.44.1 · 并行切片 N · 默认 1 = 单进程 · ≥2 走 orchestrator spawn N 子进程 + ffmpeg concat.
    /// duration < 6s 自动降级单进程(orchestrator 内部判)。
    export_parallel: usize,
    menu_test: bool,
    window_x: f64,
    window_y: f64,
    verify_media_path: Option<PathBuf>,
    source_arg: String,
}

fn parse_cli() -> CliOpts {
    let args: Vec<String> = std::env::args().collect();
    let mut verify_mode = false;
    let mut verify_select_mode = false;
    let mut verify_zoom_mode = false;
    let mut screenshot_path: Option<PathBuf> = None;
    let mut screenshot_delay_ms: u64 = 2500;
    let mut export_path: Option<PathBuf> = None;
    let mut export_duration_s: f64 = 5.0;
    let mut export_parallel: usize = 1;
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
            "--verify-select" => verify_select_mode = true,
            "--verify-zoom" => verify_zoom_mode = true,
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
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<f64>() {
                        window_x = v;
                    }
                }
            }
            "--y" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<f64>() {
                        window_y = v;
                    }
                }
            }
            "--verify-media" => {
                i += 1;
                if i < args.len() {
                    verify_media_path = Some(PathBuf::from(&args[i]));
                }
            }
            "--duration" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<f64>() {
                        export_duration_s = v;
                    }
                }
            }
            "--parallel" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<usize>() {
                        export_parallel = v.max(1);
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
        verify_select_mode,
        verify_zoom_mode,
        screenshot_path,
        screenshot_delay_ms,
        export_path,
        export_duration_s,
        export_parallel,
        menu_test,
        window_x,
        window_y,
        verify_media_path,
        source_arg: positional.unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string()),
    }
}

/// Walk tracks[].clips[].params and rewrite any "src" that starts with
/// `file://` to the `nf-asset://x<abs-path>` custom protocol URL.
/// FIX-5 (v1.31): rewrite `params.src` to nf-asset://x<abs-path>.
/// - `file:///abs/path` → nf-asset://x/abs/path (kept)
/// - `./rel.mp4` / `rel.mp4` (relative) → resolved against source.json dir
///   then wrapped as nf-asset
/// - already-http(s)/nf-asset left alone
fn rewrite_file_srcs(v: &mut Value, source_dir: &std::path::Path) {
    let Some(tracks) = v.get_mut("tracks").and_then(|t| t.as_array_mut()) else {
        return;
    };
    for t in tracks.iter_mut() {
        let Some(clips) = t.get_mut("clips").and_then(|c| c.as_array_mut()) else {
            continue;
        };
        for c in clips.iter_mut() {
            let Some(params) = c.get_mut("params") else {
                continue;
            };
            let Some(src) = params.get("src").and_then(|s| s.as_str()).map(String::from) else {
                continue;
            };
            let new_src: Option<String> = if let Some(abs) = src.strip_prefix("file://") {
                Some(format!("nf-asset://x{abs}"))
            } else if src.starts_with("http://")
                || src.starts_with("https://")
                || src.starts_with("nf-asset:")
                || src.starts_with("data:")
            {
                None
            } else {
                // Relative — resolve against source.json directory.
                let candidate = source_dir.join(&src);
                if let Ok(abs) = candidate.canonicalize() {
                    Some(format!("nf-asset://x{}", abs.display()))
                } else {
                    None
                }
            };
            if let Some(n) = new_src {
                params["src"] = Value::String(n);
            }
        }
    }
}

/// FIX-2 (v1.31): nf-asset custom protocol — supports HTTP Range/206 so
/// WKWebView can stream/seek into large mp4s without dragging the main
/// thread into a multi-MB fs::read on every seek.
fn nf_asset_response(req: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    let empty_body = || {
        http::Response::builder()
            .status(500)
            .body(Vec::<u8>::new())
            .unwrap_or_else(|_| http::Response::new(Vec::new()))
    };
    let uri = req.uri().to_string();
    let path_str = uri
        .strip_prefix("nf-asset://x/")
        .or_else(|| uri.strip_prefix("nf-asset://x"))
        .or_else(|| uri.strip_prefix("nf-asset:"))
        .unwrap_or(&uri);
    let mut path_owned = String::from("/");
    path_owned.push_str(path_str);
    if let Some(q) = path_owned.find('?') {
        path_owned.truncate(q);
    }
    let path = std::path::PathBuf::from(
        percent_decode_str(&path_owned).unwrap_or_else(|| path_owned.clone()),
    );
    let Ok(mut file) = std::fs::File::open(&path) else {
        return http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(b"nf-asset: file not found".to_vec())
            .unwrap_or_else(|_| empty_body());
    };
    let total: u64 = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mime = guess_mime_from_path(&path);
    // Parse Range: bytes=START-END (inclusive) · RFC 7233.
    let range_hdr = req
        .headers()
        .get(http::header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("bytes="))
        .map(|s| s.to_owned());
    let (start, end, is_range) = match range_hdr {
        Some(spec) => {
            let mut parts = spec.splitn(2, '-');
            let s = parts.next().unwrap_or("").trim();
            let e = parts.next().unwrap_or("").trim();
            let s: u64 = s.parse().unwrap_or(0);
            let e: u64 = if e.is_empty() {
                total.saturating_sub(1)
            } else {
                e.parse().unwrap_or(total.saturating_sub(1))
            };
            (s.min(total), e.min(total.saturating_sub(1)), true)
        }
        None => (0, total.saturating_sub(1), false),
    };
    if total == 0 || start > end {
        return http::Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{total}"))
            .body(Vec::<u8>::new())
            .unwrap_or_else(|_| empty_body());
    }
    let len = end - start + 1;
    let mut buf = vec![0u8; len as usize];
    if file.seek(SeekFrom::Start(start)).is_err() {
        return empty_body();
    }
    if file.read_exact(&mut buf).is_err() {
        // Short read (file truncated during read); still return what we have.
        // Don't panic.
    }
    let status = if is_range { 206 } else { 200 };
    let mut builder = http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .header("Content-Length", len.to_string());
    if is_range {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{total}"));
    }
    builder.body(buf).unwrap_or_else(|_| empty_body())
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
    match p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
    {
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

fn shell_log(stdout_json_mode: bool, message: &str) {
    if stdout_json_mode {
        eprintln!("{message}");
    } else {
        println!("{message}");
    }
}

fn ensure_parent_dir(path: &std::path::Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("mkdir {}", parent.display()))?;
    }
    Ok(())
}

fn window_capture_rect(window: &tao::window::Window) -> (f64, f64, f64, f64) {
    let pos = window
        .outer_position()
        .unwrap_or(PhysicalPosition::new(120, 80));
    let size = window.outer_size();
    (
        f64::from(pos.x.max(0)),
        f64::from(pos.y.max(0)),
        f64::from(size.width),
        f64::from(size.height),
    )
}

fn main() -> Result<()> {
    let opts = parse_cli();
    let stdout_json_mode = opts.verify_select_mode || opts.verify_zoom_mode;

    // v1.44 · CLI --export 快捷路径:不启 tao event_loop · 不开窗口 ·
    // 直接用 headless WKWebView + CARenderer (nf-recorder) 产 MP4 · 退出。
    // 一致性靠 ADR-045 t 纯驱动 + viewport 绑 source.json · 跟 preview 像素级一致。
    if let Some(export_path) = opts.export_path.clone() {
        shell_log(
            stdout_json_mode,
            &format!(
                "[NF-RECORDER] CLI --export direct mode · source={} · out={} · duration={}s · parallel={}",
                opts.source_arg,
                export_path.display(),
                opts.export_duration_s,
                opts.export_parallel
            ),
        );
        let src_path = PathBuf::from(&opts.source_arg);
        match run_recorder_export(
            &src_path,
            &export_path,
            opts.export_duration_s,
            opts.export_parallel,
        ) {
            Ok(bytes) => {
                shell_log(
                    stdout_json_mode,
                    &format!(
                        "[NF-RECORDER] done · wrote {} bytes → {}",
                        bytes,
                        export_path.display()
                    ),
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
    // FIX-5: resolve relative asset paths against source.json's dir.
    let source_dir = std::path::Path::new(&opts.source_arg)
        .canonicalize()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
        });
    rewrite_file_srcs(&mut source_json, &source_dir);
    let tracks_map = build_track_sources(&source_json);
    let n_tracks = tracks_map.len();
    let editor_state = Arc::new(Mutex::new(EditorState::new(source_json.clone())));
    let initial_editor_state = match editor_state.lock() {
        Ok(state) => editor_state_value(&state),
        Err(e) => {
            return Err(anyhow::anyhow!("editor state lock poisoned: {e}"));
        }
    };

    let init_script = build_init_script(
        &source_json,
        &tracks_map,
        &initial_editor_state,
        opts.verify_mode,
        opts.verify_select_mode,
        opts.screenshot_path
            .as_ref()
            .map(|_| opts.screenshot_delay_ms),
        &opts.source_arg,
        opts.verify_media_path.is_some(),
        opts.verify_zoom_mode,
    );

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

    let editor_state_for_handler = Arc::clone(&editor_state);
    let proxy_for_handler = proxy.clone();
    let verify_mode = opts.verify_mode;
    let verify_count = Arc::new(Mutex::new(0u32));
    let verify_count_for_handler = Arc::clone(&verify_count);
    let verify_media_path_for_handler = opts.verify_media_path.clone();
    let verify_select_mode = opts.verify_select_mode;
    let verify_zoom_mode = opts.verify_zoom_mode;

    let webview = WebViewBuilder::new(&window)
        // v1.31.1 hotfix: ASYNC protocol · WKWebView URLSchemeTask is
        // main-threaded on macOS. 16 parallel Range requests during seek
        // + sync File::open/read melt the run loop → "卡". Push each
        // request onto a worker thread so the event loop keeps pumping.
        .with_asynchronous_custom_protocol("nf-asset".to_string(), move |req, responder| {
            std::thread::spawn(move || {
                responder.respond(nf_asset_response(req));
            });
        })
        .with_html(PROTOTYPE_HTML)
        .with_initialization_script(&init_script)
        .with_devtools(true)
        .with_ipc_handler(move |req| {
            let body: &str = req.body().as_ref();
            let mut state = match editor_state_for_handler.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("[NF-IPC] state lock poisoned: {e}");
                    return;
                }
            };
            match dispatch_ipc(&mut state, body) {
                Ok(IpcOutcome::EvalScript {
                    message,
                    js,
                    mutation,
                }) => {
                    if let Some(msg) = message {
                        shell_log(stdout_json_mode, &format!("[NF-IPC] {msg}"));
                    }
                    drop(state);
                    let _ = proxy_for_handler.send_event(UserEvent::EvalScript(js));
                    if verify_mode && mutation {
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
                    let _ =
                        proxy_for_handler.send_event(UserEvent::StartExport { path, duration_s });
                }
                Ok(IpcOutcome::VerifyMediaReport(json)) => {
                    if let Some(ref p) = verify_media_path_for_handler {
                        let _ = proxy_for_handler.send_event(UserEvent::VerifyMediaReport {
                            path: p.clone(),
                            json,
                        });
                    }
                }
                Ok(IpcOutcome::VerifySelectReport(payload)) => {
                    if verify_select_mode {
                        let _ =
                            proxy_for_handler.send_event(UserEvent::VerifySelectReport { payload });
                    }
                }
                Ok(IpcOutcome::VerifyZoomReport(payload)) => {
                    if verify_zoom_mode {
                        let _ =
                            proxy_for_handler.send_event(UserEvent::VerifyZoomReport { payload });
                    }
                }
                Err(e) => {
                    shell_log(stdout_json_mode, &format!("[NF-IPC] error: {e}"));
                }
            }
        })
        .build()
        .context("webview build")?;

    shell_log(
        stdout_json_mode,
        &format!(
            "[NF] window {WINDOW_W}x{WINDOW_H} · titlebar transparent + traffic lights · resizable · source={} · tracks={} · verify={} · verify_select={} · verify_zoom={} · screenshot={}",
            opts.source_arg,
            n_tracks,
            opts.verify_mode,
            opts.verify_select_mode,
            opts.verify_zoom_mode,
            opts.screenshot_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "off".to_string()),
        ),
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
                let (x, y, width, height) = window_capture_rect(&window_for_loop);
                match capture_region_png(&path, x, y, width, height) {
                    Ok(n) => shell_log(
                        stdout_json_mode,
                        &format!(
                            "[NF-SHOT] wrote {} ({} bytes · region {}x{} @({},{}))",
                            path.display(),
                            n,
                            width as i64,
                            height as i64,
                            x as i64,
                            y as i64
                        ),
                    ),
                    Err(e) => eprintln!("[NF-SHOT] failed: {e}"),
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::VerifyDone) => {
                shell_log(
                    stdout_json_mode,
                    "[NF-VERIFY] all IPC mutations applied · exit in 1500ms",
                );
                std::thread::sleep(std::time::Duration::from_millis(1500));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::VerifyMediaReport { path, json }) => {
                let _ = ensure_parent_dir(&path);
                match std::fs::write(&path, &json) {
                    Ok(_) => shell_log(
                        stdout_json_mode,
                        &format!(
                            "[NF-VERIFY-MEDIA] wrote {} ({} bytes)",
                            path.display(),
                            json.len()
                        ),
                    ),
                    Err(e) => eprintln!("[NF-VERIFY-MEDIA] write failed: {e}"),
                }
                // exit so caller (cron / ci / dev) gets result and releases port.
                std::thread::sleep(std::time::Duration::from_millis(200));
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::VerifySelectReport { payload }) => {
                let json_path = PathBuf::from(VERIFY_SELECT_JSON_PATH);
                let screenshot_path = PathBuf::from(VERIFY_SELECT_SCREENSHOT_PATH);
                let (x, y, width, height) = window_capture_rect(&window_for_loop);
                let screenshot_ok =
                    capture_region_png(&screenshot_path, x, y, width, height).is_ok();
                let mut report = if payload.is_object() {
                    payload
                } else {
                    json!({ "ok": false, "payload": payload })
                };
                let mut final_ok = report.get("ok").and_then(Value::as_bool).unwrap_or(false);
                final_ok = final_ok && screenshot_ok;
                if let Some(obj) = report.as_object_mut() {
                    obj.insert(
                        "screenshot_path".to_string(),
                        Value::String(VERIFY_SELECT_SCREENSHOT_PATH.to_string()),
                    );
                    obj.insert(
                        "report_path".to_string(),
                        Value::String(VERIFY_SELECT_JSON_PATH.to_string()),
                    );
                    obj.insert(
                        "screenshot_captured".to_string(),
                        Value::Bool(screenshot_ok),
                    );
                    obj.insert("ok".to_string(), Value::Bool(final_ok));
                }
                let report_json = pretty_json(&report);
                let _ = ensure_parent_dir(&json_path);
                if let Err(err) = std::fs::write(&json_path, &report_json) {
                    eprintln!("[NF-VERIFY-SELECT] write failed: {err}");
                    final_ok = false;
                }
                let mut stdout = std::io::stdout();
                if std::io::Write::write_all(&mut stdout, report_json.as_bytes()).is_err() {
                    final_ok = false;
                }
                if std::io::Write::write_all(&mut stdout, b"\n").is_err() {
                    final_ok = false;
                }
                let _ = std::io::Write::flush(&mut stdout);
                std::process::exit(if final_ok { 0 } else { 1 });
            }
            Event::UserEvent(UserEvent::VerifyZoomReport { payload }) => {
                let json_path = PathBuf::from(VERIFY_ZOOM_JSON_PATH);
                let screenshot_path = PathBuf::from(VERIFY_ZOOM_SCREENSHOT_PATH);
                let (x, y, width, height) = window_capture_rect(&window_for_loop);
                let screenshot_ok =
                    capture_region_png(&screenshot_path, x, y, width, height).is_ok();
                let mut report = if payload.is_object() {
                    payload
                } else {
                    json!({ "ok": false, "payload": payload })
                };
                let vp1_ok = report
                    .pointer("/cmd_wheel_5_times/pass")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let vp2_ok = report
                    .pointer("/click_at_30s/pass")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let vp3_ok = report
                    .get("playhead_offset_px")
                    .and_then(Value::as_f64)
                    .map(|v| v <= 2.0)
                    .unwrap_or(false);
                let vp4_ok = report
                    .pointer("/shift_wheel_scroll/pass")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let vp5_ok = report
                    .pointer("/high_zoom_bar_width/pass")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let mut final_ok = vp1_ok && vp2_ok && vp3_ok && vp4_ok && vp5_ok && screenshot_ok;
                if let Some(obj) = report.as_object_mut() {
                    obj.insert("playhead_pass".to_string(), Value::Bool(vp3_ok));
                    obj.insert(
                        "screenshot_path".to_string(),
                        Value::String(VERIFY_ZOOM_SCREENSHOT_PATH.to_string()),
                    );
                    obj.insert(
                        "report_path".to_string(),
                        Value::String(VERIFY_ZOOM_JSON_PATH.to_string()),
                    );
                    obj.insert(
                        "screenshot_captured".to_string(),
                        Value::Bool(screenshot_ok),
                    );
                    obj.insert("ok".to_string(), Value::Bool(final_ok));
                }
                let report_json = pretty_json(&report);
                let _ = ensure_parent_dir(&json_path);
                if let Err(err) = std::fs::write(&json_path, &report_json) {
                    eprintln!("[NF-VERIFY-ZOOM] write failed: {err}");
                    final_ok = false;
                }
                let mut stdout = std::io::stdout();
                if std::io::Write::write_all(&mut stdout, report_json.as_bytes()).is_err() {
                    final_ok = false;
                }
                if std::io::Write::write_all(&mut stdout, b"\n").is_err() {
                    final_ok = false;
                }
                let _ = std::io::Write::flush(&mut stdout);
                std::process::exit(if final_ok { 0 } else { 1 });
            }
            Event::UserEvent(UserEvent::StartExport { path, duration_s }) => {
                // v1.44 · 菜单 IPC 触发 · spawn 自身子进程跑 --export · 不阻塞
                // 交互 preview 窗口。子进程在 fn main() 开头的 early-exit 分支里用
                // current_thread tokio 跑 nf_recorder::run_export_from_source。
                shell_log(
                    stdout_json_mode,
                    &format!(
                        "[NF-RECORDER] start · duration={duration_s}s → {}",
                        path.display()
                    ),
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
                    shell_log(
                        stdout_json_mode,
                        &format!("[NF-EXPORT] done · {} · {msg}", path.display()),
                    );
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
                // FIX-6 (v1.31): rfd::FileDialog on macOS calls NSOpenPanel,
                // which is MAIN-thread only (Cocoa UB otherwise). The event
                // loop IS the main thread — run synchronously here. It
                // blocks the event loop briefly, but that's how every native
                // desktop app does it and it's correct.
                shell_log(
                    stdout_json_mode,
                    "[NF-MENU] open · NSOpenPanel on main thread",
                );
                let picked = rfd::FileDialog::new()
                    .add_filter("NextFrame source", &["json"])
                    .set_title("Open source.json")
                    .pick_file();
                match picked {
                    Some(p) => {
                        shell_log(
                            stdout_json_mode,
                            &format!("[NF-MENU] open selected: {}", p.display()),
                        );
                        // Re-load in the current webview: read + rewrite +
                        // push new __NF_SOURCE__ via evaluate_script.
                        if let Ok(text) = std::fs::read_to_string(&p) {
                            if let Ok(mut new_src) = serde_json::from_str::<Value>(&text) {
                                let sd = p
                                    .canonicalize()
                                    .ok()
                                    .and_then(|q| q.parent().map(|q| q.to_path_buf()))
                                    .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
                                rewrite_file_srcs(&mut new_src, &sd);
                                if let Ok(mut editor) = editor_state.lock() {
                                    *editor = EditorState::new(new_src);
                                    let js = editor_js_call(
                                        "receiveSourceUpdate",
                                        &editor_state_value(&editor),
                                    );
                                    let _ = webview.evaluate_script(&js);
                                }
                            }
                        }
                    }
                    None => shell_log(stdout_json_mode, "[NF-MENU] open cancelled"),
                }
            }
            Event::UserEvent(UserEvent::MenuSave) => {
                shell_log(
                    stdout_json_mode,
                    "[NF-MENU] save · NSSavePanel on main thread",
                );
                let picked = rfd::FileDialog::new()
                    .add_filter("NextFrame source", &["json"])
                    .set_file_name("source.json")
                    .save_file();
                match picked {
                    Some(p) => {
                        // Snapshot in-memory source and write it out.
                        let written = editor_state
                            .lock()
                            .ok()
                            .and_then(|state| {
                                serde_json::to_string_pretty(&state.source)
                                    .ok()
                                    .and_then(|s| {
                                        let n = s.len();
                                        std::fs::write(&p, s).ok().map(|_| n)
                                    })
                            })
                            .unwrap_or(0);
                        shell_log(
                            stdout_json_mode,
                            &format!("[NF-MENU] save to: {} ({} bytes)", p.display(), written),
                        );
                    }
                    None => shell_log(stdout_json_mode, "[NF-MENU] save cancelled"),
                }
            }
            _ => {}
        }
    });
}
