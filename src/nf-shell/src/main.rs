//! nf-shell — NextFrame desktop shell.
//!
//! Thin wry+tao wrapper around the system WebView. Loads the v2-hifi prototype
//! HTML, replaces `.canvas-plate.canvas-16-9` inner content with `#nf-stage`,
//! injects nf-runtime + source.json + track sources, boots runtime → preview
//! area renders the real timeline (bg / scene / video).
//!
//! `nf-shell [source.json]` — defaults to `demo/v1.8-video-sample.json`.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde_json::{Map, Value};
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const WINDOW_TITLE: &str = "NextFrame";
const WINDOW_W: f64 = 1440.0;
const WINDOW_H: f64 = 900.0;

// Self-contained: prototype HTML + runtime + 7 tracks all baked in.
// Release binary needs no external files except the source.json arg.
const PROTOTYPE_HTML: &str =
    include_str!("../../../spec/versions/v1.20/prototype.html");
const RUNTIME_IIFE: &str =
    include_str!("../../nf-runtime/dist/runtime-iife.js");
const TRACK_BG: &str = include_str!("../../nf-tracks/official/bg.js");
const TRACK_SCENE: &str = include_str!("../../nf-tracks/official/scene.js");
const TRACK_VIDEO: &str = include_str!("../../nf-tracks/official/video.js");
const TRACK_AUDIO: &str = include_str!("../../nf-tracks/official/audio.js");
const TRACK_CHART: &str = include_str!("../../nf-tracks/official/chart.js");
const TRACK_DATA: &str = include_str!("../../nf-tracks/official/data.js");
const TRACK_SUBTITLE: &str =
    include_str!("../../nf-tracks/official/subtitle.js");

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

fn write_runtime_html(init_script: &str) -> Result<PathBuf> {
    // Inline init_script before </body> so the same HTML can be opened directly
    // in Chrome / Playwright for cross-validation against wry.
    let injected_marker = "<!-- __nf_runtime_inject__ -->";
    let injected = format!(
        "<script id=\"__nf_runtime_bootstrap\">\n{init_script}\n</script>\n{injected_marker}\n</body>"
    );
    let html = PROTOTYPE_HTML.replacen("</body>", &injected, 1);
    let tmp_dir = std::env::temp_dir().join("nf-shell");
    std::fs::create_dir_all(&tmp_dir).context("create tmp dir")?;
    let html_path = tmp_dir.join("shell.html");
    std::fs::write(&html_path, html).context("write tmp shell.html")?;
    Ok(html_path)
}

fn build_init_script(source_json: &Value, tracks_map: &Map<String, Value>) -> String {
    let source_str = serde_json::to_string(source_json).unwrap_or_else(|_| "{}".to_string());
    let tracks_str = serde_json::to_string(tracks_map).unwrap_or_else(|_| "{}".to_string());
    // Order matters:
    // 1. set globals (__NF_SOURCE__ + __NF_TRACKS__) — runtime reads these
    // 2. eval runtime IIFE — installs window.NFRuntime
    // 3. on DOMContentLoaded: replace .canvas-plate inner with #nf-stage, then boot
    format!(
        r#"
window.__NF_SOURCE__ = {source};
window.__NF_TRACKS__ = {tracks};
{runtime}

function __nf_mount() {{
  try {{
    // Replace the entire .preview-stage (the flex container that holds the
    // canvas-plate). This guarantees the runtime gets a sized parent —
    // .canvas-plate has 16:9 aspect-ratio + min-height:0 so it can collapse
    // to ~150px when its original child .scene is removed.
    var ps = document.querySelector('.preview-stage');
    var cp = document.querySelector('.canvas-plate.canvas-16-9');
    var host = ps || cp || document.body;
    // Re-create the canvas frame; #nf-stage is sized to the viewport's
    // logical dimensions (1920x1080) and CSS-scaled to fit the visible plate.
    // Track render outputs absolute-positioned elements at viewport px, so
    // we render at native size and scale the wrapper.
    var vp = (window.__NF_SOURCE__ && window.__NF_SOURCE__.viewport) || {{w:1920, h:1080}};
    host.innerHTML =
      '<div class="canvas-plate canvas-16-9" id="nf-plate" style="position:relative;width:100%;aspect-ratio:' + vp.w + '/' + vp.h + ';max-width:100%;border-radius:10px;overflow:hidden;background:#0a0a0f">' +
        '<div id="nf-stage" style="position:absolute;top:0;left:0;width:' + vp.w + 'px;height:' + vp.h + 'px;transform-origin:top left;overflow:hidden;z-index:10"></div>' +
      '</div>';
    // Apply scale based on actual plate width on next frame (after layout).
    requestAnimationFrame(function(){{
      var plate = document.querySelector('#nf-plate');
      var stage = document.querySelector('#nf-stage');
      if (plate && stage) {{
        var scale = plate.clientWidth / vp.w;
        stage.style.transform = 'scale(' + scale + ')';
      }}
      // Re-apply on resize.
      window.addEventListener('resize', function(){{
        var p = document.querySelector('#nf-plate');
        var s = document.querySelector('#nf-stage');
        if (p && s) s.style.transform = 'scale(' + (p.clientWidth / vp.w) + ')';
      }});
    }});
    var handle = window.NFRuntime.boot({{ stage: '#nf-stage', autoplay: true }});
    console.log('[NF] runtime boot OK · tracks=' + Object.keys(window.__NF_TRACKS__).length);
    window.__nf_handle = handle;
    // Diagnostic overlay (always visible · screencap-able)
  }} catch (e) {{
    console.error('[NF] runtime boot FAILED:', e && e.stack || e);
    var body = document.body;
    var err = document.createElement('div');
    err.style.cssText = 'position:fixed;top:8px;left:8px;background:#7f1d1d;color:#fff;padding:8px 12px;font:13px monospace;border-radius:6px;z-index:99999';
    err.textContent = '[NF] boot failed: ' + (e && e.message || e);
    body.appendChild(err);
  }}
}}

if (document.readyState === 'loading') {{
  document.addEventListener('DOMContentLoaded', __nf_mount);
}} else {{
  __nf_mount();
}}
"#,
        source = source_str,
        tracks = tracks_str,
        runtime = RUNTIME_IIFE,
    )
}

fn main() -> Result<()> {
    let source_arg = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "demo/v1.8-video-sample.json".to_string());
    let source_text = std::fs::read_to_string(&source_arg)
        .with_context(|| format!("read source.json at {source_arg}"))?;
    let source_json: Value =
        serde_json::from_str(&source_text).context("source.json not valid JSON")?;
    let tracks_map = build_track_sources(&source_json);
    let n_tracks = tracks_map.len();

    let init_script = build_init_script(&source_json, &tracks_map);
    let html_path = write_runtime_html(&init_script)?;
    let url = format!("file://{}", html_path.display());

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title(WINDOW_TITLE)
        .with_inner_size(LogicalSize::new(WINDOW_W, WINDOW_H))
        .with_position(LogicalPosition::new(120.0, 80.0))
        .with_decorations(false)
        .with_visible(true)
        .with_focused(true)
        .build(&event_loop)
        .context("window build")?;
    window.set_focus();

    // Init script is now inlined into shell.html itself (see write_runtime_html);
    // wry just loads the URL.
    let _webview = WebViewBuilder::new(&window)
        .with_url(&url)
        .with_devtools(true)
        .build()
        .context("webview build")?;

    println!(
        "[NF] window {WINDOW_W}x{WINDOW_H} borderless ready · source={source_arg} · tracks_compiled={n_tracks} · loaded {url}"
    );

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}
