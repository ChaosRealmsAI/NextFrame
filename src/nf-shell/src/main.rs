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
) -> String {
    let source_str = serde_json::to_string(source_json).unwrap_or_else(|_| "{}".to_string());
    let tracks_str = serde_json::to_string(tracks_map).unwrap_or_else(|_| "{}".to_string());
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
{runtime}

window.__nf_mount = function() {{
  try {{
    var ps = document.querySelector('.preview-stage');
    var cp = document.querySelector('.canvas-plate.canvas-16-9');
    var host = ps || cp || document.body;
    var vp = (window.__NF_SOURCE__ && window.__NF_SOURCE__.viewport) || {{w:1920, h:1080}};
    host.innerHTML =
      '<div class="canvas-plate canvas-16-9" id="nf-plate" style="position:relative;width:100%;aspect-ratio:' + vp.w + '/' + vp.h + ';max-width:100%;border-radius:10px;overflow:hidden;background:#0a0a0f">' +
        '<div id="nf-stage" style="position:absolute;top:0;left:0;width:' + vp.w + 'px;height:' + vp.h + 'px;transform-origin:top left;overflow:hidden;z-index:10"></div>' +
      '</div>';
    requestAnimationFrame(function(){{
      var plate = document.querySelector('#nf-plate');
      var stage = document.querySelector('#nf-stage');
      if (plate && stage) {{
        stage.style.transform = 'scale(' + (plate.clientWidth / vp.w) + ')';
      }}
      window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: true }});
      console.log('[NF] runtime booted · tracks=' + Object.keys(window.__NF_TRACKS__).length);
      window.__nf_install_drag_handles();
    }});
  }} catch (e) {{
    console.error('[NF] mount failed:', e && e.stack || e);
  }}
}};

window.__nf_apply_source = function(newSource) {{
  window.__NF_SOURCE__ = newSource;
  window.__nf_mount();
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
        source_arg: positional.unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string()),
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
        .with_position(LogicalPosition::new(120.0, 80.0))
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
