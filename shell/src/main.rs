#![deny(unused)]

use std::error::Error;
use std::path::Component;
use std::path::PathBuf;

use bridge::{Request, Response};
use serde_json::Value;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
#[cfg(target_os = "macos")]
use wry::BackgroundThrottlingPolicy;
use wry::WebViewBuilder;

fn main() {
    if let Err(error) = run() {
        eprintln!("failed to start shell: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    if let Err(error) = bridge::initialize() {
        eprintln!("bridge initialization warning: {error}");
    }

    let mut event_loop_builder = EventLoopBuilder::<String>::with_user_event();
    let event_loop = event_loop_builder.build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title("NextFrame")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .build(&event_loop)?;

    let web_root = web_root()?;
    let projects_root = projects_root()?;
    let web_root_for_protocol = web_root.clone();
    let projects_root_for_protocol = projects_root.clone();

    let webview_builder = WebViewBuilder::new()
        .with_initialization_script("window.__ipc = window.__ipc || {};")
        .with_custom_protocol("nf".into(), move |_webview_id, request| {
            let uri = request.uri().to_string();
            let relative_path = uri
                .strip_prefix("nf://localhost/")
                .or_else(|| uri.strip_prefix("nf://localhost"))
                .unwrap_or("index.html");
            let relative_path = if relative_path.is_empty() {
                "index.html"
            } else {
                relative_path
            };
            protocol_response(&web_root_for_protocol, relative_path)
        })
        .with_custom_protocol("nfdata".into(), move |_webview_id, request| {
            let uri = request.uri().to_string();
            let relative_path = uri
                .strip_prefix("nfdata://localhost/")
                .or_else(|| uri.strip_prefix("nfdata://localhost"))
                .unwrap_or("");
            protocol_response(&projects_root_for_protocol, relative_path)
        })
        .with_ipc_handler(move |request| {
            let body_preview = &request.body()[..request.body().len().min(300)];
            if !body_preview.contains("fs.mtime") {
                eprintln!("[ipc] {body_preview}");
            }
            let response = parse_request(request.body())
                .map(bridge::dispatch)
                .unwrap_or_else(invalid_request_response);

            match serde_json::to_string(&response) {
                Ok(response_json) => {
                    if let Err(error) = proxy.send_event(response_json) {
                        eprintln!("failed to queue IPC response: {error}");
                    }
                }
                Err(error) => {
                    eprintln!("failed to serialize IPC response: {error}");
                }
            }
        })
        .with_url("nf://localhost/index.html");

    #[cfg(target_os = "macos")]
    let webview_builder = webview_builder
        .with_accept_first_mouse(true)
        .with_background_throttling(BackgroundThrottlingPolicy::Disabled);

    let webview = webview_builder.build(&window)?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::UserEvent(response_json) => {
                let script = format!("window.__ipc.resolve({response_json});");
                if let Err(error) = webview.evaluate_script(&script) {
                    eprintln!("failed to deliver IPC response: {error}");
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}

fn parse_request(payload: &str) -> Result<Request, serde_json::Error> {
    serde_json::from_str(payload)
}

fn invalid_request_response(error: serde_json::Error) -> Response {
    Response {
        id: "invalid".to_string(),
        ok: false,
        result: Value::Null,
        error: Some(format!("invalid IPC request: {error}")),
    }
}

fn web_root() -> Result<PathBuf, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../runtime/web")
        .canonicalize()?;
    Ok(path)
}

fn projects_root() -> Result<PathBuf, Box<dyn Error>> {
    let home = bridge::path::home_dir().ok_or("home directory is unavailable")?;
    Ok(home.join("NextFrame").join("projects"))
}

fn protocol_response(root: &std::path::Path, relative_path: &str) -> wry::http::Response<std::borrow::Cow<'static, [u8]>> {
    let Some(safe_relative_path) = sanitize_relative_path(relative_path) else {
        return build_protocol_response(400, "text/plain", b"400".to_vec());
    };

    let file_path = root.join(safe_relative_path);
    match std::fs::read(&file_path) {
        Ok(content) => build_protocol_response(200, mime_for_path(&file_path), content),
        Err(_) => build_protocol_response(
            404,
            "text/plain",
            format!("404: {}", file_path.display()).into_bytes(),
        ),
    }
}

fn sanitize_relative_path(relative_path: &str) -> Option<PathBuf> {
    let decoded_path = percent_decode(relative_path)?;
    let mut sanitized = PathBuf::new();
    for component in PathBuf::from(decoded_path.trim_start_matches('/')).components() {
        match component {
            Component::Normal(part) => sanitized.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(sanitized)
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut index = 0usize;
    let mut decoded = Vec::with_capacity(bytes.len());

    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
                let byte = u8::from_str_radix(hex, 16).ok()?;
                decoded.push(byte);
                index += 3;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(decoded).ok()
}

fn mime_for_path(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("mp4") => "video/mp4",
        _ => "application/octet-stream",
    }
}

fn build_protocol_response(
    status: u16,
    mime: &'static str,
    content: Vec<u8>,
) -> wry::http::Response<std::borrow::Cow<'static, [u8]>> {
    wry::http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .body(std::borrow::Cow::<[u8]>::Owned(content))
        .unwrap_or_else(|_| wry::http::Response::new(std::borrow::Cow::Owned(Vec::new())))
}
