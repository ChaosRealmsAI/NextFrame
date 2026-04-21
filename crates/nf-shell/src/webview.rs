use std::io::Write;
use std::path::{Path, PathBuf};

use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event_loop::{EventLoopProxy, EventLoopWindowTarget};
#[cfg(target_os = "macos")]
use tao::platform::macos::WindowBuilderExtMacOS;
use tao::window::{Window, WindowBuilder};
use wry::{
    http::{header::CONTENT_TYPE, Request, Response},
    WebView, WebViewBuilder,
};

use crate::events::UserEvent;

pub fn create_window(
    target: &EventLoopWindowTarget<UserEvent>,
    proxy: EventLoopProxy<UserEvent>,
    window_id: &str,
    project: &str,
    episode: &str,
) -> Result<(Window, WebView), String> {
    // Traffic light 位置 · tao 0.35 `with_traffic_light_inset(x, y)` 真实语义:
    //   title_bar_container_h = button_h + y    // 见 tao view.rs:1168
    //   button.origin.x = x + i * space_between
    //   button.origin.y = 不动 · 靠 Cocoa 在容器内默认居中
    //
    // 所以要按钮跟 H px DOM topbar 垂直居中对齐 → 容器高度撑到 H:
    //   y = H - button_h
    // 数学直觉 (H - button_h) / 2 是 Electron 式"button 距顶 padding" 模型
    // tao 不是那个模型 · 套错 · 结果偏上(v0.5.1 此前试过 17/20 皆偏)。
    //
    // button_h = 14pt 是系统定值(macOS 三色圆按钮 · NSWindowButton 默认)。
    const TOPBAR_HEIGHT_PT: f64 = 48.0;
    const TRAFFIC_LIGHT_BUTTON_H_PT: f64 = 14.0;
    const TRAFFIC_LIGHT_X_PT: f64 = 20.0;
    const TRAFFIC_LIGHT_Y_PT: f64 = TOPBAR_HEIGHT_PT - TRAFFIC_LIGHT_BUTTON_H_PT; // = 34

    let builder = WindowBuilder::new()
        .with_title("NextFrame")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .with_position(LogicalPosition::new(120.0, 80.0))
        .with_resizable(true)
        .with_min_inner_size(LogicalSize::new(960.0, 600.0));
    #[cfg(target_os = "macos")]
    let builder = builder
        .with_title_hidden(true)
        .with_titlebar_transparent(true)
        .with_fullsize_content_view(true)
        .with_has_shadow(true)
        .with_traffic_light_inset(LogicalPosition::new(
            TRAFFIC_LIGHT_X_PT,
            TRAFFIC_LIGHT_Y_PT,
        ));
    let window = builder
        .build(target)
        .map_err(|err| format!("window build failed: {err}"))?;

    let frontend_root = frontend_root()?;
    let url = frontend_url(project, episode);
    let session_script = initialization_script(project, episode);
    let ipc_window_id = window_id.to_string();
    let ipc_proxy = proxy.clone();
    let webview = WebViewBuilder::new()
        .with_custom_protocol("nextframe".into(), move |_webview_id, request| {
            match frontend_protocol_response(&frontend_root, request) {
                Ok(response) => response.map(Into::into),
                Err(err) => plain_response(500, err.as_bytes().to_vec()).map(Into::into),
            }
        })
        .with_url(url)
        .with_initialization_script(&session_script)
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

fn frontend_url(project: &str, episode: &str) -> String {
    format!("nextframe://frontend/index.html?project={project}&episode={episode}")
}

fn initialization_script(project: &str, episode: &str) -> String {
    let session = serde_json::json!({
        "project": project,
        "episode": episode
    });
    format!(
        r#"(() => {{
  window.NEXTFRAME_DPR = 1;
  window.NEXTFRAME_SESSION = {session};
  const markNativeShell = () => {{
    document.documentElement.setAttribute("data-nextframe-native", "true");
  }};
  if (document.documentElement) {{
    markNativeShell();
  }} else {{
    document.addEventListener("DOMContentLoaded", markNativeShell, {{ once: true }});
  }}
}})();"#
    )
}

fn frontend_root() -> Result<PathBuf, String> {
    let root = project_root()?.join("frontend/nf-components");
    let index = root.join("index.html");
    if !index.exists() {
        return Err(format!("frontend bundle missing: {}", index.display()));
    }
    Ok(root)
}

fn project_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .ok_or_else(|| {
            format!(
                "cannot resolve project root from {}",
                manifest_dir.display()
            )
        })
}

fn frontend_protocol_response(
    root: &Path,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, String> {
    let root = root
        .canonicalize()
        .map_err(|err| format!("frontend root failed: {err}"))?;
    let path = request.uri().path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    let file = root.join(path);
    let file = file
        .canonicalize()
        .map_err(|err| format!("frontend asset missing: {path}: {err}"))?;
    if !file.starts_with(&root) {
        return Ok(plain_response(403, b"forbidden".to_vec()));
    }
    let content = std::fs::read(&file).map_err(|err| format!("frontend asset failed: {err}"))?;
    let mime = mime_for_path(&file);
    Response::builder()
        .header(CONTENT_TYPE, mime)
        .body(content)
        .map_err(|err| err.to_string())
}

fn plain_response(status: u16, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}
