use std::fs;
use std::io::Write;
use std::path::PathBuf;

use tao::dpi::LogicalSize;
use tao::event_loop::{EventLoopProxy, EventLoopWindowTarget};
use tao::window::{Window, WindowBuilder};
use wry::{WebView, WebViewBuilder};

use crate::events::UserEvent;

const STUB_HTML: &str = r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NextFrame</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #101014; color: #f6f7fb; font: 14px system-ui, sans-serif; }
    .app { min-height: 100vh; -webkit-backdrop-filter: blur(50px) saturate(1.5); backdrop-filter: blur(50px) saturate(1.5); background: rgba(18, 18, 24, 0.82); }
    .topbar { height: 52px; display: flex; align-items: center; padding: 0 18px; box-sizing: border-box; background: rgba(10, 10, 14, 0.65); border-bottom: 1px solid rgba(255,255,255,0.12); }
    .stub { padding: 20px; color: rgba(246,247,251,0.72); }
  </style>
</head>
<body>
  <main class="app" data-nextframe-shell="stub">
    <div class="topbar">nf-shell</div>
    <div class="stub">nf-shell</div>
  </main>
</body>
</html>
"#;

pub fn create_window(
    target: &EventLoopWindowTarget<UserEvent>,
    proxy: EventLoopProxy<UserEvent>,
    window_id: &str,
    project: &str,
    episode: &str,
) -> Result<(Window, WebView), String> {
    let title = format!("NextFrame · {project}/{episode} · {window_id}");
    let window = WindowBuilder::new()
        .with_title(&title)
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .with_resizable(true)
        .build(target)
        .map_err(|err| format!("window build failed: {err}"))?;

    let html_path = ensure_stub_bundle().map_err(|err| format!("stub bundle failed: {err}"))?;
    let url = format!("file://{}", html_path.display());
    let ipc_window_id = window_id.to_string();
    let ipc_proxy = proxy.clone();
    let webview = WebViewBuilder::new()
        .with_url(url)
        .with_initialization_script("window.NEXTFRAME_DPR = 1;")
        .with_ipc_handler(move |req| {
            let body = req.body().to_string();
            let _send_result = ipc_proxy.send_event(UserEvent::IpcFromJs {
                window_id: ipc_window_id.clone(),
                body: body.clone(),
            });

            let stdout = std::io::stdout();
            let mut handle = stdout.lock();
            let _write_result = writeln!(handle, "NFIPC {body}");
            let _flush_result = handle.flush();
        })
        .build(&window)
        .map_err(|err| format!("webview build failed: {err}"))?;

    Ok((window, webview))
}

fn ensure_stub_bundle() -> Result<PathBuf, std::io::Error> {
    let dir = std::env::temp_dir().join("nextframe-shell-bundle-v0_2");
    fs::create_dir_all(&dir)?;
    let html_path = dir.join("index.html");
    match fs::read_to_string(&html_path) {
        Ok(existing) if existing == STUB_HTML => {}
        _ => fs::write(&html_path, STUB_HTML)?,
    }
    Ok(html_path)
}
