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
//!   `nf-shell --verify-undo [source.json]`  — run undo/redo + mute/solo verify
//!   `nf-shell --screenshot <out.png> [--delay-ms N] [source.json]`
//!                                            — capture WebView → PNG and exit

mod editor;
mod platform;
mod plugins;
mod template_market;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use editor::{EditorState, MultiSourceState, Selection};
#[cfg(any(windows, all(unix, not(target_vendor = "apple"))))]
use platform::ShellWebView;
use plugins::{scan_user_plugins, PluginCatalog};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tao::dpi::PhysicalPosition;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop, EventLoopBuilder};
#[cfg(target_vendor = "apple")]
use tao::platform::macos::WindowBuilderExtMacOS;
use template_market::materialize_template;
use wry::http;

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
// v1.64 · media-bin + multi-tab + export-progress + snap + safe-area verify-select output paths
const VERIFY_SELECT_JSON_PATH: &str = "spec/versions/v1.64/verify/verify-select.json";
const VERIFY_SELECT_SCREENSHOT_PATH: &str = "tmp/v1.64-verify-select.png";
// v1.50 · timeline zoom verify output paths
const VERIFY_ZOOM_JSON_PATH: &str = "tmp/v1.50-verify.json";
const VERIFY_ZOOM_SCREENSHOT_PATH: &str = "tmp/v1.50-60s-demo-30s-click.png";
// v1.51 · undo/mute/solo verify output paths
const VERIFY_UNDO_JSON_PATH: &str = "tmp/v1.51-verify.json";
const VERIFY_UNDO_SCREENSHOT_PATH: &str = "tmp/v1.51-undo-mute.png";
const AUDIO_PEAK_BUCKET_MS: u64 = 10;
const AUDIO_PEAK_SAMPLE_RATE: u32 = 8_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AudioPeaksCache {
    version: u32,
    src: String,
    source_path: String,
    bucket_ms: u64,
    sample_rate: u32,
    duration_ms: u64,
    peaks: Vec<f32>,
}

#[derive(Debug, Clone)]
enum UserEvent {
    EvalScript(String),
    DragWindow,
    ScreenshotNow(PathBuf),
    OpenTab {
        path: PathBuf,
    },
    StartExportDialog {
        duration_s: f64,
        parallel: Option<usize>,
        resolution: Option<String>,
    },
    StartExport {
        path: PathBuf,
        duration_s: f64,
        parallel: Option<usize>,
        resolution: Option<String>,
    },
    StartSimulatedExport {
        path: PathBuf,
        duration_s: f64,
    },
    ExportDone {
        path: PathBuf,
        ok: bool,
        msg: String,
    },
    ExportProgress {
        path: PathBuf,
        progress: f64,
        label: String,
        active: bool,
    },
    MenuOpen,
    MenuSave,
    MenuTemplate {
        template_name: String,
    },
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
    VerifyUndoReport {
        payload: Value,
    },
}

#[derive(Debug, Clone)]
struct ExportUiState {
    active: bool,
    progress: f64,
    label: String,
    path: Option<String>,
}

impl Default for ExportUiState {
    fn default() -> Self {
        Self {
            active: false,
            progress: 0.0,
            label: "Idle".to_string(),
            path: None,
        }
    }
}

