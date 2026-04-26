use std::io::Write;
use std::path::{Path, PathBuf};

use tao::dpi::{LogicalPosition, LogicalSize};
use tao::event_loop::{EventLoopProxy, EventLoopWindowTarget};
#[cfg(target_os = "macos")]
use tao::platform::macos::WindowBuilderExtMacOS;
use tao::window::{Window, WindowBuilder};
use wry::{
    WebView, WebViewBuilder,
    http::{Request, Response, header::CONTENT_TYPE},
};

use crate::events::UserEvent;

pub fn create_window(
    target: &EventLoopWindowTarget<UserEvent>,
    proxy: EventLoopProxy<UserEvent>,
    window_id: &str,
    project: &str,
    episode: &str,
    composition: Option<&str>,
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

    // 安装 traffic light 对齐 · Rust 主动 setFrame 按钮到 DOM topbar 中心 +
    // 挂 NSNotificationCenter observer 处理 resize/activate/fullscreen reset
    // (参考 bigbang/MediaAgentTeam/automedia/src/ui.rs:104)
    #[cfg(target_os = "macos")]
    let _tl_observer = crate::traffic_light::install_from_tao(&window);
    // observer 通过 window_manager 侧面保活 · 见 WindowState.traffic_light_observer
    #[cfg(target_os = "macos")]
    if let Some(observer) = _tl_observer {
        std::mem::forget(observer);
    }

    let frontend_root = frontend_root()?;
    let url = frontend_url(project, episode, composition);
    let session_script = initialization_script(project, episode, composition);
    let ipc_window_id = window_id.to_string();
    let ipc_proxy = proxy.clone();
    let webview_builder = WebViewBuilder::new()
        .with_custom_protocol("nextframe".into(), move |_webview_id, request| {
            match protocol_response(&frontend_root, request) {
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

fn frontend_url(project: &str, episode: &str, composition: Option<&str>) -> String {
    if let Some(composition) = composition {
        return format!(
            "nextframe://frontend/index.html?project={project}&composition={composition}"
        );
    }
    format!("nextframe://frontend/index.html?project={project}&episode={episode}")
}

fn initialization_script(project: &str, episode: &str, composition: Option<&str>) -> String {
    let session = serde_json::json!({
        "project": project,
        "episode": episode,
        "composition": composition
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
  if (!console.__nextframeForwarded) {{
    ["log", "warn", "error", "info"].forEach((level) => {{
      const original = console[level];
      console[level] = function(...args) {{
        try {{
          const payload = {{
            type: "console",
            level,
            args: args.map((arg) => {{
              if (typeof arg === "string") return arg;
              if (arg === undefined) return "undefined";
              try {{
                const encoded = JSON.stringify(arg);
                return encoded === undefined ? String(arg) : encoded;
              }} catch (_err) {{
                return String(arg);
              }}
            }})
          }};
          window.ipc && window.ipc.postMessage(JSON.stringify(payload));
        }} catch (_err) {{}}
        return original.apply(console, args);
      }};
    }});
    Object.defineProperty(console, "__nextframeForwarded", {{ value: true }});
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

fn protocol_response(root: &Path, request: Request<Vec<u8>>) -> Result<Response<Vec<u8>>, String> {
    if request.uri().host() == Some("media") {
        return media_protocol_response(request);
    }
    frontend_protocol_response(root, request)
}

fn media_protocol_response(request: Request<Vec<u8>>) -> Result<Response<Vec<u8>>, String> {
    let path = media_path_from_query(request.uri().query().unwrap_or(""))?;
    let storage_root = crate::storage::JsonStorage::default_root()
        .map_err(|err| format!("storage root unavailable: {err}"))?
        .canonicalize()
        .map_err(|err| format!("storage root failed: {err}"))?;
    let file = PathBuf::from(path)
        .canonicalize()
        .map_err(|err| format!("media file missing: {err}"))?;
    if !file.starts_with(&storage_root) {
        return Ok(plain_response(403, b"forbidden".to_vec()));
    }
    let content = std::fs::read(&file).map_err(|err| format!("media read failed: {err}"))?;
    Response::builder()
        .header(CONTENT_TYPE, mime_for_path(&file))
        .body(content)
        .map_err(|err| err.to_string())
}

fn media_path_from_query(query: &str) -> Result<String, String> {
    for part in query.split('&') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        if key == "path" {
            return percent_decode(value);
        }
    }
    Err("missing media path".to_string())
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hi = hex_value(bytes[index + 1])?;
                let lo = hex_value(bytes[index + 2])?;
                out.push((hi << 4) | lo);
                index += 3;
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|err| format!("media path is not UTF-8: {err}"))
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("invalid percent encoding".to_string()),
    }
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
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        _ => "application/octet-stream",
    }
}
