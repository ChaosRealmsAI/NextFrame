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
    // Traffic light 对齐策略 · FM-TL-SYSTEM-ANCHOR(ADR A-0017):
    // 不调 `with_traffic_light_inset` 让系统按默认放红绿灯 · Rust 读 close.frame.midY
    // 作为锚点 · 通过 init script 推给 DOM · topbar 用 CSS 变量 `--tl-center-y` 把
    // 内容对齐系统按钮中心线。跨 macOS 版本 / fullscreen / titlebar 变体都自动适配 ·
    // 不靠固定像素猜(v0.5.1 早期 17/20/34/44 都对不准)。
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
        .with_has_shadow(true);
    let window = builder
        .build(target)
        .map_err(|err| format!("window build failed: {err}"))?;

    // 系统按钮度量 · 拿到才能生成 init script 里的 `window.__nfTrafficLight`
    #[cfg(target_os = "macos")]
    let tl_init_js = crate::traffic_light::TrafficLightMetrics::read_from_tao(&window)
        .map(|m| m.to_init_script())
        .unwrap_or_default();
    #[cfg(not(target_os = "macos"))]
    let tl_init_js = String::new();

    let frontend_root = frontend_root()?;
    let url = frontend_url(project, episode);
    let session_script = initialization_script(project, episode, &tl_init_js);
    let ipc_window_id = window_id.to_string();
    let ipc_proxy = proxy.clone();
    let webview_builder = WebViewBuilder::new()
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
        });
    let webview = webview_builder
        .build(&window)
        .map_err(|err| format!("webview build failed: {err}"))?;

    Ok((window, webview))
}

fn frontend_url(project: &str, episode: &str) -> String {
    format!("nextframe://frontend/index.html?project={project}&episode={episode}")
}

fn initialization_script(project: &str, episode: &str, tl_init_js: &str) -> String {
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
  {tl_init_js}
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