#[derive(Debug, Clone)]
struct LoadedSource {
    path: String,
    source: Value,
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

fn build_track_sources(source_json: &Value, plugins: &PluginCatalog) -> Map<String, Value> {
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
        if let Some(src) = track_source_for(kind).or_else(|| plugins.source_for_kind(kind)) {
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

fn find_clip_indices(source: &Value, clip_id: &str) -> Option<(usize, usize)> {
    let tracks = source.get("tracks")?.as_array()?;
    for (track_idx, track) in tracks.iter().enumerate() {
        let clips = track.get("clips")?.as_array()?;
        for (clip_idx, clip) in clips.iter().enumerate() {
            if clip.get("id").and_then(Value::as_str) == Some(clip_id) {
                return Some((track_idx, clip_idx));
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

fn apply_clip_move(source: &mut Value, payload: &Value) -> Result<String> {
    let clip_id = payload
        .get("clipId")
        .or_else(|| payload.get("clip_id"))
        .and_then(Value::as_str)
        .context("move-clip: clipId missing")?;
    let (track_idx, clip_idx) = find_clip_indices(source, clip_id)
        .with_context(|| format!("move-clip: clip not found: {clip_id}"))?;
    let clip = source
        .pointer(&format!("/tracks/{track_idx}/clips/{clip_idx}"))
        .cloned()
        .with_context(|| format!("move-clip: clip lookup failed: {clip_id}"))?;
    let old_begin_ms = clip.get("begin").and_then(ms_from_value).context(
        "move-clip: clip.begin not numeric (anchor expressions not yet supported in drag edit)",
    )?;
    let old_end_ms = clip.get("end").and_then(ms_from_value).context(
        "move-clip: clip.end not numeric (anchor expressions not yet supported in drag edit)",
    )?;
    let duration_ms = (old_end_ms - old_begin_ms).max(100);
    let next_begin_ms = payload
        .get("begin_ms")
        .or_else(|| payload.get("beginMs"))
        .and_then(Value::as_i64)
        .or_else(|| {
            payload
                .get("deltaT_ms")
                .and_then(Value::as_i64)
                .map(|delta| old_begin_ms + delta)
        })
        .context("move-clip: begin_ms or deltaT_ms missing")?
        .max(0);
    let next_end_ms = next_begin_ms + duration_ms;
    let clip_mut = source
        .pointer_mut(&format!("/tracks/{track_idx}/clips/{clip_idx}"))
        .with_context(|| format!("move-clip: clip mutation failed: {clip_id}"))?;
    clip_mut["begin"] = Value::from(next_begin_ms);
    clip_mut["end"] = Value::from(next_end_ms);
    Ok(format!(
        "move-clip applied: {clip_id} {old_begin_ms}→{next_begin_ms} / {old_end_ms}→{next_end_ms}"
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
    OpenTab {
        path: PathBuf,
    },
    MenuOpen,
    MenuSave,
    MenuTemplate {
        template_name: String,
    },
    StartExportDialog {
        duration_s: f64,
        parallel: Option<usize>,
        resolution: Option<String>,
    },
    StartExport {
        path: PathBuf,
        duration_s: f64,
        parallel: Option<usize>,
        resolution: Option<String>,
    },
    StartSimulatedExport {
        path: PathBuf,
        duration_s: f64,
    },
    VerifyMediaReport(String),
    VerifySelectReport(Value),
    VerifyZoomReport(Value),
    VerifyUndoReport(Value),
}

fn selection_value(selection: &Selection) -> Value {
    json!({
        "kind": selection.kind.clone(),
        "clip_id": selection.clip_id.clone(),
        "track_id": selection.track_id.clone(),
        "multi": selection.multi.clone(),
    })
}

fn export_state_value(export_ui: &ExportUiState) -> Value {
    json!({
        "active": export_ui.active,
        "progress": export_ui.progress,
        "label": export_ui.label,
        "path": export_ui.path,
    })
}

fn workspace_state_value(
    workspace: &MultiSourceState,
    export_ui: &ExportUiState,
    plugins: &PluginCatalog,
) -> Value {
    let Some(active_tab) = workspace.active_tab() else {
        return json!({
            "source": Value::Null,
            "selection": selection_value(&Selection::default()),
            "undo_stack_size": 0,
            "redo_stack_size": 0,
            "undo_oldest_id": Value::Null,
            "undo_oldest_reverse_value": Value::Null,
            "commit_token": Value::Null,
            "config": Value::Null,
            "tabs": [],
            "active_tab_id": workspace.active_tab_id,
            "source_path": Value::Null,
            "track_sources": {},
            "media_bin": [],
            "export": export_state_value(export_ui),
        });
    };
    let editor = &active_tab.editor;
    let undo_oldest_reverse_value = editor
        .undo_stack
        .first()
        .and_then(|entry| entry.reverse.first())
        .and_then(|patch| patch.value.clone())
        .unwrap_or(Value::Null);
    json!({
        "source": editor.source.clone(),
        "selection": selection_value(&editor.selection),
        "undo_stack_size": editor.undo_stack.len(),
        "redo_stack_size": editor.redo_stack.len(),
        "undo_oldest_id": editor.undo_stack.first().map(|entry| entry.id.clone()),
        "undo_oldest_reverse_value": undo_oldest_reverse_value,
        "commit_token": editor.commit_token.clone(),
        "config": {
            "max_undo": editor.config.max_undo,
            "debounce_ms": editor.config.debounce_ms,
            "autosave": editor.config.autosave,
        },
        "tabs": workspace.tabs.iter().map(|tab| json!({
            "id": tab.id,
            "title": tab.title,
            "path": tab.path,
            "active": tab.id == workspace.active_tab_id,
            "track_count": tab.editor.source.get("tracks").and_then(Value::as_array).map(|tracks| tracks.len()).unwrap_or(0),
        })).collect::<Vec<_>>(),
        "active_tab_id": workspace.active_tab_id,
        "source_path": active_tab.path,
        "track_sources": build_track_sources(&editor.source, plugins),
        "media_bin": collect_media_bin_items(&active_tab.path),
        "export": export_state_value(export_ui),
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

fn active_editor_mut(workspace: &mut MultiSourceState) -> Result<&mut EditorState> {
    workspace
        .active_editor_mut()
        .ok_or_else(|| anyhow::anyhow!("active editor missing"))
}

fn apply_clip_drag_editor(workspace: &mut MultiSourceState, payload: &Value) -> Result<String> {
    let editor = active_editor_mut(workspace)?;
    let message = apply_clip_drag(&mut editor.source, payload)?;
    editor.redo_stack.clear();
    editor.bump_commit_token();
    Ok(message)
}

fn apply_clip_move_editor(workspace: &mut MultiSourceState, payload: &Value) -> Result<String> {
    let editor = active_editor_mut(workspace)?;
    let message = apply_clip_move(&mut editor.source, payload)?;
    editor.redo_stack.clear();
    editor.bump_commit_token();
    Ok(message)
}

fn dispatch_ipc(
    workspace: &mut MultiSourceState,
    export_ui: &ExportUiState,
    plugins: &PluginCatalog,
    body: &str,
) -> Result<IpcOutcome> {
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
            let message = apply_clip_drag_editor(workspace, &payload)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(message),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "move-clip" => {
            let message = apply_clip_move_editor(workspace, &payload)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(message),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "select-clip" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let editor = active_editor_mut(workspace)?;
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
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .set_param(clip_id, path, value)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("set-param applied: {clip_id}.{path}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "set-keyframe" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .context("set-keyframe: clip_id missing")?;
            let path = payload
                .get("path")
                .and_then(Value::as_str)
                .context("set-keyframe: path missing")?;
            let t_ms = payload
                .get("t_ms")
                .or_else(|| payload.get("tMs"))
                .and_then(Value::as_u64)
                .context("set-keyframe: t_ms missing")?;
            let delete = payload
                .get("delete")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let value = if delete {
                None
            } else {
                Some(
                    payload
                        .get("value")
                        .cloned()
                        .context("set-keyframe: value missing")?,
                )
            };
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .set_keyframe(clip_id, path, t_ms, value)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("set-keyframe applied: {clip_id}.{path} @ {t_ms}ms")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "split-clip" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .context("split-clip: clip_id missing")?;
            let at_ms = payload
                .get("at_ms")
                .or_else(|| payload.get("atMs"))
                .and_then(Value::as_u64)
                .context("split-clip: at_ms missing")?;
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .split_clip(clip_id, at_ms)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("split-clip applied: {clip_id} @ {at_ms}ms")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "delete-clip" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .context("delete-clip: clip_id missing")?;
            let ripple = payload
                .get("ripple")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .delete_clip(clip_id, ripple)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("delete-clip applied: {clip_id} ripple={ripple}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "ripple-delete" => {
            let clip_id = payload
                .get("clip_id")
                .or_else(|| payload.get("clipId"))
                .and_then(Value::as_str)
                .context("ripple-delete: clip_id missing")?;
            let editor = active_editor_mut(workspace)?;
            let _ = editor.ripple_delete(clip_id).map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("ripple-delete applied: {clip_id}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "set-track-mute" => {
            let track_id = payload
                .get("track_id")
                .or_else(|| payload.get("trackId"))
                .and_then(Value::as_str)
                .context("set-track-mute: track_id missing")?;
            let muted = payload
                .get("muted")
                .and_then(Value::as_bool)
                .context("set-track-mute: muted missing")?;
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .set_track_mute(track_id, muted)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("set-track-mute applied: {track_id} -> {muted}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "set-track-solo" => {
            let track_id = payload
                .get("track_id")
                .or_else(|| payload.get("trackId"))
                .and_then(Value::as_str)
                .context("set-track-solo: track_id missing")?;
            let solo = payload
                .get("solo")
                .and_then(Value::as_bool)
                .context("set-track-solo: solo missing")?;
            let editor = active_editor_mut(workspace)?;
            let _ = editor
                .set_track_solo(track_id, solo)
                .map_err(anyhow::Error::msg)?;
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("set-track-solo applied: {track_id} -> {solo}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "insert-media" => {
            let raw_src = payload
                .get("src")
                .and_then(Value::as_str)
                .context("insert-media: src missing")?;
            let asset_kind = payload
                .get("asset_kind")
                .or_else(|| payload.get("kind"))
                .and_then(Value::as_str)
                .or_else(|| media_kind_from_path_str(raw_src))
                .context("insert-media: asset kind not supported")?;
            let begin_ms = payload
                .get("begin_ms")
                .or_else(|| payload.get("beginMs"))
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0);
            let duration_ms = payload
                .get("duration_ms")
                .or_else(|| payload.get("durationMs"))
                .and_then(Value::as_i64)
                .unwrap_or(3_000)
                .max(500);
            let normalized_src = normalize_asset_src(raw_src);
            let editor = active_editor_mut(workspace)?;
            let (track_kind, default_track_id, clip) = match asset_kind {
                "image" => (
                    "bg",
                    "media-bg",
                    json!({
                        "begin": begin_ms,
                        "end": begin_ms + duration_ms,
                        "params": {
                            "type": "image",
                            "src": normalized_src,
                            "fit": "cover",
                            "position": "center",
                        }
                    }),
                ),
                "video" => (
                    "video",
                    "media-video",
                    json!({
                        "begin": begin_ms,
                        "end": begin_ms + duration_ms,
                        "params": {
                            "src": normalized_src,
                            "from_ms": 0,
                            "fit": "cover",
                            "muted_in_record": true,
                            "x": 0,
                            "y": 0,
                            "w": 100,
                            "h": 100,
                            "radius": 0,
                        }
                    }),
                ),
                "audio" => (
                    "audio",
                    "media-audio",
                    json!({
                        "begin": begin_ms,
                        "end": begin_ms + duration_ms,
                        "params": {
                            "src": normalized_src,
                            "from_ms": 0,
                            "volume": 1.0,
                        }
                    }),
                ),
                other => anyhow::bail!("insert-media: unsupported asset kind {other}"),
            };
            let track_id = payload
                .get("track_id")
                .or_else(|| payload.get("trackId"))
                .and_then(Value::as_str)
                .unwrap_or(default_track_id);
            let track_src = track_source_for(track_kind)
                .with_context(|| format!("insert-media: track source missing for {track_kind}"))?;
            let entry = editor
                .insert_clip(track_kind, track_src, clip, Some(track_id))
                .map_err(anyhow::Error::msg)?;
            if asset_kind == "audio" {
                if let Some(path) = nf_asset_uri_to_path(&normalized_src) {
                    if let Err(err) = ensure_audio_peaks_cache(&normalized_src, &path) {
                        eprintln!("[NF-PEAKS] warm cache failed for {}: {err}", path.display());
                    }
                }
            }
            Ok(IpcOutcome::EvalScript {
                message: Some(format!(
                    "insert-media applied: {track_kind} {}",
                    entry.op_label
                )),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "switch-tab" => {
            let tab_id = payload
                .get("tab_id")
                .or_else(|| payload.get("tabId"))
                .and_then(Value::as_str)
                .context("switch-tab: tab_id missing")?;
            if !workspace.switch_tab(tab_id) {
                anyhow::bail!("switch-tab: tab not found: {tab_id}");
            }
            Ok(IpcOutcome::EvalScript {
                message: Some(format!("switch-tab applied: {tab_id}")),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: false,
            })
        }
        "open-tab" => {
            let path = payload
                .get("path")
                .and_then(Value::as_str)
                .context("open-tab: path missing")?;
            Ok(IpcOutcome::OpenTab {
                path: PathBuf::from(path),
            })
        }
        "get-state" => Ok(IpcOutcome::EvalScript {
            message: None,
            js: editor_js_call(
                "receiveState",
                &workspace_state_value(workspace, export_ui, plugins),
            ),
            mutation: false,
        }),
        "undo" => {
            let editor = active_editor_mut(workspace)?;
            let _ = editor.undo();
            Ok(IpcOutcome::EvalScript {
                message: Some("undo processed".to_string()),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "redo" => {
            let editor = active_editor_mut(workspace)?;
            let _ = editor.redo();
            Ok(IpcOutcome::EvalScript {
                message: Some("redo processed".to_string()),
                js: editor_js_call(
                    "receiveSourceUpdate",
                    &workspace_state_value(workspace, export_ui, plugins),
                ),
                mutation: true,
            })
        }
        "drag-window" => Ok(IpcOutcome::DragWindow),
        "menu-open" => Ok(IpcOutcome::MenuOpen),
        "menu-save" => Ok(IpcOutcome::MenuSave),
        "menu-template" => {
            let template_name = payload
                .get("template_name")
                .or_else(|| payload.get("template"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .context("menu-template: template_name missing")?;
            Ok(IpcOutcome::MenuTemplate {
                template_name: template_name.to_string(),
            })
        }
        "verify-media-report" => Ok(IpcOutcome::VerifyMediaReport(pretty_json(&payload))),
        "verify-select-report" => Ok(IpcOutcome::VerifySelectReport(payload)),
        "verify-zoom-report" => Ok(IpcOutcome::VerifyZoomReport(payload)),
        "verify-undo-report" => Ok(IpcOutcome::VerifyUndoReport(payload)),
        "export-mp4" => {
            if cfg!(all(unix, not(target_vendor = "apple"))) {
                anyhow::bail!(linux_export_error_message());
            }
            let duration_s = payload
                .get("duration_s")
                .and_then(|v| v.as_f64())
                .unwrap_or(5.0);
            let parallel = payload
                .get("parallel")
                .map(|v| {
                    let raw = v
                        .as_u64()
                        .context("export-mp4: parallel must be a positive integer")?;
                    usize::try_from(raw).context("export-mp4: parallel out of usize range")
                })
                .transpose()?;
            let resolution = payload
                .get("resolution")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            if let Some(path) = payload
                .get("path")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
            {
                Ok(IpcOutcome::StartExport {
                    path,
                    duration_s,
                    parallel,
                    resolution,
                })
            } else {
                Ok(IpcOutcome::StartExportDialog {
                    duration_s,
                    parallel,
                    resolution,
                })
            }
        }
        "verify-export-progress" => {
            let duration_s = payload
                .get("duration_s")
                .and_then(Value::as_f64)
                .unwrap_or(3.0)
                .max(0.5);
            let path = payload
                .get("path")
                .and_then(Value::as_str)
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("tmp/v1.64-verify-export.mp4"));
            Ok(IpcOutcome::StartSimulatedExport { path, duration_s })
        }
        other => anyhow::bail!("unknown ipc kind: {other}"),
    }
}

// v1.44 · 老 ffmpeg avfoundation 屏幕录制路径(run_ffmpeg_export / ffmpeg_available)
// 已砍 · 改为走 nf_recorder::run_export_from_source · runtime 驱动 · CARenderer
// + VideoToolbox · 脱屏录制 · 和 preview 像素级一致(ADR-064)。
// 参考历史:v1.22 1179900b / v1.22.1 294316ca 的 run_ffmpeg_export 实现 ·
// 通过 git log 可查 · 若特殊场景需回退可 cherry-pick 回来。
#[cfg(target_vendor = "apple")]
fn run_recorder_export(
    source_path: &std::path::Path,
    out: &std::path::Path,
    duration_s: f64,
    fps: u32,
    parallel: Option<usize>,
    resolution_override: Option<&str>,
) -> Result<u64> {
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).context("mkdir parent")?;
    }
    if fps != 30 && fps != 60 {
        anyhow::bail!("invalid --fps {fps} (expected 30 or 60)");
    }
    let resolution_override = resolution_override
        .map(|raw| {
            nf_recorder::ExportResolution::parse_str(raw)
                .ok_or_else(|| anyhow::anyhow!("invalid --resolution {raw} (expected 1080p or 4k)"))
        })
        .transpose()?;
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
                fps,
                parallel,
                resolution_override,
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

#[cfg(not(target_vendor = "apple"))]
fn run_recorder_export(
    source_path: &std::path::Path,
    out: &std::path::Path,
    duration_s: f64,
    fps: u32,
    parallel: Option<usize>,
    resolution_override: Option<&str>,
) -> Result<u64> {
    let _ = (
        source_path,
        out,
        duration_s,
        fps,
        parallel,
        resolution_override,
    );
    anyhow::bail!("nf-recorder export is only available on Apple targets")
}

fn format_parallel_override(parallel: Option<usize>) -> String {
    parallel
        .map(|n| n.to_string())
        .unwrap_or_else(|| "auto".to_string())
}

fn format_resolution_override(resolution: Option<&str>) -> String {
    resolution.unwrap_or("source/default").to_string()
}

fn default_export_filename(source_arg: &str, resolution: Option<&str>) -> String {
    let stem = std::path::Path::new(source_arg)
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("nextframe-export");
    let suffix = resolution.unwrap_or("auto");
    format!("{stem}-{suffix}.mp4")
}

/// Capture the nf-shell window region via `screencapture -R x,y,w,h`.
/// Rationale: WKWebView does not expose `takeSnapshot` through wry, SVG
/// foreignObject rasterisation hits WebKit's tainted-canvas wall for mixed
/// CSS, and pulling in `core-graphics`/`cocoa` for `CGWindowListCreateImage`
/// just for screenshots would double the binary. `screencapture` is present
/// on every macOS (no brew, no permissions if invoked by the app itself on
/// its own window region) and gives us a 1:1 PNG of what the user sees.
/// The user-facing contract remains "one CLI flag → a PNG on disk".
#[cfg(target_vendor = "apple")]
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

#[cfg(target_vendor = "apple")]
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
    verify_undo_mode: bool,
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
    let verify_undo_flag = if verify_undo_mode { "true" } else { "false" };
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
window.nfExport = window.nfExport || {{}};
window.nfExport.state = window.nfExport.state || {{ parallel4k: true }};
window.nfExport.exportDurationSeconds = function() {{
  try {{
    if (window.__nf && typeof window.__nf.getDuration === 'function') {{
      var ms = Number(window.__nf.getDuration());
      if (isFinite(ms) && ms > 0) return Number((ms / 1000).toFixed(3));
    }}
  }} catch (_err) {{}}
  try {{
    if (window.__nf_handle && typeof window.__nf_handle.getState === 'function') {{
      var state = window.__nf_handle.getState();
      var durationMs = state && Number(state.duration_ms);
      if (isFinite(durationMs) && durationMs > 0) return Number((durationMs / 1000).toFixed(3));
    }}
  }} catch (_err) {{}}
  return 5.0;
}};
window.nfExport.ensureStyle = function() {{
  if (document.getElementById('nf-export-style')) return;
  var style = document.createElement('style');
  style.id = 'nf-export-style';
  style.textContent =
    '.nf-export-toggle{{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.82);font:600 12px/1 -apple-system,\"SF Pro\",sans-serif;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease;}}' +
    '.nf-export-toggle:hover{{background:rgba(255,255,255,0.10);color:#fff;}}' +
    '.nf-export-toggle[data-active=\"1\"]{{background:rgba(52,211,153,0.16);border-color:rgba(52,211,153,0.42);color:#6ee7b7;}}' +
    '.nf-export-toggle[data-active=\"0\"]{{background:rgba(249,115,22,0.14);border-color:rgba(249,115,22,0.34);color:#fdba74;}}';
  document.head.appendChild(style);
}};
window.nfExport.render = function() {{
  var toggle = document.getElementById('nf-export-toggle');
  if (!toggle) return;
  var active = !!(window.nfExport.state && window.nfExport.state.parallel4k);
  toggle.dataset.active = active ? '1' : '0';
  toggle.textContent = active ? '4K 并行' : '4K 串行';
  toggle.title = active ? '当前导出：4K 并行 (parallel=4)' : '当前导出：4K 串行 (parallel=1)';
}};
window.nfExport.ensureUi = function() {{
  window.nfExport.ensureStyle();
  var topbar = document.querySelector('.topbar');
  if (!topbar) return;
  var exportBtn = topbar.querySelector('.btn-primary');
  if (!exportBtn) return;
  var toggle = document.getElementById('nf-export-toggle');
  if (!toggle) {{
    toggle = document.createElement('button');
    toggle.id = 'nf-export-toggle';
    toggle.type = 'button';
    toggle.className = 'nf-export-toggle';
    toggle.addEventListener('click', function(ev) {{
      ev.preventDefault();
      ev.stopPropagation();
      window.nfExport.state.parallel4k = !window.nfExport.state.parallel4k;
      window.nfExport.render();
    }});
    exportBtn.parentElement.insertBefore(toggle, exportBtn);
  }}
  if (!exportBtn.__nf_export_wired) {{
    exportBtn.__nf_export_wired = true;
    exportBtn.addEventListener('click', function(ev) {{
      ev.preventDefault();
      ev.stopPropagation();
      window.ipc.postMessage(JSON.stringify({{
        kind: 'export-mp4',
        payload: {{
          duration_s: window.nfExport.exportDurationSeconds(),
          resolution: '4k',
          parallel: window.nfExport.state.parallel4k ? 4 : 1
        }}
      }}));
    }});
  }}
  window.nfExport.render();
}};
if (document.readyState === 'loading') {{
  document.addEventListener('DOMContentLoaded', function() {{
    window.setTimeout(function() {{
      if (window.nfExport && typeof window.nfExport.ensureUi === 'function') {{
        window.nfExport.ensureUi();
      }}
    }}, 0);
  }});
}} else {{
  window.setTimeout(function() {{
    if (window.nfExport && typeof window.nfExport.ensureUi === 'function') {{
      window.nfExport.ensureUi();
    }}
  }}, 0);
}}
"#,
        verify_zoom = verify_zoom_flag,
    );
    let verify_tab_source_str = serde_json::to_string(
        &repo_root_path()
            .join("demo/real-audio-narration.json")
            .display()
            .to_string(),
    )
    .unwrap_or_else(|_| "\"demo/real-audio-narration.json\"".to_string());
    let export_supported_flag = if cfg!(all(unix, not(target_vendor = "apple"))) {
        "false"
    } else {
        "true"
    };
    let v164_shell_block = format!(
        r#"
window.__NF_VERIFY_TAB_SOURCE__ = {verify_tab_source};
window.__NF_EXPORT_SUPPORTED__ = {export_supported};
(function() {{
  var api = window.__nf_editor = window.__nf_editor || {{}};
  function esc(value) {{
    return String(value == null ? '' : value).replace(/[&<>"]/g, function(ch) {{
      return ch === '&' ? '&amp;' : (ch === '<' ? '&lt;' : (ch === '>' ? '&gt;' : '&quot;'));
    }});
  }}
  function ensureStyle() {{
    if (document.getElementById('nf-v164-style')) return;
    var style = document.createElement('style');
    style.id = 'nf-v164-style';
    style.textContent =
      '#nf-tabbar{{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}}' +
      '#nf-tabbar-list{{display:flex;align-items:center;gap:8px;min-width:0;overflow:auto;scrollbar-width:none;}}' +
      '#nf-tabbar-list::-webkit-scrollbar{{display:none;}}' +
      '.nf-tab-chip{{display:inline-flex;align-items:center;gap:8px;max-width:240px;height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.72);font:600 12px/1.1 var(--font-sans,-apple-system,sans-serif);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease;}}' +
      '.nf-tab-chip:hover{{transform:translateY(-1px);background:rgba(255,255,255,0.08);color:#fff;}}' +
      '.nf-tab-chip.is-active{{background:rgba(167,139,250,0.16);border-color:rgba(167,139,250,0.42);color:#f5f3ff;box-shadow:0 0 0 1px rgba(167,139,250,0.14);}}' +
      '.nf-tab-template{{height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(94,234,212,0.28);background:rgba(94,234,212,0.08);color:#d5fffb;font:600 11px/1.1 var(--font-sans,-apple-system,sans-serif);cursor:pointer;letter-spacing:0.04em;text-transform:uppercase;}}' +
      '.nf-tab-template:hover{{background:rgba(94,234,212,0.16);}}' +
      '.nf-tab-plus{{width:32px;height:32px;border-radius:999px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.72);font:700 18px/1 var(--font-mono,"SF Mono",monospace);cursor:pointer;}}' +
      '.nf-tab-plus:hover{{background:rgba(255,255,255,0.08);color:#fff;}}' +
      '#nf-media-bin{{width:180px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.05);background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));}}' +
      '#nf-media-bin-head{{height:22px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid rgba(255,255,255,0.04);font:600 9px/1 var(--font-mono,"SF Mono",monospace);letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.46);}}' +
      '#nf-media-bin-list{{display:flex;flex-direction:column;gap:8px;padding:10px;overflow:auto;min-height:0;}}' +
      '.nf-media-item{{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.84);cursor:grab;text-align:left;}}' +
      '.nf-media-item:active{{cursor:grabbing;}}' +
      '.nf-media-item[data-kind="image"]{{border-color:rgba(56,189,248,0.26);}}' +
      '.nf-media-item[data-kind="video"]{{border-color:rgba(167,139,250,0.30);}}' +
      '.nf-media-item[data-kind="audio"]{{border-color:rgba(52,211,153,0.30);}}' +
      '.nf-media-item-k{{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 10px/1 var(--font-mono,"SF Mono",monospace);background:rgba(255,255,255,0.08);color:#fff;flex-shrink:0;}}' +
      '.nf-media-item-text{{display:flex;flex-direction:column;min-width:0;gap:2px;}}' +
      '.nf-media-item-name{{font:600 12px/1.2 var(--font-sans,-apple-system,sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}' +
      '.nf-media-item-meta{{font:500 10px/1.2 var(--font-mono,"SF Mono",monospace);color:rgba(255,255,255,0.46);text-transform:uppercase;letter-spacing:0.06em;}}' +
      '.tl-body[data-media-drop="1"] .tl-lanes{{outline:1px dashed rgba(167,139,250,0.44);outline-offset:-8px;}}' +
      '#nf-safe-area{{position:absolute;left:5%;top:5%;width:90%;height:90%;border:1px dashed rgba(255,255,255,0.38);border-radius:14px;box-shadow:0 0 0 1px rgba(0,0,0,0.18) inset;pointer-events:none;z-index:180;}}' +
      '#nf-safe-area::before{{content:"SAFE 16:9";position:absolute;top:-10px;right:10px;padding:0 6px;background:rgba(5,7,11,0.86);color:rgba(255,255,255,0.58);font:600 9px/1.6 var(--font-mono,"SF Mono",monospace);letter-spacing:0.08em;border-radius:999px;}}' +
      '#nf-export-progress{{display:inline-flex;align-items:center;gap:10px;min-width:180px;padding:0 12px;height:34px;border-radius:999px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);}}' +
      '#nf-export-progress-label{{font:600 11px/1 var(--font-mono,"SF Mono",monospace);color:rgba(255,255,255,0.72);white-space:nowrap;}}' +
      '#nf-export-progress-track{{position:relative;flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;}}' +
      '#nf-export-progress-fill{{position:absolute;left:0;top:0;bottom:0;width:0%;background:linear-gradient(90deg,#34d399,#60a5fa);border-radius:999px;transition:width .12s linear;}}';
    document.head.appendChild(style);
  }}

  function sourceMeta() {{
    return (api.state && api.state.source && api.state.source.meta) || (window.__NF_SOURCE__ && window.__NF_SOURCE__.meta) || {{}};
  }}

  window.__nf_render_source_badge = function() {{
    ensureStyle();
    var meta = sourceMeta();
    var name = meta.name || '';
    var path = (api.state && api.state.source_path) || window.__NF_SOURCE_PATH__ || '';
    var tracks = (api.state && api.state.source && Array.isArray(api.state.source.tracks)) ? api.state.source.tracks.length : ((window.__NF_SOURCE__ && Array.isArray(window.__NF_SOURCE__.tracks)) ? window.__NF_SOURCE__.tracks.length : 0);
    var el = document.getElementById('nf-source-badge');
    if (!el) {{
      el = document.createElement('div');
      el.id = 'nf-source-badge';
      el.style.cssText =
        'position:fixed;top:60px;right:14px;z-index:9998;' +
        'background:rgba(0,0,0,0.55);backdrop-filter:blur(12px);' +
        'border:1px solid rgba(167,139,250,0.30);border-radius:8px;' +
        'padding:6px 12px;color:rgba(255,255,255,0.85);' +
        'font:500 11px/1.5 "SF Mono",Menlo,monospace;' +
        'max-width:420px;pointer-events:auto;user-select:text';
      document.body.appendChild(el);
    }}
    el.innerHTML =
      '<div style="color:#a78bfa;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:9px;margin-bottom:2px">Source · Live JSON</div>' +
      '<div style="color:#fff;font-weight:600;font-size:12px">' + (name ? esc(name) : '(untitled)') + '</div>' +
      '<div style="color:rgba(255,255,255,0.55);font-size:10px;margin-top:2px">' + tracks + ' tracks · ' + esc(path) + '</div>';
  }};
  window.__nf_install_source_badge = window.__nf_render_source_badge;

  api.defaultInsertDurationMs = function(item) {{
    var kind = item && item.asset_kind;
    if (kind === 'audio') return 2500;
    return 3000;
  }};

  api.insertMediaItem = function(item, beginMs) {{
    if (!item) return;
    api.send('insert-media', {{
      src: item.src || item.path || '',
      asset_kind: item.asset_kind || item.kind || '',
      begin_ms: Math.max(0, Math.round(beginMs || 0)),
      duration_ms: api.defaultInsertDurationMs(item)
    }});
  }};

  api.ensureTabs = function() {{
    ensureStyle();
    var topbar = document.querySelector('.topbar');
    if (!topbar) return null;
    var shell = document.getElementById('nf-tabbar');
    if (!shell) {{
      shell = document.createElement('div');
      shell.id = 'nf-tabbar';
      shell.innerHTML = '<div id="nf-tabbar-list"></div><button type="button" class="nf-tab-template" title="Create from template">Template</button><button type="button" class="nf-tab-plus" title="Open source.json">+</button>';
      var templateBtn = shell.querySelector('.nf-tab-template');
      templateBtn.addEventListener('click', function(ev) {{
        ev.preventDefault();
        ev.stopPropagation();
        var picked = window.prompt ? window.prompt('Template name', 'basic-slideshow') : 'basic-slideshow';
        if (picked == null) return;
        picked = String(picked).trim();
        if (!picked) return;
        api.send('menu-template', {{ template_name: picked }});
      }});
      var plus = shell.querySelector('.nf-tab-plus');
      plus.addEventListener('click', function(ev) {{
        ev.preventDefault();
        ev.stopPropagation();
        api.send('menu-open', {{}});
      }});
      var spacer = topbar.querySelector('.spacer');
      if (spacer) topbar.insertBefore(shell, spacer);
      else topbar.appendChild(shell);
    }}
    return shell;
  }};

  api.renderTabs = function() {{
    var shell = api.ensureTabs();
    if (!shell) return;
    var list = document.getElementById('nf-tabbar-list');
    if (!list) return;
    var tabs = api.state && Array.isArray(api.state.tabs) ? api.state.tabs : [];
    list.innerHTML = tabs.map(function(tab) {{
      return '<button type="button" class="nf-tab-chip' + (tab.active ? ' is-active' : '') + '" data-tab-id="' + esc(tab.id) + '" title="' + esc(tab.path || '') + '">' + esc(tab.title || 'source.json') + '</button>';
    }}).join('');
    var nodes = list.querySelectorAll('.nf-tab-chip');
    for (var i = 0; i < nodes.length; i++) {{
      nodes[i].addEventListener('click', function(ev) {{
        ev.preventDefault();
        ev.stopPropagation();
        api.send('switch-tab', {{ tab_id: this.dataset.tabId }});
      }});
    }}
  }};

  api.ensureMediaBin = function() {{
    ensureStyle();
    var body = document.querySelector('.tl-body');
    if (!body) return null;
    var bin = document.getElementById('nf-media-bin');
    if (!bin) {{
      bin = document.createElement('aside');
      bin.id = 'nf-media-bin';
      bin.innerHTML = '<div id="nf-media-bin-head">Media Bin</div><div id="nf-media-bin-list"></div>';
      var labels = body.querySelector('.tl-labels');
      if (labels) body.insertBefore(bin, labels);
      else body.insertBefore(bin, body.firstChild);
    }}
    if (!body.__nf_media_drop_wired) {{
      body.__nf_media_drop_wired = true;
      var lanes = body.querySelector('.tl-lanes');
      if (lanes) {{
        lanes.addEventListener('dragover', function(ev) {{
          if (!ev.dataTransfer) return;
          ev.preventDefault();
          body.dataset.mediaDrop = '1';
        }});
        lanes.addEventListener('dragleave', function() {{
          body.dataset.mediaDrop = '0';
        }});
        lanes.addEventListener('drop', function(ev) {{
          body.dataset.mediaDrop = '0';
          if (!ev.dataTransfer) return;
          var raw = ev.dataTransfer.getData('application/x-nextframe-asset');
          if (!raw) return;
          ev.preventDefault();
          var item = null;
          try {{ item = JSON.parse(raw); }} catch (_err) {{ item = null; }}
          if (!item) return;
          var lanes = window.__nf_timeline_lanes ? window.__nf_timeline_lanes() : this;
          var rect = lanes.getBoundingClientRect();
          var durationMs = window.__nf_timeline_duration_ms ? window.__nf_timeline_duration_ms(lanes) : 60000;
          var beginMs = window.__nf_timeline_px_to_ms
            ? window.__nf_timeline_px_to_ms(ev.clientX - rect.left, lanes, durationMs)
            : 0;
          api.insertMediaItem(item, beginMs);
        }});
      }}
    }}
    return bin;
  }};

  api.renderMediaBin = function() {{
    var bin = api.ensureMediaBin();
    if (!bin) return;
    var list = document.getElementById('nf-media-bin-list');
    if (!list) return;
    var items = api.state && Array.isArray(api.state.media_bin) ? api.state.media_bin : [];
    list.innerHTML = items.map(function(item) {{
      var kind = item.asset_kind || 'asset';
      var glyph = kind === 'image' ? 'IMG' : (kind === 'video' ? 'VID' : 'AUD');
      return '<button type="button" class="nf-media-item" draggable="true" data-asset-index="' + String(items.indexOf(item)) + '" data-kind="' + esc(kind) + '">' +
        '<span class="nf-media-item-k">' + glyph + '</span>' +
        '<span class="nf-media-item-text"><span class="nf-media-item-name">' + esc(item.name || 'asset') + '</span><span class="nf-media-item-meta">' + esc(kind) + '</span></span>' +
      '</button>';
    }}).join('');
    var nodes = list.querySelectorAll('.nf-media-item');
    for (var i = 0; i < nodes.length; i++) {{
      (function(index) {{
        var node = nodes[index];
        var item = items[index];
        node.addEventListener('dragstart', function(ev) {{
          if (!ev.dataTransfer || !item) return;
          ev.dataTransfer.effectAllowed = 'copy';
          ev.dataTransfer.setData('application/x-nextframe-asset', JSON.stringify(item));
        }});
        node.addEventListener('dblclick', function() {{
          api.insertMediaItem(item, 0);
        }});
      }})(i);
    }}
  }};

  api.ensureSafeArea = function() {{
    var stage = document.getElementById('nf-stage');
    if (!stage) return null;
    var overlay = document.getElementById('nf-safe-area');
    if (!overlay) {{
      overlay = document.createElement('div');
      overlay.id = 'nf-safe-area';
      overlay.dataset.visible = '1';
      stage.appendChild(overlay);
    }}
    return overlay;
  }};

  api.installClipMoveSupport = function() {{
    if (api.clip_move_wired) return;
    api.clip_move_wired = true;
    api.clip_drag = null;
    document.addEventListener('mousemove', function(ev) {{
      var drag = api.clip_drag;
      if (!drag) return;
      ev.preventDefault();
      var rect = drag.lanes.getBoundingClientRect();
      var rawLeft = ev.clientX - rect.left - drag.grabOffsetPx;
      var beginMs = window.__nf_timeline_px_to_ms
        ? window.__nf_timeline_px_to_ms(rawLeft, drag.lanes, drag.durationMs)
        : drag.beginMs;
      beginMs = Math.max(0, Math.min(drag.durationMs - drag.clipDurationMs, beginMs));
      beginMs = api.snapBeginForDrag(drag, beginMs);
      drag.currentBeginMs = beginMs;
      drag.moved = drag.moved || Math.abs(beginMs - drag.beginMs) >= 1;
      drag.bar.style.left = Math.round(window.__nf_timeline_ms_to_px(beginMs, drag.lanes, drag.durationMs)) + 'px';
      drag.bar.style.width = Math.max(2, Math.round(window.__nf_timeline_bar_width_px(beginMs, beginMs + drag.clipDurationMs, drag.lanes, drag.durationMs))) + 'px';
      drag.bar.style.zIndex = '90';
      drag.bar.style.transform = 'translateY(-2px)';
    }}, {{ passive: false }});
    document.addEventListener('mouseup', function() {{
      var drag = api.clip_drag;
      if (!drag) return;
      drag.bar.style.zIndex = '';
      drag.bar.style.transform = '';
      if (drag.moved) {{
        api.send('move-clip', {{ clip_id: drag.clipId, begin_ms: Math.round(drag.currentBeginMs || drag.beginMs) }});
      }}
      api.clip_drag = null;
    }});
  }};

  api.snapBeginForDrag = function(drag, desiredBeginMs) {{
    var bestBeginMs = desiredBeginMs;
    var bestDiff = 5.0001;
    var candidateEndMs = desiredBeginMs + drag.clipDurationMs;
    var others = drag.row ? drag.row.querySelectorAll('.nf-tl-bar') : [];
    for (var i = 0; i < others.length; i++) {{
      var other = others[i];
      if (other === drag.bar) continue;
      var otherBegin = parseFloat(other.dataset.nfBeginMs || '0');
      var otherEnd = parseFloat(other.dataset.nfEndMs || '0');
      var checks = [
        {{ targetBeginMs: otherEnd, edgePx: window.__nf_timeline_ms_to_px(otherEnd, drag.lanes, drag.durationMs), candidatePx: window.__nf_timeline_ms_to_px(desiredBeginMs, drag.lanes, drag.durationMs) }},
        {{ targetBeginMs: otherBegin - drag.clipDurationMs, edgePx: window.__nf_timeline_ms_to_px(otherBegin, drag.lanes, drag.durationMs), candidatePx: window.__nf_timeline_ms_to_px(candidateEndMs, drag.lanes, drag.durationMs) }},
        {{ targetBeginMs: otherBegin, edgePx: window.__nf_timeline_ms_to_px(otherBegin, drag.lanes, drag.durationMs), candidatePx: window.__nf_timeline_ms_to_px(desiredBeginMs, drag.lanes, drag.durationMs) }},
        {{ targetBeginMs: otherEnd - drag.clipDurationMs, edgePx: window.__nf_timeline_ms_to_px(otherEnd, drag.lanes, drag.durationMs), candidatePx: window.__nf_timeline_ms_to_px(candidateEndMs, drag.lanes, drag.durationMs) }}
      ];
      for (var j = 0; j < checks.length; j++) {{
        var check = checks[j];
        var diff = Math.abs(check.edgePx - check.candidatePx);
        if (diff <= 5 && diff < bestDiff) {{
          bestDiff = diff;
          bestBeginMs = Math.max(0, Math.min(drag.durationMs - drag.clipDurationMs, check.targetBeginMs));
        }}
      }}
    }}
    return bestBeginMs;
  }};

  api.wireClipMove = function() {{
    api.installClipMoveSupport();
    var bars = document.querySelectorAll('.nf-tl-bar');
    for (var i = 0; i < bars.length; i++) {{
      var bar = bars[i];
      if (bar.__nf_move_wired) continue;
      bar.__nf_move_wired = true;
      bar.addEventListener('mousedown', function(ev) {{
        if (ev.button !== 0) return;
        var lanes = window.__nf_timeline_lanes ? window.__nf_timeline_lanes() : document.querySelector('.tl-lanes');
        var row = this.parentElement;
        if (!lanes || !row) return;
        var rect = this.getBoundingClientRect();
        var beginMs = parseFloat(this.dataset.nfBeginMs || '0');
        var endMs = parseFloat(this.dataset.nfEndMs || '0');
        api.clip_drag = {{
          clipId: this.dataset.clipId || '',
          bar: this,
          row: row,
          lanes: lanes,
          beginMs: beginMs,
          currentBeginMs: beginMs,
          moved: false,
          clipDurationMs: Math.max(100, endMs - beginMs),
          durationMs: window.__nf_timeline_duration_ms ? window.__nf_timeline_duration_ms(lanes) : 60000,
          grabOffsetPx: ev.clientX - rect.left
        }};
      }});
    }}
  }};

  api.renderV164 = function() {{
    api.renderTabs();
    api.renderMediaBin();
    api.ensureSafeArea();
    if (window.__nf_render_source_badge) window.__nf_render_source_badge();
    api.wireClipMove();
    if (window.nfExport && typeof window.nfExport.updateState === 'function') {{
      window.nfExport.updateState(api.state && api.state.export);
    }}
  }};

  api.receiveExportState = function(exportState) {{
    api.state = api.state || {{}};
    api.state.export = exportState || {{ active:false, progress:0, label:'Idle' }};
    if (window.nfExport && typeof window.nfExport.updateState === 'function') {{
      window.nfExport.updateState(api.state.export);
    }}
  }};

  if (window.nfExport && !window.nfExport.__v164_patch) {{
    window.nfExport.__v164_patch = true;
    var baseEnsureUi = window.nfExport.ensureUi;
    window.nfExport.mountProgress = function() {{
      if (typeof baseEnsureUi === 'function') baseEnsureUi();
      ensureStyle();
      var topbar = document.querySelector('.topbar');
      if (!topbar) return null;
      var exportBtn = topbar.querySelector('.btn-primary');
      if (!exportBtn || !exportBtn.parentElement) return null;
      var pill = document.getElementById('nf-export-progress');
      if (!pill) {{
        pill = document.createElement('div');
        pill.id = 'nf-export-progress';
        pill.innerHTML = '<span id="nf-export-progress-label">Idle</span><span id="nf-export-progress-track"><span id="nf-export-progress-fill"></span></span>';
        exportBtn.parentElement.insertBefore(pill, exportBtn);
      }}
      return pill;
    }};
    window.nfExport.updateState = function(exportState) {{
      var pill = window.nfExport.mountProgress();
      if (!pill) return;
      var label = document.getElementById('nf-export-progress-label');
      var fill = document.getElementById('nf-export-progress-fill');
      var state = exportState || {{ active:false, progress:0, label:'Idle' }};
      var progress = Math.max(0, Math.min(100, Number(state.progress) || 0));
      if (label) label.textContent = state.label || (state.active ? 'Exporting' : 'Idle');
      if (fill) fill.style.width = progress.toFixed(1) + '%';
      pill.dataset.active = state.active ? '1' : '0';
    }};
    window.nfExport.ensureUi = function() {{
      if (typeof baseEnsureUi === 'function') baseEnsureUi();
      window.nfExport.updateState(api.state && api.state.export);
    }};
  }}

  if (!api.__v164_receive_state_base) {{
    api.__v164_receive_state_base = api.receiveState;
    api.receiveState = function(state) {{
      if (state && state.track_sources) window.__NF_TRACKS__ = state.track_sources;
      if (state && state.source_path) window.__NF_SOURCE_PATH__ = state.source_path;
      api.__v164_receive_state_base(state);
      api.renderV164();
    }};
  }}
  if (!api.__v164_receive_source_base) {{
    api.__v164_receive_source_base = api.receiveSourceUpdate;
    api.receiveSourceUpdate = function(state) {{
      if (state && state.track_sources) window.__NF_TRACKS__ = state.track_sources;
      if (state && state.source_path) window.__NF_SOURCE_PATH__ = state.source_path;
      api.__v164_receive_source_base(state);
      window.setTimeout(api.renderV164, 80);
    }};
  }}
  if (!api.__v164_decorate_base) {{
    api.__v164_decorate_base = api.decorateTimeline;
    api.decorateTimeline = function() {{
      api.__v164_decorate_base();
      api.renderV164();
    }};
  }}

  api.finishVerifySelect = function() {{
    var stage = document.getElementById('nf-stage');
    var titleApplied = !!(stage && stage.textContent && stage.textContent.indexOf('VerifyTitle') !== -1);
    var fieldCount = document.querySelectorAll('[data-nf-inspector-field]').length;
    var keyframeButtonCount = document.querySelectorAll('[data-nf-keyframe]').length;
    var selectedBar = document.querySelector('.nf-tl-bar.selected');
    var undoSize = api.state && typeof api.state.undo_stack_size === 'number' ? api.state.undo_stack_size : -1;
    var waveform = window.__nf_waveform_metrics ? window.__nf_waveform_metrics() : null;
    var waveformOk = !waveform || !waveform.has_audio_bar || (
      waveform.waveform_status === 'ready' &&
      waveform.peak_count >= 200 &&
      waveform.mapping_pass === true
    );
    var safeArea = document.getElementById('nf-safe-area');
    var verify = api.__v164_verify_metrics || {{}};
    if (typeof __nf_snapshot_dom === 'function') __nf_snapshot_dom('verify_finish');
    api.send('verify-select-report', {{
      selected_clip_id: api.state && api.state.selection ? api.state.selection.clip_id || null : null,
      inspector_field_count: fieldCount,
      keyframe_button_count: keyframeButtonCount,
      title_applied: titleApplied,
      selected_class: !!selectedBar,
      undo_stack_size: undoSize,
      waveform: waveform,
      waveform_ok: waveformOk,
      three_panel_layout: !!document.querySelector('.preview-panel') && !!document.querySelector('.timeline') && !!document.getElementById('nf-inspector-panel') && !!document.body.classList.contains('nf-editor-open'),
      mount_trace: window.__nf_mount_trace || [],
      dom_trace: window.__nf_dom_trace || [],
      media_bin_visible: !!document.getElementById('nf-media-bin'),
      tab_bar_visible: !!document.getElementById('nf-tabbar'),
      safe_area_visible: !!safeArea && safeArea.dataset.visible === '1',
      vp1_media_bin: verify.vp1_media_bin || false,
      vp2_multi_tab: verify.vp2_multi_tab || false,
      vp3_export_progress: verify.vp3_export_progress || false,
      vp4_snap: verify.vp4_snap || false,
      vp5_safe_area: verify.vp5_safe_area || false,
      verify_v164_error: verify.error || null,
      ok: fieldCount > 0 &&
        titleApplied &&
        !!selectedBar &&
        undoSize >= 1 &&
        waveformOk &&
        !!(verify.vp1_media_bin) &&
        !!(verify.vp2_multi_tab) &&
        !!(verify.vp3_export_progress) &&
        !!(verify.vp4_snap) &&
        !!(verify.vp5_safe_area)
    }});
  }};

  api.runVerifySelect = function() {{
    if (!window.__NF_VERIFY_SELECT__ || api.verify_select_started) return;
    api.verify_select_started = true;
    window.setTimeout(async function() {{
      var verify = {{
        vp1_media_bin: false,
        vp2_multi_tab: false,
        vp3_export_progress: false,
        vp4_snap: false,
        vp5_safe_area: false,
        error: null
      }};
      try {{
        await api.waitFor(function() {{
          return api.state && api.state.source && Array.isArray(api.state.source.tracks);
        }}, 12000);

        var bars = document.querySelectorAll('.nf-tl-bar');
        var target = bars.length > 1 ? bars[1] : null;
        if (target) target.click();
        await api.sleep(350);
        var titleInput = document.querySelector('#nf-inspector-body [data-nf-path="title"]');
        if (titleInput) {{
          titleInput.value = 'VerifyTitle';
          titleInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
        }}
        await api.sleep(2200);
        if (document.querySelector('.nf-tl-bar-audio')) {{
          try {{
            await api.waitFor(function() {{
              var metrics = window.__nf_waveform_metrics ? window.__nf_waveform_metrics() : null;
              return metrics && metrics.waveform_status === 'ready';
            }}, 8000);
          }} catch (_err) {{}}
        }}

        verify.vp5_safe_area = !!document.getElementById('nf-safe-area');

        var baseSourcePath = api.state && api.state.source_path;
        api.send('open-tab', {{ path: window.__NF_VERIFY_TAB_SOURCE__ }});
        await api.waitFor(function() {{
          return api.state && Array.isArray(api.state.tabs) && api.state.tabs.length >= 2;
        }}, 12000);
        var secondTab = null;
        var firstTab = null;
        for (var ti = 0; ti < api.state.tabs.length; ti++) {{
          var tab = api.state.tabs[ti];
          if (tab.path === baseSourcePath) firstTab = tab;
          if (tab.path !== baseSourcePath) secondTab = tab;
        }}
        if (secondTab) {{
          api.send('switch-tab', {{ tab_id: secondTab.id }});
          await api.waitFor(function() {{
            return api.state && api.state.source_path === secondTab.path;
          }}, 12000);
          verify.vp2_multi_tab = api.state && api.state.source_path === secondTab.path;
          if (firstTab) {{
            api.send('switch-tab', {{ tab_id: firstTab.id }});
            await api.waitFor(function() {{
              return api.state && api.state.source_path === firstTab.path;
            }}, 12000);
          }}
        }}

        var mediaItems = api.state && Array.isArray(api.state.media_bin) ? api.state.media_bin : [];
        var imageItem = null;
        for (var mi = 0; mi < mediaItems.length; mi++) {{
          if (mediaItems[mi] && mediaItems[mi].asset_kind === 'image') {{
            imageItem = mediaItems[mi];
            break;
          }}
        }}
        function importedImageClips() {{
          var out = [];
          var tracks = api.state && api.state.source && Array.isArray(api.state.source.tracks) ? api.state.source.tracks : [];
          for (var ti = 0; ti < tracks.length; ti++) {{
            var track = tracks[ti] || {{}};
            var clips = Array.isArray(track.clips) ? track.clips : [];
            for (var ci = 0; ci < clips.length; ci++) {{
              var clip = clips[ci] || {{}};
              if (track.kind === 'bg' &&
                  clip.params &&
                  clip.params.type === 'image' &&
                  imageItem &&
                  clip.params.src === imageItem.src) {{
                out.push(clip);
              }}
            }}
          }}
          return out;
        }}
        if (imageItem) {{
          api.insertMediaItem(imageItem, 0);
          await api.waitFor(function() {{
            return importedImageClips().length >= 1;
          }}, 8000);
          verify.vp1_media_bin = importedImageClips().length >= 1;

          api.insertMediaItem(imageItem, 3200);
          await api.waitFor(function() {{
            return importedImageClips().length >= 2;
          }}, 8000);

          var imports = importedImageClips();
          if (imports.length >= 2) {{
            var firstClip = imports[imports.length - 2];
            var secondClip = imports[imports.length - 1];
            var firstEnd = Number(firstClip.end) || 0;
            var secondBegin = Number(secondClip.begin) || 0;
            var secondEnd = Number(secondClip.end) || 0;
            var lanes = window.__nf_timeline_lanes ? window.__nf_timeline_lanes() : document.querySelector('.tl-lanes');
            var dur = window.__nf_timeline_duration_ms ? window.__nf_timeline_duration_ms(lanes) : 60000;
            var nearPx = window.__nf_timeline_ms_to_px(firstEnd, lanes, dur) + 4;
            var nearMs = window.__nf_timeline_px_to_ms(nearPx, lanes, dur);
            var bar = document.querySelector('.nf-tl-bar[data-clip-id="' + api.clipIdentity(secondClip) + '"]');
            if (bar) {{
              var drag = {{
                bar: bar,
                row: bar.parentElement,
                lanes: lanes,
                durationMs: dur,
                clipDurationMs: Math.max(100, secondEnd - secondBegin)
              }};
              var snapped = api.snapBeginForDrag(drag, nearMs);
              api.send('move-clip', {{ clip_id: api.clipIdentity(secondClip), begin_ms: Math.round(snapped) }});
              await api.waitFor(function() {{
                var next = api.findClipById(api.clipIdentity(secondClip));
                return next &&
                  next.clip &&
                  Number(next.clip.begin) === Math.round(firstEnd);
              }}, 8000);
              var moved = api.findClipById(api.clipIdentity(secondClip));
              verify.vp4_snap = !!(moved && moved.clip && Number(moved.clip.begin) === Math.round(firstEnd));
            }}
          }}
        }}

        if (window.__NF_EXPORT_SUPPORTED__) {{
          api.send('verify-export-progress', {{
            path: 'tmp/v1.64-verify-export.mp4',
            duration_s: 3,
          }});
          await api.waitFor(function() {{
            return api.state && api.state.export && Number(api.state.export.progress) > 0;
          }}, 15000);
          await api.waitFor(function() {{
            return api.state && api.state.export && Number(api.state.export.progress) >= 100;
          }}, 180000);
          verify.vp3_export_progress = api.state && api.state.export && Number(api.state.export.progress) >= 100;
        }}
      }} catch (err) {{
        verify.error = String(err && err.stack || err);
      }}
      api.__v164_verify_metrics = verify;
      window.setTimeout(api.finishVerifySelect, 200);
    }}, 2000);
  }};

  window.setTimeout(function() {{
    api.renderV164();
    if (window.nfExport && typeof window.nfExport.ensureUi === 'function') {{
      window.nfExport.ensureUi();
    }}
  }}, 120);
}})();
"#,
        verify_tab_source = verify_tab_source_str,
        export_supported = export_supported_flag,
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
window.__NF_VERIFY_UNDO__ = {verify_undo};
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
      '.nf-inspector-field-head{{display:flex;align-items:center;justify-content:space-between;gap:10px;}}' +
      '.nf-inspector-label{{font:600 11px/1.2 var(--font-mono,"SF Mono",monospace);letter-spacing:0.04em;text-transform:uppercase;color:var(--token-text-soft);}}' +
      '.nf-keyframe-btn{{width:24px;height:24px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:var(--token-text-soft);font:700 13px/1 var(--font-mono,"SF Mono",monospace);cursor:pointer;transition:transform .14s ease,border-color .14s ease,background .14s ease,color .14s ease;}}' +
      '.nf-keyframe-btn:hover{{transform:translateY(-1px);border-color:rgba(251,191,36,0.72);color:#fde68a;}}' +
      '.nf-keyframe-btn.is-active{{background:rgba(251,191,36,0.16);border-color:rgba(251,191,36,0.60);color:#fde68a;}}' +
      '.nf-inspector-field input[type="text"],.nf-inspector-field input[type="number"],.nf-inspector-field input[type="color"],.nf-inspector-field textarea{{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:rgba(10,13,22,0.88);color:var(--token-text);padding:9px 10px;font:500 13px/1.45 var(--font-sans,-apple-system,sans-serif);outline:none;}}' +
      '.nf-inspector-field textarea{{min-height:96px;resize:vertical;font-family:var(--font-mono,"SF Mono",monospace);font-size:12px;}}' +
      '.nf-inspector-field input[type="color"]{{padding:4px;height:42px;}}' +
      '.nf-inspector-field input:focus,.nf-inspector-field textarea:focus{{border-color:rgba(167,139,250,0.55);box-shadow:0 0 0 1px rgba(167,139,250,0.24),0 0 14px rgba(167,139,250,0.18);}}' +
      '.nf-inspector-bool{{display:flex;align-items:center;justify-content:space-between;gap:12px;}}' +
      '.nf-inspector-bool input{{width:18px;height:18px;accent-color:var(--token-accent);}}' +
      '.nf-tl-bar{{transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease;cursor:pointer;}}' +
      '.nf-tl-bar.selected{{border:2px solid var(--token-accent)!important;box-shadow:0 0 0 1px rgba(167,139,250,0.24),0 0 18px rgba(167,139,250,0.20);transform:translateY(-1px);}}' +
      '.nf-tl-bar-audio{{padding:0!important;overflow:hidden;}}' +
      '.nf-tl-waveform-shell{{position:absolute;inset:0;pointer-events:none;}}' +
      '.nf-tl-waveform{{display:block;width:100%;height:100%;opacity:0.98;}}' +
      '.nf-tl-bar-label{{position:absolute;left:0;right:0;bottom:0;z-index:1;padding:6px 10px;background:linear-gradient(180deg,rgba(5,7,11,0.05),rgba(5,7,11,0.44));font:600 11px/1.2 var(--font-sans,-apple-system,sans-serif);color:rgba(255,255,255,0.96);text-shadow:0 1px 8px rgba(0,0,0,0.45);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}' +
      '.nf-tl-bar[data-waveform-status="loading"] .nf-tl-waveform-shell{{background:linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.10),rgba(255,255,255,0.04));background-size:200% 100%;animation:nfWaveLoad 1.2s linear infinite;}}' +
      '.nf-tl-bar[data-waveform-status="error"] .nf-tl-waveform-shell{{background:linear-gradient(90deg,rgba(239,68,68,0.10),rgba(239,68,68,0.04));}}' +
      '@keyframes nfWaveLoad{{0%{{background-position:0% 0;}}100%{{background-position:200% 0;}}}}' +
      '.tk-ctrls{{display:flex;align-items:center;gap:6px;margin-left:auto;}}' +
      '.nf-track-toggle{{width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:var(--token-text-soft);font:700 11px/1 var(--font-mono,"SF Mono",monospace);cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease;}}' +
      '.nf-track-toggle:hover{{background:rgba(255,255,255,0.10);color:var(--token-text);transform:translateY(-1px);}}' +
      '.nf-track-toggle.is-active[data-nf-track-toggle="mute"]{{background:rgba(249,115,22,0.18);border-color:rgba(249,115,22,0.48);color:#fdba74;}}' +
      '.nf-track-toggle.is-active[data-nf-track-toggle="solo"]{{background:rgba(52,211,153,0.18);border-color:rgba(52,211,153,0.48);color:#6ee7b7;}}' +
      '#nf-editor-context-menu{{position:fixed;display:none;min-width:168px;padding:8px;flex-direction:column;gap:4px;background:rgba(7,10,18,0.96);border:1px solid rgba(255,255,255,0.10);border-radius:12px;backdrop-filter:blur(18px);box-shadow:0 18px 48px rgba(0,0,0,0.45);z-index:720;}}' +
      '#nf-editor-context-menu[data-open="1"]{{display:flex;}}' +
      '#nf-editor-context-menu button{{width:100%;border:0;border-radius:8px;background:transparent;color:var(--token-text);padding:9px 11px;text-align:left;font:600 12px/1.2 var(--font-sans,-apple-system,sans-serif);cursor:pointer;}}' +
      '#nf-editor-context-menu button:hover{{background:rgba(255,255,255,0.08);}}' +
      '@media (max-width: 1120px){{#nf-inspector-panel{{width:232px;top:52px;right:4px;bottom:4px;}}}}';
    document.head.appendChild(style);
  }}

  window.__nf_editor = window.__nf_editor || {{}};
  var api = window.__nf_editor;
  api.state = window.__NF_EDITOR_INITIAL_STATE__ || null;
  api.pending = api.pending || {{}};
  api.last_applied_token = (api.state && api.state.commit_token) || null;
  api.verify_select_started = false;
  api.verify_undo_started = false;
  api.shortcuts_installed = false;

  api.clipIdentity = function(clip) {{
    if (!clip || typeof clip !== 'object') return '';
    if (clip.id) return String(clip.id);
    if (clip.begin) return String(clip.begin);
    return '';
  }};

  api.send = function(kind, payload) {{
    window.ipc.postMessage(JSON.stringify({{ kind: kind, payload: payload || {{}} }}));
  }};

  api.hasEditableFocus = function() {{
    var active = document.activeElement;
    if (!active) return false;
    var tag = String(active.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!active.isContentEditable;
  }};

  api.playheadMs = function() {{
    var raw = window.__nf_last_playhead_t_ms;
    return isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  }};

  api.splitSelectedAt = function(atMs) {{
    var selected = api.selectedClip();
    if (!selected) return false;
    api.send('split-clip', {{
      clip_id: api.clipIdentity(selected.clip),
      at_ms: Math.max(0, Math.round(atMs || 0))
    }});
    return true;
  }};

  api.deleteSelected = function(ripple) {{
    var selected = api.selectedClip();
    if (!selected) return false;
    api.send(ripple ? 'ripple-delete' : 'delete-clip', {{
      clip_id: api.clipIdentity(selected.clip),
      ripple: !!ripple
    }});
    return true;
  }};

  api.closeContextMenu = function() {{
    var menu = document.getElementById('nf-editor-context-menu');
    if (!menu) return;
    menu.dataset.open = '0';
    menu.style.display = 'none';
  }};

  api.ensureContextMenu = function() {{
    var existing = document.getElementById('nf-editor-context-menu');
    if (existing) return existing;
    var menu = document.createElement('div');
    menu.id = 'nf-editor-context-menu';
    menu.innerHTML =
      '<button type="button" data-nf-menu-action="split">Split here</button>' +
      '<button type="button" data-nf-menu-action="delete">Delete</button>' +
      '<button type="button" data-nf-menu-action="ripple">Ripple delete</button>';
    menu.addEventListener('click', function(ev) {{
      var btn = ev.target && ev.target.closest ? ev.target.closest('button[data-nf-menu-action]') : null;
      if (!btn) return;
      var clipId = menu.dataset.clipId || '';
      var splitAt = Number(menu.dataset.atMs || '0');
      var action = btn.dataset.nfMenuAction || '';
      api.closeContextMenu();
      if (!clipId) return;
      if (action === 'split') {{
        api.send('split-clip', {{ clip_id: clipId, at_ms: Math.max(0, Math.round(splitAt)) }});
      }} else if (action === 'delete') {{
        api.send('delete-clip', {{ clip_id: clipId }});
      }} else if (action === 'ripple') {{
        api.send('ripple-delete', {{ clip_id: clipId }});
      }}
    }});
    document.body.appendChild(menu);
    document.addEventListener('mousedown', function(ev) {{
      if (!menu.contains(ev.target)) api.closeContextMenu();
    }}, true);
    document.addEventListener('keydown', function(ev) {{
      if (String(ev.key || '') === 'Escape') api.closeContextMenu();
    }}, true);
    return menu;
  }};

  api.contextSplitMs = function(ev, bar) {{
    var lanes = window.__nf_timeline_lanes ? window.__nf_timeline_lanes() : document.querySelector('.tl-lanes');
    if (!lanes || !bar) return api.playheadMs();
    var rect = lanes.getBoundingClientRect();
    var durationMs = window.__nf_timeline_duration_ms ? window.__nf_timeline_duration_ms(lanes) : 0;
    var timelineMs = window.__nf_timeline_px_to_ms
      ? window.__nf_timeline_px_to_ms(ev.clientX - rect.left, lanes, durationMs)
      : api.playheadMs();
    var beginMs = parseFloat(bar.dataset.nfBeginMs || '0');
    var endMs = parseFloat(bar.dataset.nfEndMs || '0');
    var innerMin = beginMs + 1;
    var innerMax = Math.max(beginMs + 1, endMs - 1);
    if (!(innerMax > innerMin)) return Math.round(beginMs);
    return Math.round(Math.max(innerMin, Math.min(innerMax, timelineMs)));
  }};

  api.openClipMenu = function(clipId, atMs, clientX, clientY) {{
    var menu = api.ensureContextMenu();
    if (!menu || !clipId) return;
    menu.dataset.clipId = String(clipId);
    menu.dataset.atMs = String(Math.max(0, Math.round(atMs || 0)));
    menu.style.left = Math.max(8, Math.round(clientX || 0)) + 'px';
    menu.style.top = Math.max(8, Math.round(clientY || 0)) + 'px';
    menu.style.display = 'flex';
    menu.dataset.open = '1';
  }};

  api.sleep = function(ms) {{
    return new Promise(function(resolve) {{ window.setTimeout(resolve, ms); }});
  }};

  api.waitFor = function(predicate, timeoutMs) {{
    var deadline = Date.now() + (timeoutMs || 4000);
    return new Promise(function(resolve, reject) {{
      function poll() {{
        var ok = false;
        try {{ ok = !!predicate(); }} catch (_err) {{ ok = false; }}
        if (ok) {{
          resolve(true);
          return;
        }}
        if (Date.now() >= deadline) {{
          reject(new Error('waitFor timeout'));
          return;
        }}
        window.setTimeout(poll, 40);
      }}
      poll();
    }});
  }};

  api.installShortcuts = function() {{
    if (api.shortcuts_installed) return;
    api.shortcuts_installed = true;
    document.addEventListener('keydown', function(e) {{
      var rawKey = String(e.key || '');
      var key = rawKey.toLowerCase();
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && key === 'z') {{
        e.preventDefault();
        api.send(e.shiftKey ? 'redo' : 'undo', {{}});
        return;
      }}
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && key === 'b') {{
        if (api.hasEditableFocus()) return;
        if (!api.selectedClip()) return;
        e.preventDefault();
        api.splitSelectedAt(api.playheadMs());
        return;
      }}
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || api.hasEditableFocus()) return;
      if (rawKey === 'Delete' || rawKey === 'Backspace') {{
        if (!api.selectedClip()) return;
        e.preventDefault();
        api.deleteSelected(!!e.shiftKey);
      }}
    }});
  }};

  api.ensureShellLayout = function() {{
    ensureStyle();
    document.body.classList.add('nf-editor-open');
    api.ensureContextMenu();
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

  api.findTrackById = function(trackId) {{
    var state = api.state;
    var tracks = state && state.source && Array.isArray(state.source.tracks) ? state.source.tracks : [];
    for (var i = 0; i < tracks.length; i++) {{
      if (String((tracks[i] && tracks[i].id) || '') === String(trackId || '')) return tracks[i];
    }}
    return null;
  }};

  api.findClipById = function(clipId) {{
    var state = api.state;
    var tracks = state && state.source && Array.isArray(state.source.tracks) ? state.source.tracks : [];
    for (var ti = 0; ti < tracks.length; ti++) {{
      var track = tracks[ti] || {{}};
      var clips = Array.isArray(track.clips) ? track.clips : [];
      for (var ci = 0; ci < clips.length; ci++) {{
        var clip = clips[ci] || {{}};
        if (api.clipIdentity(clip) === String(clipId || '')) {{
          return {{ track: track, clip: clip, track_idx: ti, clip_idx: ci }};
        }}
      }}
    }}
    return null;
  }};

  api.findFirstClipWithTitle = function() {{
    var state = api.state;
    var tracks = state && state.source && Array.isArray(state.source.tracks) ? state.source.tracks : [];
    for (var ti = 0; ti < tracks.length; ti++) {{
      var track = tracks[ti] || {{}};
      var clips = Array.isArray(track.clips) ? track.clips : [];
      for (var ci = 0; ci < clips.length; ci++) {{
        var clip = clips[ci] || {{}};
        if (clip.params && typeof clip.params.title === 'string') {{
          return {{ track: track, clip: clip, track_idx: ti, clip_idx: ci }};
        }}
      }}
    }}
    return null;
  }};

  api.findTrackButton = function(trackId, action) {{
    return document.querySelector('.nf-track-toggle[data-track-id="' + String(trackId || '') + '"][data-nf-track-toggle="' + String(action || '') + '"]');
  }};

  api.pressUndoShortcut = function(redo) {{
    document.dispatchEvent(new KeyboardEvent('keydown', {{
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      shiftKey: !!redo,
      bubbles: true,
      cancelable: true
    }}));
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

  api.clipBoundsMs = function(selected) {{
    var target = selected || api.selectedClip();
    var source = api.state && api.state.source ? api.state.source : window.__NF_SOURCE__;
    if (!target || !target.clip || !source || typeof window.__nf_resolve_ms !== 'function') return null;
    var beginMs = window.__nf_resolve_ms(target.clip.begin, source, 0);
    var endMs = window.__nf_resolve_ms(target.clip.end, source, beginMs);
    if (!isFinite(beginMs) || !isFinite(endMs)) return null;
    return {{ begin_ms: Math.max(0, Math.round(beginMs)), end_ms: Math.max(0, Math.round(endMs)) }};
  }};

  api.localPlayheadMs = function(selected) {{
    var bounds = api.clipBoundsMs(selected);
    if (!bounds) return api.playheadMs();
    var playhead = api.playheadMs();
    return Math.max(0, Math.min(bounds.end_ms - bounds.begin_ms, playhead - bounds.begin_ms));
  }};

  api.keyframesForField = function(clip, path) {{
    if (!clip || !clip.params || !path) return [];
    var key = String(path).split('.').filter(Boolean);
    if (!key.length) return [];
    key[key.length - 1] = key[key.length - 1] + '_keyframes';
    var cursor = clip.params;
    for (var i = 0; i < key.length; i++) {{
      if (!cursor || typeof cursor !== 'object') return [];
      cursor = cursor[key[i]];
    }}
    return Array.isArray(cursor) ? cursor : [];
  }};

  api.keyframeAtTime = function(clip, path, tMs) {{
    var keyframes = api.keyframesForField(clip, path);
    for (var i = 0; i < keyframes.length; i++) {{
      var frame = keyframes[i];
      if (frame && Number(frame.t) === Number(tMs)) return frame;
    }}
    return null;
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

  api.bindKeyframeButton = function(button) {{
    if (!button || button.__nf_keyframe_wired) return;
    button.__nf_keyframe_wired = true;
    button.addEventListener('click', function(ev) {{
      ev.preventDefault();
      ev.stopPropagation();
      var selected = api.selectedClip();
      if (!selected) return;
      var path = button.dataset.nfPath || '';
      if (!path) return;
      var field = button.closest ? button.closest('[data-nf-inspector-field="1"]') : null;
      field = field ? field.querySelector('[data-nf-path]') : null;
      if (!field) return;
      var kind = field.dataset.nfKind || 'text';
      var value = api.readFieldValue(field, kind);
      if (kind !== 'number' || typeof value !== 'number' || !isFinite(value)) return;
      var localMs = Math.max(0, Math.round(api.localPlayheadMs(selected)));
      var payload = {{
        clip_id: api.clipIdentity(selected.clip),
        path: path,
        t_ms: localMs
      }};
      if (api.keyframeAtTime(selected.clip, path, localMs)) {{
        payload.delete = true;
      }} else {{
        payload.value = value;
      }}
      api.send('set-keyframe', payload);
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
    var keys = Object.keys(params).filter(function(key) {{
      return !/_keyframes$/.test(key);
    }});
    if (!keys.length) {{
      body.innerHTML = '<div class="nf-inspector-empty">Clip has no params.</div>';
      return;
    }}
    var html = '';
    for (var i = 0; i < keys.length; i++) {{
      var key = keys[i];
      var value = params[key];
      var kind = api.fieldKind(value);
      var localPlayheadMs = Math.max(0, Math.round(api.localPlayheadMs(selected)));
      var keyframeActive = kind === 'number' && !!api.keyframeAtTime(clip, key, localPlayheadMs);
      var keyframeButton = kind === 'number'
        ? '<button type="button" class="nf-keyframe-btn' + (keyframeActive ? ' is-active' : '') + '" data-nf-keyframe="1" data-nf-path="' + esc(key) + '" title="' + (keyframeActive ? 'Delete keyframe @ ' : 'Add keyframe @ ') + String(localPlayheadMs) + 'ms">' + (keyframeActive ? '●' : '○') + '</button>'
        : '';
      if (kind === 'boolean') {{
        html += '<label class="nf-inspector-field nf-inspector-bool" data-nf-inspector-field="1">' +
          '<span><span class="nf-inspector-label">' + esc(key) + '</span></span>' +
          '<input data-nf-kind="boolean" data-nf-path="' + esc(key) + '" type="checkbox"' + (value ? ' checked' : '') + ' />' +
        '</label>';
      }} else if (kind === 'json') {{
        html += '<label class="nf-inspector-field" data-nf-inspector-field="1">' +
          '<span class="nf-inspector-field-head"><span class="nf-inspector-label">' + esc(key) + '</span>' + keyframeButton + '</span>' +
          '<textarea data-nf-kind="json" data-nf-path="' + esc(key) + '">' + esc(JSON.stringify(value, null, 2)) + '</textarea>' +
        '</label>';
      }} else {{
        var inputType = kind === 'number' ? 'number' : (kind === 'color' ? 'color' : 'text');
        var inputValue = kind === 'number' ? String(value) : String(value == null ? '' : value);
        html += '<label class="nf-inspector-field" data-nf-inspector-field="1">' +
          '<span class="nf-inspector-field-head"><span class="nf-inspector-label">' + esc(key) + '</span>' + keyframeButton + '</span>' +
          '<input data-nf-kind="' + esc(kind) + '" data-nf-path="' + esc(key) + '" type="' + inputType + '" value="' + esc(inputValue) + '" />' +
        '</label>';
      }}
    }}
    body.innerHTML = html;
    var fields = body.querySelectorAll('[data-nf-path]');
    for (var fi = 0; fi < fields.length; fi++) api.bindField(fields[fi]);
    var keyButtons = body.querySelectorAll('[data-nf-keyframe]');
    for (var ki = 0; ki < keyButtons.length; ki++) api.bindKeyframeButton(keyButtons[ki]);
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
          bar.addEventListener('contextmenu', function(ev) {{
            ev.preventDefault();
            ev.stopPropagation();
            var clipId = this.dataset.clipId || '';
            if (!clipId) return;
            api.send('select-clip', {{ clip_id: clipId }});
            api.openClipMenu(
              clipId,
              api.contextSplitMs(ev, this),
              ev.clientX,
              ev.clientY
            );
          }});
        }}
      }}
    }}
    var toggles = document.querySelectorAll('.nf-track-toggle');
    for (var bi = 0; bi < toggles.length; bi++) {{
      var btn = toggles[bi];
      if (btn.__nf_track_toggle_wired) continue;
      btn.__nf_track_toggle_wired = true;
      btn.addEventListener('click', function(ev) {{
        ev.preventDefault();
        ev.stopPropagation();
        var trackId = this.dataset.trackId || '';
        var active = this.dataset.active === '1';
        var action = this.dataset.nfTrackToggle || '';
        if (!trackId || !action) return;
        if (action === 'mute') {{
          api.send('set-track-mute', {{ track_id: trackId, muted: !active }});
        }} else if (action === 'solo') {{
          api.send('set-track-solo', {{ track_id: trackId, solo: !active }});
        }}
      }});
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
    api.installShortcuts();
    api.renderInspector();
    api.decorateTimeline();
  }};

  api.receiveSelection = function(selection) {{
    api.state = api.state || {{}};
    api.state.selection = selection || {{ kind: 'none', clip_id: null, track_id: null, multi: [] }};
    api.closeContextMenu();
    api.applySelection();
    api.renderInspector();
  }};

  api.receiveSourceUpdate = function(state) {{
    if (!state) return;
    api.closeContextMenu();
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
    var keyframeButtonCount = document.querySelectorAll('[data-nf-keyframe]').length;
    var selectedBar = document.querySelector('.nf-tl-bar.selected');
    var undoSize = api.state && typeof api.state.undo_stack_size === 'number' ? api.state.undo_stack_size : -1;
    var waveform = window.__nf_waveform_metrics ? window.__nf_waveform_metrics() : null;
    var waveformOk = !waveform || !waveform.has_audio_bar || (
      waveform.waveform_status === 'ready' &&
      waveform.peak_count >= 200 &&
      waveform.mapping_pass === true
    );
    if (typeof __nf_snapshot_dom === 'function') __nf_snapshot_dom('verify_finish');
    api.send('verify-select-report', {{
      selected_clip_id: api.state && api.state.selection ? api.state.selection.clip_id || null : null,
      inspector_field_count: fieldCount,
      keyframe_button_count: keyframeButtonCount,
      title_applied: titleApplied,
      selected_class: !!selectedBar,
      undo_stack_size: undoSize,
      waveform: waveform,
      waveform_ok: waveformOk,
      three_panel_layout: !!document.querySelector('.preview-panel') && !!document.querySelector('.timeline') && !!document.getElementById('nf-inspector-panel') && !!document.body.classList.contains('nf-editor-open'),
      mount_trace: window.__nf_mount_trace || [],
      dom_trace: window.__nf_dom_trace || [],
      ok: fieldCount > 0 && titleApplied && !!selectedBar && undoSize === 1 && waveformOk
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
        window.setTimeout(function() {{
          var finish = function() {{ window.setTimeout(api.finishVerifySelect, 160); }};
          if (!document.querySelector('.nf-tl-bar-audio')) {{
            finish();
            return;
          }}
          api.waitFor(function() {{
            var metrics = window.__nf_waveform_metrics ? window.__nf_waveform_metrics() : null;
            return metrics && metrics.waveform_status === 'ready';
          }}, 8000).then(finish).catch(finish);
        }}, 2200);
      }}, 350);
    }}, 2000);
  }};

  api.runVerifyUndo = function() {{
    if (!window.__NF_VERIFY_UNDO__ || api.verify_undo_started) return;
    api.verify_undo_started = true;
    window.setTimeout(async function() {{
      var steps = [
        {{ id: 'step_1_edit_title', pass: false }},
        {{ id: 'step_2_undo_stack_size', pass: false }},
        {{ id: 'step_3_undo_shortcut', pass: false }},
        {{ id: 'step_4_redo_shortcut', pass: false }},
        {{ id: 'step_5_fifo_50', pass: false }},
        {{ id: 'step_6_mute_and_undo', pass: false }},
        {{ id: 'step_7_screenshot', pass: false }}
      ];
      function activeAudioCount() {{
        if (window.__nf_handle && typeof window.__nf_handle.getCurrentAudioTracks === 'function') {{
          try {{ return window.__nf_handle.getCurrentAudioTracks().length; }} catch (_err) {{}}
        }}
        return document.querySelectorAll('audio[data-nf-persist]').length;
      }}
      try {{
        api.installShortcuts();
        await api.waitFor(function() {{
          return api.state && api.state.source && Array.isArray(api.state.source.tracks);
        }}, 5000);
        var target = api.findFirstClipWithTitle();
        if (!target) throw new Error('verify-undo: no clip with params.title');
        var audioTrack = null;
        var tracks = api.state.source.tracks || [];
        for (var ti = 0; ti < tracks.length; ti++) {{
          if ((tracks[ti] && tracks[ti].kind) === 'audio') {{
            audioTrack = tracks[ti];
            break;
          }}
        }}
        if (!audioTrack) throw new Error('verify-undo: no audio track available');
        var soloTrack = null;
        for (var si = 0; si < tracks.length; si++) {{
          if (tracks[si] && tracks[si].id !== audioTrack.id) {{
            soloTrack = tracks[si];
            break;
          }}
        }}
        if (!soloTrack) throw new Error('verify-undo: no solo candidate track');

        var clipId = api.clipIdentity(target.clip);
        var initialTitle = String((target.clip.params && target.clip.params.title) || '');
        var editedTitle = initialTitle + ' · undo';

        api.send('select-clip', {{ clip_id: clipId }});
        await api.waitFor(function() {{
          return api.state && api.state.selection && api.state.selection.clip_id === clipId;
        }}, 2000);
        await api.waitFor(function() {{
          return document.querySelector('#nf-inspector-body [data-nf-path="title"]');
        }}, 2000);

        var titleInput = document.querySelector('#nf-inspector-body [data-nf-path="title"]');
        if (!titleInput) throw new Error('verify-undo: title input missing');
        titleInput.value = editedTitle;
        titleInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
        await api.waitFor(function() {{
          var current = api.findClipById(clipId);
          return current && current.clip && current.clip.params && current.clip.params.title === editedTitle;
        }}, 4000);
        steps[0].pass = true;
        steps[0].clip_id = clipId;
        steps[0].title_after = editedTitle;

        steps[1].undo_stack_size = api.state && api.state.undo_stack_size;
        steps[1].pass = steps[1].undo_stack_size === 1;

        api.pressUndoShortcut(false);
        await api.waitFor(function() {{
          var current = api.findClipById(clipId);
          return current &&
            current.clip &&
            current.clip.params &&
            current.clip.params.title === initialTitle &&
            api.state &&
            api.state.undo_stack_size === 0 &&
            api.state.redo_stack_size === 1;
        }}, 4000);
        steps[2].pass = true;
        steps[2].title_after = initialTitle;
        steps[2].undo_stack_size = api.state.undo_stack_size;
        steps[2].redo_stack_size = api.state.redo_stack_size;

        api.pressUndoShortcut(true);
        await api.waitFor(function() {{
          var current = api.findClipById(clipId);
          return current &&
            current.clip &&
            current.clip.params &&
            current.clip.params.title === editedTitle &&
            api.state &&
            api.state.undo_stack_size === 1 &&
            api.state.redo_stack_size === 0;
        }}, 4000);
        steps[3].pass = true;
        steps[3].title_after = editedTitle;
        steps[3].undo_stack_size = api.state.undo_stack_size;
        steps[3].redo_stack_size = api.state.redo_stack_size;

        for (var idx = 1; idx <= 51; idx++) {{
          var nextTitle = 'FIFO-' + idx;
          api.send('set-param', {{ clip_id: clipId, path: 'title', value: nextTitle }});
          await api.waitFor(function() {{
            var current = api.findClipById(clipId);
            return current && current.clip && current.clip.params && current.clip.params.title === nextTitle;
          }}, 4000);
        }}
        steps[4].undo_stack_size = api.state && api.state.undo_stack_size;
        steps[4].oldest_reverse_value = api.state ? api.state.undo_oldest_reverse_value : null;
        steps[4].pass = steps[4].undo_stack_size === 50 && steps[4].oldest_reverse_value === 'FIFO-1';

        var beforeSoloState = window.__nf_handle && typeof window.__nf_handle.getState === 'function'
          ? window.__nf_handle.getState()
          : null;
        var beforeSoloActive = beforeSoloState && Array.isArray(beforeSoloState.activeClips)
          ? beforeSoloState.activeClips.length
          : 0;
        var soloBtn = api.findTrackButton(soloTrack.id, 'solo');
        if (!soloBtn) throw new Error('verify-undo: solo button missing');
        soloBtn.click();
        await api.waitFor(function() {{
          var currentTrack = api.findTrackById(soloTrack.id);
          return currentTrack && currentTrack.solo === true;
        }}, 4000);
        await api.sleep(240);
        var afterSoloState = window.__nf_handle && typeof window.__nf_handle.getState === 'function'
          ? window.__nf_handle.getState()
          : null;
        var soloActiveIds = [];
        if (afterSoloState && Array.isArray(afterSoloState.activeClips)) {{
          for (var ai = 0; ai < afterSoloState.activeClips.length; ai++) {{
            var activeId = afterSoloState.activeClips[ai] && afterSoloState.activeClips[ai].trackId;
            if (activeId && soloActiveIds.indexOf(activeId) === -1) soloActiveIds.push(activeId);
          }}
        }}
        var soloSkipped = Math.max(0, beforeSoloActive - soloActiveIds.length);
        var soloPass = soloActiveIds.length === 1 && soloActiveIds[0] === soloTrack.id && soloSkipped >= 1;
        soloBtn = api.findTrackButton(soloTrack.id, 'solo');
        if (soloBtn) soloBtn.click();
        await api.waitFor(function() {{
          var currentTrack = api.findTrackById(soloTrack.id);
          return currentTrack && currentTrack.solo !== true;
        }}, 4000);

        var muteBtn = api.findTrackButton(audioTrack.id, 'mute');
        if (!muteBtn) throw new Error('verify-undo: mute button missing');
        muteBtn.click();
        await api.waitFor(function() {{
          var currentTrack = api.findTrackById(audioTrack.id);
          return currentTrack && currentTrack.muted === true && activeAudioCount() === 0;
        }}, 5000);
        api.pressUndoShortcut(false);
        await api.waitFor(function() {{
          var currentTrack = api.findTrackById(audioTrack.id);
          return currentTrack && currentTrack.muted !== true && activeAudioCount() > 0;
        }}, 5000);
        steps[5].pass = true;
        steps[5].audio_track_id = audioTrack.id;
        steps[5].audio_count_after_mute = 0;
        steps[5].audio_count_after_undo = activeAudioCount();

        api.send('verify-undo-report', {{
          steps: steps,
          solo_check: {{
            track_id: soloTrack.id,
            active_before: beforeSoloActive,
            active_after: soloActiveIds.length,
            skipped_tracks: soloSkipped,
            active_track_ids: soloActiveIds,
            pass: soloPass
          }},
          vp: {{
            title_roundtrip_ok: steps[2].pass && steps[3].pass,
            fifo_depth: steps[4].undo_stack_size || 0,
            audio_count_after_mute: 0,
            solo_skipped_tracks: soloSkipped
          }},
          ok: steps[0].pass && steps[1].pass && steps[2].pass && steps[3].pass && steps[4].pass && steps[5].pass && soloPass
        }});
      }} catch (err) {{
        api.send('verify-undo-report', {{
          steps: steps,
          ok: false,
          error: String(err && err.stack || err)
        }});
      }}
    }}, 2200);
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
        api.runVerifyUndo();
      }}, 160);
      return result;
    }};
  }}
}})();
"#,
        tokens_css = design_tokens_str,
        initial_state = initial_editor_state_str,
        verify_select = verify_select_flag,
        verify_undo = verify_undo_flag,
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
    if (window.__nf && typeof window.__nf.unmuteAll === 'function') {
      try { window.__nf.unmuteAll(); } catch(_e){}
    }
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
    var videoState = (window.__nf && typeof window.__nf.getVideoState === 'function')
      ? window.__nf.getVideoState()
      : { count: 0, clips: [] };
    return {
      doc_videos: document.querySelectorAll('video').length,
      doc_audios: document.querySelectorAll('audio').length,
      proxy_videos: videoState.count || 0,
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
    if (window.__nf && typeof window.__nf.getVideoState === 'function') {
      var state = window.__nf.getVideoState();
      var clips = Array.isArray(state.clips) ? state.clips : [];
      for (var i = 0; i < clips.length; i++) {
        var v = clips[i];
        out.videos.push({
          idx: i,
          src: v.src || '',
          paused: !!v.paused,
          muted: !!v.muted,
          currentTime: (Number(v.current_time_ms) || 0) / 1000,
          duration: (Number(v.duration_ms) || 0) / 1000,
          readyState: Number(v.ready_state) || 0,
          error: v.error || null
        });
      }
    } else {
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
          ph_t_ms: (window.__nf && typeof window.__nf.getMediaClock === 'function' && window.__nf.getMediaClock()) || 0,
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
window.__nf_dom_trace = [];
// v1.52.1 · baseline visibility patch
// prototype.html 的 @keyframes up + fill-mode:both 在 WKWebView 下
// 不触发 · 导致 .topbar/.preview-panel/.timeline/.props 永远 opacity:0。
// 强制清 animation + opacity:1 · 让主 layout 可见。
function __nf_force_visible_layout() {{
  var sels = ['.topbar', '.preview-panel', '.timeline', '.props'];
  for (var i = 0; i < sels.length; i++) {{
    var el = document.querySelector(sels[i]);
    if (el) {{
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }}
  }}
}}
function __nf_snapshot_dom(label) {{
  try {{
    var pp = document.querySelector('.preview-panel');
    var tl = document.querySelector('.timeline');
    var mc = document.querySelector('.main-col');
    var mn = document.querySelector('.main');
    var app = document.querySelector('.app');
    var bodyKids = [];
    if (document.body && document.body.children) {{
      for (var i = 0; i < document.body.children.length; i++) {{
        var el = document.body.children[i];
        bodyKids.push((el.tagName||'?').toLowerCase() + '.' + (el.className||'').replace(/\s+/g,'.').slice(0,50));
      }}
    }}
    window.__nf_dom_trace.push({{
      label: label,
      t: Date.now(),
      readyState: document.readyState,
      body_children: bodyKids,
      app_exists: !!app,
      main_exists: !!mn,
      main_col_exists: !!mc,
      preview_panel_exists: !!pp,
      timeline_exists: !!tl,
      preview_offset_w: pp ? pp.offsetWidth : -1,
      preview_offset_h: pp ? pp.offsetHeight : -1,
      timeline_offset_w: tl ? tl.offsetWidth : -1,
      timeline_offset_h: tl ? tl.offsetHeight : -1,
      preview_display: pp ? getComputedStyle(pp).display : 'n/a',
      preview_opacity: pp ? getComputedStyle(pp).opacity : 'n/a',
      timeline_display: tl ? getComputedStyle(tl).display : 'n/a'
    }});
  }} catch(_) {{}}
}}
window.__nf_mount = function() {{
  // Teardown any previous session before building a fresh one.
  window.__nf_teardown();
  window.__nf_mount_trace = ['enter'];
  __nf_force_visible_layout();  // v1.52.1 · 保证 .preview-panel/.timeline 等 opacity:1
  __nf_snapshot_dom('mount_enter');
  try {{
    var ps = document.querySelector('.preview-stage');
    var cp = document.querySelector('.canvas-plate.canvas-16-9');
    var host = ps || cp || document.body;
    window.__nf_mount_trace.push('host=' + (ps?'preview-stage':(cp?'canvas-plate':'BODY_FALLBACK')));
    var vp = (window.__NF_SOURCE__ && window.__NF_SOURCE__.viewport) || {{w:1920, h:1080}};
    // Plate 填充可用空间 (flex container) · 不强制 aspect-ratio (避免宽高约束冲突)
    // stage native size = viewport px · transform-origin:top-left + scale +
    // top/left 由 __nf_reflow 动态计算 · resize 自动重算
    host.innerHTML =
      '<div class="canvas-plate canvas-16-9" id="nf-plate" style="position:relative;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:10px;overflow:hidden;background:#0a0a0f">' +
        '<div id="nf-stage" style="position:absolute;top:0;left:0;width:' + vp.w + 'px;height:' + vp.h + 'px;transform-origin:top left;overflow:hidden;z-index:10"></div>' +
      '</div>';
    window.__nf_mount_trace.push('host.innerHTML set');
    __nf_snapshot_dom('after_host_innerHTML');
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
        if (window.__nf && typeof window.__nf.unmuteAll === 'function') {{
          try {{ window.__nf.unmuteAll(); }} catch(_e){{}}
        }}
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

window.__nfWaveCache = window.__nfWaveCache || {{ data: {{}}, pending: {{}}, seq: 0 }};
window.__nf_waveform_url = function(src) {{
  var raw = String(src || '');
  if (!raw) return '';
  return raw + (raw.indexOf('?') === -1 ? '?nf-peaks=1' : '&nf-peaks=1');
}};
window.__nf_fetch_audio_waveform = function(src) {{
  var raw = String(src || '');
  if (!raw) return Promise.resolve(null);
  var store = window.__nfWaveCache = window.__nfWaveCache || {{ data: {{}}, pending: {{}}, seq: 0 }};
  if (store.data[raw]) return Promise.resolve(store.data[raw]);
  if (store.pending[raw]) return store.pending[raw];
  var request = fetch(window.__nf_waveform_url(raw), {{ cache: 'no-store' }})
    .then(function(resp) {{
      if (!resp.ok) throw new Error('waveform fetch ' + resp.status);
      return resp.json();
    }})
    .then(function(data) {{
      store.data[raw] = data;
      delete store.pending[raw];
      return data;
    }})
    .catch(function(err) {{
      delete store.pending[raw];
      return {{ ok: false, error: String(err), peaks: [] }};
    }});
  store.pending[raw] = request;
  return request;
}};
window.__nf_slice_audio_waveform = function(data, clip, clipDurationMs) {{
  var peaks = Array.isArray(data && data.peaks) ? data.peaks : [];
  var bucketMs = Math.max(1, Number(data && data.bucket_ms) || 10);
  var params = clip && clip.params ? clip.params : {{}};
  var fromMs = Number(params.from_ms);
  if (!isFinite(fromMs) || fromMs < 0) fromMs = 0;
  var clipMs = Math.max(bucketMs, Math.round(clipDurationMs || 0));
  var toMs = Number(params.to_ms);
  var endMs = isFinite(toMs) && toMs > fromMs ? Math.min(toMs, fromMs + clipMs) : (fromMs + clipMs);
  var startIdx = Math.max(0, Math.floor(fromMs / bucketMs));
  var endIdx = Math.max(startIdx + 1, Math.ceil(endMs / bucketMs));
  var subset = peaks.slice(startIdx, endIdx + 1).map(function(value) {{
    var amp = Number(value);
    if (!isFinite(amp)) amp = 0;
    return Math.max(0, Math.min(1, amp));
  }});
  return {{
    bucket_ms: bucketMs,
    duration_ms: Math.max(clipMs, Math.max(bucketMs, subset.length > 1 ? (subset.length - 1) * bucketMs : bucketMs)),
    peaks: subset
  }};
}};
window.__nf_make_waveform_svg = function(slice, color) {{
  var peaks = slice && Array.isArray(slice.peaks) ? slice.peaks.slice() : [];
  var bucketMs = Math.max(1, Number(slice && slice.bucket_ms) || 10);
  var durationMs = Math.max(bucketMs, Number(slice && slice.duration_ms) || bucketMs);
  if (!peaks.length) peaks = [0];
  var upper = '';
  var lower = '';
  var mapping = [];
  for (var i = 0; i < peaks.length; i++) {{
    var t = Math.min(durationMs, i * bucketMs);
    var x = Number(t.toFixed(2));
    var amp = Math.max(0, Math.min(1, Number(peaks[i]) || 0));
    var yTop = Number((50 - amp * 42).toFixed(2));
    var yBottom = Number((50 + amp * 42).toFixed(2));
    upper += (i === 0 ? 'M ' : ' L ') + x + ' ' + yTop;
    lower = ' L ' + x + ' ' + yBottom + lower;
    mapping.push(Math.round(t) + ':' + x);
  }}
  var d = upper + lower + ' Z';
  return '<svg class="nf-tl-waveform" viewBox="0 0 ' + durationMs + ' 100" preserveAspectRatio="none" style="color:' + String(color || '#94a3b8') + '">' +
    '<path class="nf-tl-waveform-path" d="' + d + '" data-v="' + mapping.join(';') + '" data-peak-count="' + peaks.length + '" data-duration-ms="' + durationMs + '" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-opacity="0.82" stroke-width="1.5" vector-effect="non-scaling-stroke"></path>' +
  '</svg>';
}};
window.__nf_attach_audio_waveform = function(bar, track, clip, clipDurationMs, color) {{
  if (!bar) return;
  var shell = document.createElement('div');
  shell.className = 'nf-tl-waveform-shell';
  bar.appendChild(shell);
  bar.dataset.waveformStatus = 'loading';
  var src = clip && clip.params ? clip.params.src : '';
  if (!src) {{
    bar.dataset.waveformStatus = 'missing';
    return;
  }}
  var store = window.__nfWaveCache = window.__nfWaveCache || {{ data: {{}}, pending: {{}}, seq: 0 }};
  store.seq += 1;
  var token = String(store.seq);
  bar.dataset.waveformToken = token;
  window.__nf_fetch_audio_waveform(src).then(function(data) {{
    if (bar.dataset.waveformToken !== token) return;
    var slice = window.__nf_slice_audio_waveform(data, clip, clipDurationMs);
    if (!slice.peaks.length) {{
      bar.dataset.waveformStatus = 'error';
      bar.dataset.waveformPeaks = '0';
      return;
    }}
    shell.innerHTML = window.__nf_make_waveform_svg(slice, track && track.muted === true ? '#6b7280' : color);
    bar.dataset.waveformStatus = 'ready';
    bar.dataset.waveformPeaks = String(slice.peaks.length);
  }});
}};
window.__nf_waveform_metrics = function() {{
  var bar = document.querySelector('.nf-tl-bar-audio');
  var path = bar ? bar.querySelector('.nf-tl-waveform-path') : null;
  var raw = path && path.dataset ? String(path.dataset.v || '') : '';
  var pairs = raw.split(';').filter(Boolean).map(function(pair) {{
    var parts = pair.split(':');
    return {{ t: Number(parts[0]), x: Number(parts[1]) }};
  }});
  var mappingPass = pairs.length > 1;
  for (var i = 0; i < pairs.length; i++) {{
    var item = pairs[i];
    if (!isFinite(item.t) || !isFinite(item.x) || Math.abs(item.t - item.x) > 0.01) mappingPass = false;
    if (i > 0 && (item.t < pairs[i - 1].t || item.x < pairs[i - 1].x)) mappingPass = false;
  }}
  return {{
    has_audio_bar: !!bar,
    waveform_status: bar ? (bar.dataset.waveformStatus || null) : null,
    peak_count: path && path.dataset ? Number(path.dataset.peakCount || bar.dataset.waveformPeaks || 0) : 0,
    mapping_pairs: pairs.length,
    mapping_pass: mappingPass,
    data_v_head: raw.split(';').slice(0, 5)
  }};
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
      var muteActive = t.muted === true;
      var soloActive = t.solo === true;
      el.innerHTML =
        '<div class="tk-icon v">' + label + '</div>' +
        '<div class="tk-text">' +
          '<div class="tk-name">' + String(t.id || '(no id)').replace(/</g,'&lt;') + '</div>' +
          '<div class="tk-meta">' + srcFile.replace(/</g,'&lt;') + '</div>' +
          '<div class="tk-anim">kind=' + String(t.kind || '?') + ' · ' + clipCount + ' clip(s)</div>' +
        '</div>' +
        '<div class="tk-ctrls">' +
          '<button class="nf-track-toggle' + (muteActive ? ' is-active' : '') + '" data-nf-track-toggle="mute" data-track-id="' + String(t.id || '').replace(/</g,'&lt;') + '" data-active="' + (muteActive ? '1' : '0') + '" title="Mute track">M</button>' +
          '<button class="nf-track-toggle' + (soloActive ? ' is-active' : '') + '" data-nf-track-toggle="solo" data-track-id="' + String(t.id || '').replace(/</g,'&lt;') + '" data-active="' + (soloActive ? '1' : '0') + '" title="Solo track">S</button>' +
        '</div>';
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
        var clipDurationMs = Math.max(0, endMs - beginMs);
        var clipLabel = (c.id || t.id) + ' · ' + window.__nf_fmt_ms(clipDurationMs);
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
        if (t.kind === 'audio' && c.params && typeof c.params.src === 'string') {{
          bar.classList.add('nf-tl-bar-audio');
          var labelEl = document.createElement('div');
          labelEl.className = 'nf-tl-bar-label';
          labelEl.textContent = clipLabel;
          bar.appendChild(labelEl);
          window.__nf_attach_audio_waveform(bar, t, c, clipDurationMs, color);
        }} else {{
          bar.textContent = clipLabel;
        }}
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
    // Prefer runtime video proxy / direct media clock when available.
    if (window.__nf && typeof window.__nf.getMediaClock === 'function') {{
      try {{
        var mediaClock = window.__nf.getMediaClock();
        if (typeof mediaClock === 'number' && mediaClock > 0) {{
          updatePh(mediaClock);
          return;
        }}
      }} catch (_e) {{}}
    }}
    // Fallback: first playing direct video/audio as the clock source.
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
{v164_shell}

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
        v164_shell = v164_shell_block,
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
    verify_undo_mode: bool,
    screenshot_path: Option<PathBuf>,
    screenshot_delay_ms: u64,
    export_path: Option<PathBuf>,
    export_duration_s: f64,
    export_fps: u32,
    /// v1.44.1 · 并行切片 N · 默认 1 = 单进程 · ≥2 走 orchestrator spawn N 子进程 + ffmpeg concat.
    /// duration < 6s 自动降级单进程(orchestrator 内部判)。
    export_parallel: Option<usize>,
    export_resolution: Option<String>,
    list_plugins: bool,
    template_name: Option<String>,
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
    let mut verify_undo_mode = false;
    let mut screenshot_path: Option<PathBuf> = None;
    let mut screenshot_delay_ms: u64 = 2500;
    let mut export_path: Option<PathBuf> = None;
    let mut export_duration_s: f64 = 5.0;
    let mut export_fps: u32 = 60;
    let mut export_parallel: Option<usize> = None;
    let mut export_resolution: Option<String> = None;
    let mut list_plugins = false;
    let mut template_name: Option<String> = None;
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
            "--verify-undo" => verify_undo_mode = true,
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
            "--list-plugins" => list_plugins = true,
            "--template" => {
                i += 1;
                if i < args.len() {
                    template_name = Some(args[i].clone());
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
            "--fps" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<u32>() {
                        export_fps = v;
                    }
                }
            }
            "--parallel" => {
                i += 1;
                if i < args.len() {
                    if let Ok(v) = args[i].parse::<usize>() {
                        export_parallel = Some(v);
                    }
                }
            }
            "--resolution" => {
                i += 1;
                if i < args.len() {
                    export_resolution = Some(args[i].clone());
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
        verify_undo_mode,
        screenshot_path,
        screenshot_delay_ms,
        export_path,
        export_duration_s,
        export_fps,
        export_parallel,
        export_resolution,
        list_plugins,
        template_name,
        menu_test,
        window_x,
        window_y,
        verify_media_path,
        source_arg: positional.unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string()),
    }
}

fn repo_root_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn media_kind_from_path(path: &std::path::Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png" | "jpg" | "jpeg" | "webp") => Some("image"),
        Some("mp4" | "mov" | "m4v" | "webm") => Some("video"),
        Some("mp3" | "wav" | "aac" | "m4a") => Some("audio"),
        _ => None,
    }
}

fn media_kind_from_path_str(raw: &str) -> Option<&'static str> {
    nf_asset_uri_to_path(raw)
        .as_deref()
        .and_then(media_kind_from_path)
        .or_else(|| media_kind_from_path(std::path::Path::new(raw)))
}

fn normalize_asset_src(raw: &str) -> String {
    if raw.starts_with("nf-asset://")
        || raw.starts_with("http://")
        || raw.starts_with("https://")
        || raw.starts_with("data:")
    {
        return raw.to_string();
    }
    if let Some(abs) = raw.strip_prefix("file://") {
        return format!("nf-asset://x{abs}");
    }
    let path = std::path::Path::new(raw);
    if path.is_absolute() {
        return format!("nf-asset://x{}", path.display());
    }
    match path.canonicalize() {
        Ok(abs) => format!("nf-asset://x{}", abs.display()),
        Err(_) => raw.to_string(),
    }
}

fn collect_media_from_dir(
    dir: &std::path::Path,
    depth: usize,
    seen: &mut HashSet<String>,
    out: &mut Vec<Value>,
) {
    if depth > 4 || out.len() >= 48 {
        return;
    }
    let Ok(read_dir) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries = read_dir.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path());
    for entry in entries {
        if out.len() >= 48 {
            break;
        }
        let path = entry.path();
        let hidden = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with('.'))
            .unwrap_or(false);
        if hidden {
            continue;
        }
        if path.is_dir() {
            collect_media_from_dir(&path, depth + 1, seen, out);
            continue;
        }
        let Some(asset_kind) = media_kind_from_path(&path) else {
            continue;
        };
        let canonical = path.canonicalize().unwrap_or(path.clone());
        let canonical_str = canonical.display().to_string();
        if !seen.insert(canonical_str.clone()) {
            continue;
        }
        let name = canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("asset")
            .to_string();
        out.push(json!({
            "id": format!("asset-{}", seen.len()),
            "name": name,
            "asset_kind": asset_kind,
            "path": canonical_str,
            "src": format!("nf-asset://x{}", canonical.display()),
        }));
    }
}

fn collect_media_bin_items(source_path: &str) -> Vec<Value> {
    let mut roots = Vec::new();
    let source = PathBuf::from(source_path);
    let canonical_source = source.canonicalize().unwrap_or(source);
    if let Some(parent) = canonical_source.parent() {
        roots.push(parent.join("assets"));
        roots.push(parent.to_path_buf());
    }
    let repo_root = repo_root_path();
    roots.push(repo_root.join("demo/assets"));
    roots.push(repo_root.join("animation-gallery/assets"));

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for root in roots {
        collect_media_from_dir(&root, 0, &mut seen, &mut out);
        if out.len() >= 48 {
            break;
        }
    }

    let fallback_audio = repo_root.join("tmp/v1121-demo.mp3");
    if out
        .iter()
        .all(|item| item.get("asset_kind").and_then(Value::as_str) != Some("audio"))
        && fallback_audio.is_file()
    {
        let canonical = fallback_audio
            .canonicalize()
            .unwrap_or(fallback_audio.clone());
        out.push(json!({
            "id": format!("asset-{}", out.len() + 1),
            "name": canonical.file_name().and_then(|name| name.to_str()).unwrap_or("v1121-demo.mp3"),
            "asset_kind": "audio",
            "path": canonical.display().to_string(),
            "src": format!("nf-asset://x{}", canonical.display()),
        }));
    }
    out
}

fn load_source_from_path(
    path: &std::path::Path,
    ensure_undo_fixture_mode: bool,
) -> Result<LoadedSource> {
    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let source_text = std::fs::read_to_string(&canonical_path)
        .with_context(|| format!("read source.json at {}", canonical_path.display()))?;
    let mut source_json: Value =
        serde_json::from_str(&source_text).context("source.json not valid JSON")?;
    if ensure_undo_fixture_mode {
        ensure_verify_undo_fixture(&mut source_json);
    }
    let source_dir = canonical_path
        .parent()
        .map(|path| path.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    rewrite_file_srcs(&mut source_json, &source_dir);
    warm_audio_peaks_cache(&source_json);
    Ok(LoadedSource {
        path: canonical_path.display().to_string(),
        source: source_json,
    })
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

fn nf_asset_uri_to_path(uri: &str) -> Option<std::path::PathBuf> {
    let path_str = uri
        .strip_prefix("nf-asset://x/")
        .or_else(|| uri.strip_prefix("nf-asset://x"))
        .or_else(|| uri.strip_prefix("nf-asset:"))?;
    let mut path_owned = String::from("/");
    path_owned.push_str(path_str);
    if let Some(q) = path_owned.find('?') {
        path_owned.truncate(q);
    }
    Some(std::path::PathBuf::from(
        percent_decode_str(&path_owned).unwrap_or(path_owned),
    ))
}

fn audio_peaks_cache_dir() -> std::path::PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        return std::path::PathBuf::from(xdg)
            .join("nextframe")
            .join("peaks");
    }
    if let Ok(home) = std::env::var("HOME") {
        return std::path::PathBuf::from(home)
            .join(".cache")
            .join("nextframe")
            .join("peaks");
    }
    std::path::PathBuf::from("tmp").join("nextframe-peaks")
}

fn audio_peaks_cache_path(src: &str) -> std::path::PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(src.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    audio_peaks_cache_dir().join(format!("{digest}.json"))
}

fn load_audio_peaks_cache(src: &str) -> Option<AudioPeaksCache> {
    let cache_path = audio_peaks_cache_path(src);
    let bytes = std::fs::read(cache_path).ok()?;
    let cache: AudioPeaksCache = serde_json::from_slice(&bytes).ok()?;
    if cache.version != 1
        || cache.bucket_ms != AUDIO_PEAK_BUCKET_MS
        || cache.sample_rate != AUDIO_PEAK_SAMPLE_RATE
        || cache.src != src
        || cache.peaks.is_empty()
    {
        return None;
    }
    Some(cache)
}

fn compute_audio_peaks_cache(src: &str, path: &std::path::Path) -> Result<AudioPeaksCache> {
    let output = std::process::Command::new("ffmpeg")
        .arg("-v")
        .arg("error")
        .arg("-i")
        .arg(path)
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg(AUDIO_PEAK_SAMPLE_RATE.to_string())
        .arg("-f")
        .arg("s16le")
        .arg("-")
        .output()
        .with_context(|| format!("spawn ffmpeg for audio peaks {}", path.display()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        anyhow::bail!(
            "ffmpeg peaks decode failed for {}: {}",
            path.display(),
            if stderr.is_empty() {
                "unknown error".to_string()
            } else {
                stderr
            }
        );
    }
    if output.stdout.len() < 2 {
        anyhow::bail!("ffmpeg peaks decode returned no PCM for {}", path.display());
    }

    let bucket_samples =
        ((u64::from(AUDIO_PEAK_SAMPLE_RATE) * AUDIO_PEAK_BUCKET_MS) / 1000).max(1) as usize;
    let mut peaks = Vec::new();
    let mut bucket_peak = 0.0f32;
    let mut bucket_count = 0usize;
    let mut sample_count = 0u64;
    for chunk in output.stdout.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        let amp = (sample.unsigned_abs() as f32) / (i16::MAX as f32);
        if amp > bucket_peak {
            bucket_peak = amp;
        }
        bucket_count += 1;
        sample_count += 1;
        if bucket_count >= bucket_samples {
            peaks.push((bucket_peak * 10_000.0).round() / 10_000.0);
            bucket_peak = 0.0;
            bucket_count = 0;
        }
    }
    if bucket_count > 0 {
        peaks.push((bucket_peak * 10_000.0).round() / 10_000.0);
    }
    if peaks.is_empty() {
        anyhow::bail!("computed empty peaks for {}", path.display());
    }
    let duration_ms =
        ((sample_count as f64 / AUDIO_PEAK_SAMPLE_RATE as f64) * 1000.0).round() as u64;
    Ok(AudioPeaksCache {
        version: 1,
        src: src.to_string(),
        source_path: path.display().to_string(),
        bucket_ms: AUDIO_PEAK_BUCKET_MS,
        sample_rate: AUDIO_PEAK_SAMPLE_RATE,
        duration_ms,
        peaks,
    })
}

fn ensure_audio_peaks_cache(src: &str, path: &std::path::Path) -> Result<AudioPeaksCache> {
    if let Some(cache) = load_audio_peaks_cache(src) {
        return Ok(cache);
    }
    let cache = compute_audio_peaks_cache(src, path)?;
    let cache_path = audio_peaks_cache_path(src);
    ensure_parent_dir(&cache_path)?;
    let bytes = serde_json::to_vec_pretty(&cache).context("serialize audio peaks cache")?;
    std::fs::write(&cache_path, bytes)
        .with_context(|| format!("write audio peaks cache {}", cache_path.display()))?;
    Ok(cache)
}

fn warm_audio_peaks_cache(source: &Value) {
    let Some(tracks) = source.get("tracks").and_then(Value::as_array) else {
        return;
    };
    for track in tracks {
        if track.get("kind").and_then(Value::as_str) != Some("audio") {
            continue;
        }
        let Some(clips) = track.get("clips").and_then(Value::as_array) else {
            continue;
        };
        for clip in clips {
            let Some(src) = clip
                .get("params")
                .and_then(|params| params.get("src"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            let Some(path) = nf_asset_uri_to_path(src) else {
                continue;
            };
            if let Err(err) = ensure_audio_peaks_cache(src, &path) {
                eprintln!("[NF-PEAKS] warm cache failed for {src}: {err}");
            }
        }
    }
}

fn ensure_verify_undo_fixture(source: &mut Value) {
    let has_audio = source
        .get("tracks")
        .and_then(Value::as_array)
        .map(|tracks| {
            tracks
                .iter()
                .any(|track| track.get("kind").and_then(Value::as_str) == Some("audio"))
        })
        .unwrap_or(false);
    if has_audio {
        return;
    }
    let use_demo_anchor = source.pointer("/anchors/demo").is_some();
    let Some(tracks) = source.get_mut("tracks").and_then(Value::as_array_mut) else {
        return;
    };
    let (begin_expr, end_expr) = if use_demo_anchor {
        ("demo.begin", "demo.end")
    } else {
        ("0", "10s")
    };
    tracks.push(json!({
        "id": "tr_audio",
        "kind": "audio",
        "src": "src/nf-tracks/official/audio.js",
        "clips": [
            {
                "id": "clip_audio_verify",
                "begin": begin_expr,
                "end": end_expr,
                "params": {
                    "src": "file:///Users/Zhuanz/bigbang/NextFrame/tmp/v1121-demo.mp3",
                    "from_ms": 0,
                    "volume": 0.8
                }
            }
        ]
    }));
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
    let wants_peaks = uri.contains("nf-peaks=1") || uri.contains("peaks=1");
    let cache_src = uri.split('?').next().unwrap_or(&uri).to_string();
    let Some(path) = nf_asset_uri_to_path(&uri) else {
        return http::Response::builder()
            .status(400)
            .header("Content-Type", "text/plain")
            .body(b"nf-asset: invalid path".to_vec())
            .unwrap_or_else(|_| empty_body());
    };
    if wants_peaks {
        return match ensure_audio_peaks_cache(&cache_src, &path) {
            Ok(cache) => match serde_json::to_vec(&cache) {
                Ok(body) => http::Response::builder()
                    .status(200)
                    .header("Content-Type", "application/json")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-store")
                    .header("Content-Length", body.len().to_string())
                    .body(body)
                    .unwrap_or_else(|_| empty_body()),
                Err(_) => empty_body(),
            },
            Err(err) => http::Response::builder()
                .status(500)
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(
                    serde_json::to_vec(&json!({
                        "ok": false,
                        "error": err.to_string(),
                        "src": cache_src,
                    }))
                    .unwrap_or_else(|_| b"{\"ok\":false}".to_vec()),
                )
                .unwrap_or_else(|_| empty_body()),
        };
    }
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

fn print_plugin_list(catalog: &PluginCatalog) {
    if catalog.plugins.is_empty() {
        println!("no plugins found\troot={}", catalog.root.display());
        return;
    }

    for plugin in &catalog.plugins {
        let version = plugin.version.as_deref().unwrap_or("-");
        let description = plugin.description.as_deref().unwrap_or("-");
        println!(
            "{}\tkind={}\tversion={}\tentry={}\tmanifest={}\tdescription={}",
            plugin.name,
            plugin.kind,
            version,
            plugin.entry_path.display(),
            plugin.manifest_path.display(),
            description
        );
    }
}

fn ensure_parent_dir(path: &std::path::Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("mkdir {}", parent.display()))?;
    }
    Ok(())
}

fn linux_export_error_message() -> &'static str {
    "export not supported on Linux in v1.60 preview-only mode; use macOS/Windows or --serve (planned for v1.66)"
}

fn linux_export_not_supported_error() -> anyhow::Error {
    anyhow::anyhow!(linux_export_error_message())
}

#[cfg(windows)]
fn evaluate_webview_script(
    window: &tao::window::Window,
    webview: &wry::WebView,
    js: &str,
) -> Result<()> {
    let _ = platform::WinShellWebView::new(window, webview).eval_async(js)?;
    Ok(())
}

#[cfg(all(unix, not(target_vendor = "apple")))]
fn evaluate_webview_script(
    window: &tao::window::Window,
    webview: &wry::WebView,
    js: &str,
) -> Result<()> {
    let _ = platform::LinuxShellWebView::new(window, webview).eval_async(js)?;
    Ok(())
}

#[cfg(target_vendor = "apple")]
fn evaluate_webview_script(
    _window: &tao::window::Window,
    webview: &wry::WebView,
    js: &str,
) -> Result<()> {
    webview.evaluate_script(js).context("webview eval")
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

#[cfg(windows)]
fn capture_preview_to_path(
    path: &std::path::Path,
    window: &tao::window::Window,
    webview: &wry::WebView,
) -> Result<u64> {
    ensure_parent_dir(path)?;
    let bytes = platform::WinShellWebView::new(window, webview).snapshot()?;
    std::fs::write(path, &bytes).with_context(|| format!("write {}", path.display()))?;
    Ok(bytes.len() as u64)
}

#[cfg(target_vendor = "apple")]
fn capture_preview_to_path(
    path: &std::path::Path,
    window: &tao::window::Window,
    _webview: &wry::WebView,
) -> Result<u64> {
    let (x, y, w, h) = window_capture_rect(window);
    capture_region_png(path, x, y, w, h)
}

#[cfg(all(unix, not(target_vendor = "apple")))]
fn capture_preview_to_path(
    path: &std::path::Path,
    window: &tao::window::Window,
    webview: &wry::WebView,
) -> Result<u64> {
    ensure_parent_dir(path)?;
    let bytes = platform::LinuxShellWebView::new(window, webview).snapshot()?;
    std::fs::write(path, &bytes).with_context(|| format!("write {}", path.display()))?;
    Ok(bytes.len() as u64)
}

#[cfg(all(unix, not(target_vendor = "apple")))]
fn resize_platform_webview(
    window: &tao::window::Window,
    webview: &wry::WebView,
    size: tao::dpi::PhysicalSize<u32>,
) {
    let logical = size.to_logical::<u32>(window.scale_factor());
    platform::LinuxShellWebView::new(window, webview).set_bounds(
        0.0,
        0.0,
        logical.width as f64,
        logical.height as f64,
    );
}

#[cfg(not(all(unix, not(target_vendor = "apple"))))]
fn resize_platform_webview(
    _window: &tao::window::Window,
    _webview: &wry::WebView,
    _size: tao::dpi::PhysicalSize<u32>,
) {
}

fn push_workspace_state_to_webview(
    window: &tao::window::Window,
    webview: &wry::WebView,
    workspace_state: &Arc<Mutex<MultiSourceState>>,
    export_ui_state: &Arc<Mutex<ExportUiState>>,
    plugins: &PluginCatalog,
    method: &str,
) -> Result<()> {
    let workspace = workspace_state
        .lock()
        .map_err(|e| anyhow::anyhow!("workspace state lock poisoned: {e}"))?;
    let export_ui = export_ui_state
        .lock()
        .map_err(|e| anyhow::anyhow!("export ui lock poisoned: {e}"))?;
    let js = editor_js_call(
        method,
        &workspace_state_value(&workspace, &export_ui, plugins),
    );
    drop(export_ui);
    drop(workspace);
    evaluate_webview_script(window, webview, &js)
}

fn main() -> Result<()> {
    let mut opts = parse_cli();
    let stdout_json_mode =
        opts.verify_select_mode || opts.verify_zoom_mode || opts.verify_undo_mode;
    let plugin_catalog = scan_user_plugins();

    for warning in &plugin_catalog.warnings {
        eprintln!("[NF-PLUGIN] {warning}");
    }
    if opts.list_plugins {
        print_plugin_list(&plugin_catalog);
        return Ok(());
    }
    shell_log(
        stdout_json_mode,
        &format!(
            "[NF-PLUGIN] scanned {} plugin(s) from {}",
            plugin_catalog.plugins.len(),
            plugin_catalog.root.display()
        ),
    );

    if let Some(template_name) = opts.template_name.clone() {
        let created = materialize_template(&template_name)?;
        shell_log(
            stdout_json_mode,
            &format!(
                "[NF-TEMPLATE] created {} via {} → {}",
                created.name,
                created.origin.label(),
                created.path.display()
            ),
        );
        opts.source_arg = created.path.display().to_string();
    }
    let plugin_catalog = Arc::new(plugin_catalog);

    // v1.44 · CLI --export 快捷路径:不启 tao event_loop · 不开窗口 ·
    // 直接用 headless WKWebView + CARenderer (nf-recorder) 产 MP4 · 退出。
    // 一致性靠 ADR-045 t 纯驱动 + viewport 绑 source.json · 跟 preview 像素级一致。
    if let Some(export_path) = opts.export_path.clone() {
        if cfg!(all(unix, not(target_vendor = "apple"))) {
            let err = linux_export_not_supported_error();
            eprintln!("[NF-RECORDER] failed · {err}");
            return Err(err);
        }
        shell_log(
            stdout_json_mode,
            &format!(
                "[NF-RECORDER] CLI --export direct mode · source={} · out={} · duration={}s · fps={} · parallel={} · resolution={}",
                opts.source_arg,
                export_path.display(),
                opts.export_duration_s,
                opts.export_fps,
                format_parallel_override(opts.export_parallel),
                format_resolution_override(opts.export_resolution.as_deref())
            ),
        );
        let src_path = PathBuf::from(&opts.source_arg);
        match run_recorder_export(
            &src_path,
            &export_path,
            opts.export_duration_s,
            opts.export_fps,
            opts.export_parallel,
            opts.export_resolution.as_deref(),
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

    let initial_loaded = load_source_from_path(
        std::path::Path::new(&opts.source_arg),
        opts.verify_undo_mode,
    )?;
    let source_json = initial_loaded.source.clone();
    let source_path = initial_loaded.path.clone();
    let tracks_map = build_track_sources(&source_json, &plugin_catalog);
    let n_tracks = tracks_map.len();
    let workspace_state = Arc::new(Mutex::new(MultiSourceState::new(
        source_path.clone(),
        source_json.clone(),
    )));
    let export_ui_state = Arc::new(Mutex::new(ExportUiState::default()));
    let initial_editor_state = {
        let state = workspace_state
            .lock()
            .map_err(|e| anyhow::anyhow!("editor state lock poisoned: {e}"))?;
        let export_ui = export_ui_state
            .lock()
            .map_err(|e| anyhow::anyhow!("export ui lock poisoned: {e}"))?;
        workspace_state_value(&state, &export_ui, &plugin_catalog)
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
        &source_path,
        opts.verify_media_path.is_some(),
        opts.verify_zoom_mode,
        opts.verify_undo_mode,
    );

    let event_loop: EventLoop<UserEvent> = EventLoopBuilder::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = platform::build_platform_window!(
        &event_loop,
        WINDOW_TITLE,
        WINDOW_W,
        WINDOW_H,
        opts.window_x,
        opts.window_y,
        960.0,
        600.0,
        TITLEBAR_INSET_X,
        TITLEBAR_INSET_Y
    );

    let workspace_state_for_handler = Arc::clone(&workspace_state);
    let export_ui_for_handler = Arc::clone(&export_ui_state);
    let plugin_catalog_for_handler = Arc::clone(&plugin_catalog);
    let proxy_for_handler = proxy.clone();
    let verify_mode = opts.verify_mode;
    let verify_count = Arc::new(Mutex::new(0u32));
    let verify_count_for_handler = Arc::clone(&verify_count);
    let verify_media_path_for_handler = opts.verify_media_path.clone();
    let verify_select_mode = opts.verify_select_mode;
    let verify_zoom_mode = opts.verify_zoom_mode;
    let verify_undo_mode = opts.verify_undo_mode;

    let webview = platform::build_platform_webview!(
        &window,
        PROTOTYPE_HTML,
        &init_script,
        move |req, responder| {
            std::thread::spawn(move || {
                responder.respond(nf_asset_response(req));
            });
        },
        move |req| {
            let body: &str = req.body().as_ref();
            let mut state = match workspace_state_for_handler.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("[NF-IPC] state lock poisoned: {e}");
                    return;
                }
            };
            let export_ui = match export_ui_for_handler.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("[NF-IPC] export ui lock poisoned: {e}");
                    return;
                }
            };
            match dispatch_ipc(&mut state, &export_ui, &plugin_catalog_for_handler, body) {
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
                Ok(IpcOutcome::OpenTab { path }) => {
                    let _ = proxy_for_handler.send_event(UserEvent::OpenTab { path });
                }
                Ok(IpcOutcome::MenuOpen) => {
                    let _ = proxy_for_handler.send_event(UserEvent::MenuOpen);
                }
                Ok(IpcOutcome::MenuSave) => {
                    let _ = proxy_for_handler.send_event(UserEvent::MenuSave);
                }
                Ok(IpcOutcome::MenuTemplate { template_name }) => {
                    let _ = proxy_for_handler.send_event(UserEvent::MenuTemplate { template_name });
                }
                Ok(IpcOutcome::StartExportDialog {
                    duration_s,
                    parallel,
                    resolution,
                }) => {
                    let _ = proxy_for_handler.send_event(UserEvent::StartExportDialog {
                        duration_s,
                        parallel,
                        resolution,
                    });
                }
                Ok(IpcOutcome::StartExport {
                    path,
                    duration_s,
                    parallel,
                    resolution,
                }) => {
                    let _ = proxy_for_handler.send_event(UserEvent::StartExport {
                        path,
                        duration_s,
                        parallel,
                        resolution,
                    });
                }
                Ok(IpcOutcome::StartSimulatedExport { path, duration_s }) => {
                    let _ = proxy_for_handler
                        .send_event(UserEvent::StartSimulatedExport { path, duration_s });
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
                Ok(IpcOutcome::VerifyUndoReport(payload)) => {
                    if verify_undo_mode {
                        let _ =
                            proxy_for_handler.send_event(UserEvent::VerifyUndoReport { payload });
                    }
                }
                Err(e) => {
                    shell_log(stdout_json_mode, &format!("[NF-IPC] error: {e}"));
                }
            }
        }
    );

    shell_log(
        stdout_json_mode,
        &format!(
            "[NF] window {WINDOW_W}x{WINDOW_H} · titlebar transparent + traffic lights · resizable · source={} · tracks={} · verify={} · verify_select={} · verify_zoom={} · verify_undo={} · screenshot={}",
            source_path,
            n_tracks,
            opts.verify_mode,
            opts.verify_select_mode,
            opts.verify_zoom_mode,
            opts.verify_undo_mode,
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
                event: WindowEvent::Resized(size),
                ..
            } => {
                resize_platform_webview(&window_for_loop, &webview, size);
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::EvalScript(js)) => {
                let _ = evaluate_webview_script(&window_for_loop, &webview, &js);
            }
            Event::UserEvent(UserEvent::DragWindow) => {
                let _ = window_for_loop.drag_window();
            }
            Event::UserEvent(UserEvent::ScreenshotNow(path)) => {
                match capture_preview_to_path(&path, &window_for_loop, &webview) {
                    Ok(n) => shell_log(
                        stdout_json_mode,
                        &format!("[NF-SHOT] wrote {} ({} bytes)", path.display(), n),
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
                let screenshot_ok =
                    capture_preview_to_path(&screenshot_path, &window_for_loop, &webview).is_ok();
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
                let screenshot_ok =
                    capture_preview_to_path(&screenshot_path, &window_for_loop, &webview).is_ok();
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
            Event::UserEvent(UserEvent::VerifyUndoReport { payload }) => {
                let json_path = PathBuf::from(VERIFY_UNDO_JSON_PATH);
                let screenshot_path = PathBuf::from(VERIFY_UNDO_SCREENSHOT_PATH);
                let screenshot_ok =
                    capture_preview_to_path(&screenshot_path, &window_for_loop, &webview).is_ok();
                let mut report = if payload.is_object() {
                    payload
                } else {
                    json!({ "ok": false, "payload": payload })
                };
                let mut final_ok = report.get("ok").and_then(Value::as_bool).unwrap_or(false);
                if let Some(obj) = report.as_object_mut() {
                    if let Some(steps) = obj.get_mut("steps").and_then(Value::as_array_mut) {
                        if let Some(step) = steps.get_mut(6).and_then(Value::as_object_mut) {
                            step.insert("pass".to_string(), Value::Bool(screenshot_ok));
                            step.insert(
                                "path".to_string(),
                                Value::String(VERIFY_UNDO_SCREENSHOT_PATH.to_string()),
                            );
                        }
                    }
                    let steps_pass = obj
                        .get("steps")
                        .and_then(Value::as_array)
                        .map(|steps| {
                            steps.iter().all(|step| {
                                step.get("pass").and_then(Value::as_bool).unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                    final_ok = final_ok && steps_pass && screenshot_ok;
                    obj.insert(
                        "screenshot_path".to_string(),
                        Value::String(VERIFY_UNDO_SCREENSHOT_PATH.to_string()),
                    );
                    obj.insert(
                        "report_path".to_string(),
                        Value::String(VERIFY_UNDO_JSON_PATH.to_string()),
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
                    eprintln!("[NF-VERIFY-UNDO] write failed: {err}");
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
            Event::UserEvent(UserEvent::OpenTab { path }) => {
                match load_source_from_path(&path, false) {
                    Ok(loaded) => {
                        if let Ok(mut workspace) = workspace_state.lock() {
                            workspace.open_tab(loaded.path.clone(), loaded.source);
                        }
                        let _ = push_workspace_state_to_webview(
                            &window_for_loop,
                            &webview,
                            &workspace_state,
                            &export_ui_state,
                            &plugin_catalog,
                            "receiveSourceUpdate",
                        );
                        shell_log(
                            stdout_json_mode,
                            &format!("[NF-TAB] open {}", loaded.path),
                        );
                    }
                    Err(err) => {
                        eprintln!("[NF-TAB] open failed · {} · {err}", path.display());
                    }
                }
            }
            Event::UserEvent(UserEvent::StartExportDialog {
                duration_s,
                parallel,
                resolution,
            }) => {
                if cfg!(all(unix, not(target_vendor = "apple"))) {
                    eprintln!("[NF-EXPORT] {}", linux_export_error_message());
                    return;
                }
                shell_log(
                    stdout_json_mode,
                    &format!(
                        "[NF-EXPORT] pick path · duration={duration_s}s · parallel={} · resolution={}",
                        format_parallel_override(parallel),
                        format_resolution_override(resolution.as_deref())
                    ),
                );
                let active_source_path = workspace_state
                    .lock()
                    .ok()
                    .and_then(|workspace| workspace.active_tab().map(|tab| tab.path.clone()))
                    .unwrap_or_else(|| opts.source_arg.clone());
                let picked = rfd::FileDialog::new()
                    .add_filter("MP4 video", &["mp4"])
                    .set_file_name(&default_export_filename(
                        &active_source_path,
                        resolution.as_deref(),
                    ))
                    .save_file();
                match picked {
                    Some(path) => {
                        let _ = proxy.send_event(UserEvent::StartExport {
                            path,
                            duration_s,
                            parallel,
                            resolution,
                        });
                    }
                    None => shell_log(stdout_json_mode, "[NF-EXPORT] cancelled"),
                }
            }
            Event::UserEvent(UserEvent::StartExport {
                path,
                duration_s,
                parallel,
                resolution,
            }) => {
                if cfg!(all(unix, not(target_vendor = "apple"))) {
                    eprintln!("[NF-EXPORT] {}", linux_export_error_message());
                    return;
                }
                // v1.44 · 菜单 IPC 触发 · spawn 自身子进程跑 --export · 不阻塞
                // 交互 preview 窗口。子进程在 fn main() 开头的 early-exit 分支里用
                // current_thread tokio 跑 nf_recorder::run_export_from_source。
                shell_log(
                    stdout_json_mode,
                    &format!(
                        "[NF-RECORDER] start · duration={duration_s}s · parallel={} · resolution={} → {}",
                        format_parallel_override(parallel),
                        format_resolution_override(resolution.as_deref()),
                        path.display(),
                    ),
                );
                let self_exe = std::env::current_exe().unwrap_or_default();
                let source_arg = workspace_state
                    .lock()
                    .ok()
                    .and_then(|workspace| workspace.active_tab().map(|tab| tab.path.clone()))
                    .unwrap_or_else(|| opts.source_arg.clone());
                let path_thread = path.clone();
                let proxy_exp = proxy.clone();
                let resolution_thread = resolution.clone();
                if let Ok(mut export_ui) = export_ui_state.lock() {
                    export_ui.active = true;
                    export_ui.progress = 0.0;
                    export_ui.label = format!("Exporting · {}", path.display());
                    export_ui.path = Some(path.display().to_string());
                }
                let _ = push_workspace_state_to_webview(
                    &window_for_loop,
                    &webview,
                    &workspace_state,
                    &export_ui_state,
                    &plugin_catalog,
                    "receiveState",
                );
                let running = Arc::new(AtomicBool::new(true));
                let running_progress = Arc::clone(&running);
                let proxy_progress = proxy.clone();
                let progress_path = path.clone();
                std::thread::spawn(move || {
                    let started = std::time::Instant::now();
                    let estimate_s = duration_s.max(1.0);
                    while running_progress.load(AtomicOrdering::Relaxed) {
                        let elapsed = started.elapsed().as_secs_f64();
                        let progress = ((elapsed / estimate_s).min(0.985) * 100.0).max(0.0);
                        let _ = proxy_progress.send_event(UserEvent::ExportProgress {
                            path: progress_path.clone(),
                            progress,
                            label: format!("Exporting · {:>3.0}%", progress),
                            active: true,
                        });
                        std::thread::sleep(std::time::Duration::from_millis(90));
                    }
                });
                std::thread::spawn(move || {
                    let mut cmd = std::process::Command::new(&self_exe);
                    cmd.arg(&source_arg)
                        .arg("--export")
                        .arg(&path_thread)
                        .arg("--duration")
                        .arg(format!("{duration_s}"));
                    if let Some(ref resolution) = resolution_thread {
                        cmd.arg("--resolution").arg(resolution);
                    }
                    if let Some(parallel) = parallel {
                        cmd.arg("--parallel").arg(parallel.to_string());
                    }
                    let status = cmd.status();
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
                    running.store(false, AtomicOrdering::Relaxed);
                    let _ = proxy_exp.send_event(UserEvent::ExportDone {
                        path: path_thread,
                        ok,
                        msg,
                    });
                });
            }
            Event::UserEvent(UserEvent::StartSimulatedExport { path, duration_s }) => {
                if let Ok(mut export_ui) = export_ui_state.lock() {
                    export_ui.active = true;
                    export_ui.progress = 0.0;
                    export_ui.label = format!("Exporting · {}", path.display());
                    export_ui.path = Some(path.display().to_string());
                }
                let js = {
                    let export_ui = export_ui_state.lock().ok().map(|state| export_state_value(&state)).unwrap_or_else(|| json!({
                        "active": true,
                        "progress": 0.0,
                        "label": format!("Exporting · {}", path.display()),
                        "path": path.display().to_string(),
                    }));
                    editor_js_call("receiveExportState", &export_ui)
                };
                let _ = evaluate_webview_script(&window_for_loop, &webview, &js);
                let proxy_exp = proxy.clone();
                let path_thread = path.clone();
                std::thread::spawn(move || {
                    let started = std::time::Instant::now();
                    let duration = duration_s.max(0.5);
                    loop {
                        let elapsed = started.elapsed().as_secs_f64();
                        let progress = ((elapsed / duration).min(1.0) * 100.0).max(0.0);
                        let _ = proxy_exp.send_event(UserEvent::ExportProgress {
                            path: path_thread.clone(),
                            progress,
                            label: format!("Exporting · {:>3.0}%", progress),
                            active: progress < 100.0,
                        });
                        if progress >= 100.0 {
                            let _ = ensure_parent_dir(&path_thread);
                            let _ = std::fs::write(&path_thread, b"simulated export progress\n");
                            let _ = proxy_exp.send_event(UserEvent::ExportDone {
                                path: path_thread.clone(),
                                ok: true,
                                msg: "simulated progress".to_string(),
                            });
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(90));
                    }
                });
            }
            Event::UserEvent(UserEvent::ExportProgress {
                path,
                progress,
                label,
                active,
            }) => {
                let payload = if let Ok(mut export_ui) = export_ui_state.lock() {
                    export_ui.active = active;
                    export_ui.progress = progress.clamp(0.0, 100.0);
                    export_ui.label = label;
                    export_ui.path = Some(path.display().to_string());
                    export_state_value(&export_ui)
                } else {
                    json!({
                        "active": active,
                        "progress": progress.clamp(0.0, 100.0),
                        "label": label,
                        "path": path.display().to_string(),
                    })
                };
                let js = editor_js_call("receiveExportState", &payload);
                let _ = evaluate_webview_script(&window_for_loop, &webview, &js);
            }
            Event::UserEvent(UserEvent::ExportDone { path, ok, msg }) => {
                let payload = if let Ok(mut export_ui) = export_ui_state.lock() {
                    export_ui.active = false;
                    export_ui.progress = if ok { 100.0 } else { 0.0 };
                    export_ui.label = if ok {
                        "Export complete".to_string()
                    } else {
                        "Export failed".to_string()
                    };
                    export_ui.path = Some(path.display().to_string());
                    export_state_value(&export_ui)
                } else {
                    json!({
                        "active": false,
                        "progress": if ok { 100.0 } else { 0.0 },
                        "label": if ok { "Export complete" } else { "Export failed" },
                        "path": path.display().to_string(),
                    })
                };
                let js = editor_js_call("receiveExportState", &payload);
                let _ = evaluate_webview_script(&window_for_loop, &webview, &js);
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
                        let _ = proxy.send_event(UserEvent::OpenTab { path: p });
                    }
                    None => shell_log(stdout_json_mode, "[NF-MENU] open cancelled"),
                }
            }
            Event::UserEvent(UserEvent::MenuSave) => {
                shell_log(
                    stdout_json_mode,
                    "[NF-MENU] save · NSSavePanel on main thread",
                );
                let default_name = workspace_state
                    .lock()
                    .ok()
                    .and_then(|workspace| {
                        workspace.active_tab().and_then(|tab| {
                            std::path::Path::new(&tab.path)
                                .file_name()
                                .and_then(|name| name.to_str())
                                .map(str::to_string)
                        })
                    })
                    .unwrap_or_else(|| "source.json".to_string());
                let picked = rfd::FileDialog::new()
                    .add_filter("NextFrame source", &["json"])
                    .set_file_name(&default_name)
                    .save_file();
                match picked {
                    Some(p) => {
                        let canonical_path =
                            p.canonicalize().unwrap_or_else(|_| p.clone());
                        let mut written = 0usize;
                        if let Ok(mut workspace) = workspace_state.lock() {
                            if let Some(tab) = workspace.active_tab_mut() {
                                if let Ok(serialized) =
                                    serde_json::to_string_pretty(&tab.editor.source)
                                {
                                    written = serialized.len();
                                    if std::fs::write(&p, serialized).is_ok() {
                                        tab.path = canonical_path.display().to_string();
                                        tab.title = tab
                                            .editor
                                            .source
                                            .get("meta")
                                            .and_then(|meta| meta.get("name"))
                                            .and_then(Value::as_str)
                                            .filter(|name| !name.trim().is_empty())
                                            .map(str::to_string)
                                            .unwrap_or_else(|| {
                                                canonical_path
                                                    .file_name()
                                                    .and_then(|name| name.to_str())
                                                    .unwrap_or("source.json")
                                                    .to_string()
                                            });
                                    }
                                }
                            }
                        }
                        let _ = push_workspace_state_to_webview(
                            &window_for_loop,
                            &webview,
                            &workspace_state,
                            &export_ui_state,
                            &plugin_catalog,
                            "receiveState",
                        );
                        shell_log(
                            stdout_json_mode,
                            &format!("[NF-MENU] save to: {} ({} bytes)", p.display(), written),
                        );
                    }
                    None => shell_log(stdout_json_mode, "[NF-MENU] save cancelled"),
                }
            }
            Event::UserEvent(UserEvent::MenuTemplate { template_name }) => {
                match materialize_template(&template_name) {
                    Ok(created) => {
                        shell_log(
                            stdout_json_mode,
                            &format!(
                                "[NF-TEMPLATE] created {} via {} → {}",
                                created.name,
                                created.origin.label(),
                                created.path.display()
                            ),
                        );
                        let _ = proxy.send_event(UserEvent::OpenTab { path: created.path });
                    }
                    Err(err) => {
                        eprintln!(
                            "[NF-TEMPLATE] create failed · {} · {err}",
                            template_name
                        );
                    }
                }
            }
            _ => {}
        }
    });
}
