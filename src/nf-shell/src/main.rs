//! nf-shell — NextFrame desktop shell.
//!
//! Thin wry+tao wrapper around the system WebView. Loads the v2-hifi prototype
//! HTML, injects `window.__NF_SOURCE__` via initialization script, and lets
//! nf-runtime render the timeline inside the preview area.
//!
//! T-1 (this file): borderless 1440x900 window + load prototype.html.
//! T-2 will extend this to read source.json from CLI arg and inject it.

use std::path::PathBuf;

use anyhow::{Context, Result};
use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const WINDOW_TITLE: &str = "NextFrame";
const WINDOW_W: f64 = 1440.0;
const WINDOW_H: f64 = 900.0;

// Placeholder source for T-1; T-2 reads real source.json from CLI arg.
const PLACEHOLDER_SOURCE: &str =
    r#"{"version":"v1.20-shell","note":"T-2 will inject real source"}"#;

fn resolve_prototype_path() -> Result<PathBuf> {
    // Dev path: project-root/spec/versions/v1.20/prototype.html
    // (release will switch to include_str! in T-2)
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let p = PathBuf::from(manifest_dir)
        .ancestors()
        .nth(2)
        .context("manifest_dir has no ancestor 2 levels up")?
        .join("spec/versions/v1.20/prototype.html");
    if !p.is_file() {
        anyhow::bail!("prototype.html not found at {}", p.display());
    }
    p.canonicalize().context("canonicalize prototype.html")
}

fn main() -> Result<()> {
    let prototype = resolve_prototype_path()?;
    let url = format!("file://{}", prototype.display());

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

    let init_script = format!(
        "window.__NF_SOURCE__ = {}; console.log('[NF] __NF_SOURCE__ injected (T-1 placeholder)');",
        PLACEHOLDER_SOURCE
    );

    let _webview = WebViewBuilder::new(&window)
        .with_url(&url)
        .with_initialization_script(&init_script)
        .with_devtools(true)
        .build()
        .context("webview build")?;

    println!(
        "[NF] window {WINDOW_W}x{WINDOW_H} borderless ready · loaded {}",
        url
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
