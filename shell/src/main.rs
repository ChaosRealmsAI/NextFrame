#![deny(unused)]

use std::error::Error;
use std::path::PathBuf;

use bridge::{Request, Response};
use serde_json::Value;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
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

    let webview_url = webview_url()?;
    let webview = WebViewBuilder::new(&window)
        .with_initialization_script("window.__ipc = window.__ipc || {};")
        .with_ipc_handler(move |payload| {
            let response = parse_request(&payload)
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
        .with_url(&webview_url)
        .build()?;

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

fn webview_url() -> Result<String, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../runtime/web/index.html")
        .canonicalize()?;

    Ok(format!("file://{}", path.display()))
}
