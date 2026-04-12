#![deny(unused)]

use std::error::Error;
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
    let web_root_for_protocol = web_root.clone();

    let webview_builder = WebViewBuilder::new()
        .with_initialization_script(
            "window.__ipc = window.__ipc || {};"
        )
        .with_custom_protocol("nf".into(), move |_webview_id, request| {
            let uri = request.uri().to_string();
            let path = uri
                .strip_prefix("nf://localhost/")
                .or_else(|| uri.strip_prefix("nf://localhost"))
                .unwrap_or("index.html");
            let path = if path.is_empty() { "index.html" } else { path };

            let file_path = web_root_for_protocol.join(path);
            let content = std::fs::read(&file_path).unwrap_or_else(|_| {
                format!("404: {}", file_path.display()).into_bytes()
            });

            let mime = match file_path.extension().and_then(|e| e.to_str()) {
                Some("html") => "text/html",
                Some("css") => "text/css",
                Some("js") => "application/javascript",
                Some("json") => "application/json",
                Some("png") => "image/png",
                Some("svg") => "image/svg+xml",
                _ => "application/octet-stream",
            };

            wry::http::Response::builder()
                .header("Content-Type", mime)
                .body(std::borrow::Cow::<[u8]>::Owned(content))
                .unwrap_or_else(|_| wry::http::Response::new(std::borrow::Cow::Owned(Vec::new())))
        })
        .with_ipc_handler(move |request| {
            eprintln!("[ipc] {}", &request.body()[..request.body().len().min(300)]);
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
