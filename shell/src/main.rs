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

    let webview_url = webview_url()?;
    let webview_builder = WebViewBuilder::new()
        .with_initialization_script(r#"
            window.__ipc = window.__ipc || {};
            document.title = 'NextFrame [IPC Ready]';
            (function() {
                var orig = {log: console.log, warn: console.warn, error: console.error};
                function forward(level, args) {
                    try {
                        var msg = Array.from(args).map(function(a) {
                            return typeof a === 'string' ? a : JSON.stringify(a);
                        }).join(' ');
                        if (window.ipc && window.ipc.postMessage) {
                            window.ipc.postMessage(JSON.stringify({id:'_log',method:'log',params:{level:level,msg:msg}}));
                        } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
                            window.webkit.messageHandlers.ipc.postMessage(JSON.stringify({id:'_log',method:'log',params:{level:level,msg:msg}}));
                        }
                    } catch(e) {}
                }
                console.log = function() { orig.log.apply(console, arguments); forward('info', arguments); };
                console.warn = function() { orig.warn.apply(console, arguments); forward('warn', arguments); };
                console.error = function() { orig.error.apply(console, arguments); forward('error', arguments); };
                window.addEventListener('error', function(e) { forward('error', ['[uncaught] ' + e.message + ' at ' + e.filename + ':' + e.lineno]); });
                window.addEventListener('unhandledrejection', function(e) { forward('error', ['[unhandled-rejection] ' + (e.reason && e.reason.message || e.reason)]); });
            })();
        "#)
        .with_ipc_handler(move |request| {
            eprintln!("[shell] IPC received: {}", &request.body()[..request.body().len().min(200)]);
            let response = parse_request(request.body())
                .map(bridge::dispatch)
                .unwrap_or_else(invalid_request_response);
            eprintln!("[shell] IPC response ok={}", response.ok);

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
        .with_url(&webview_url);

    #[cfg(target_os = "macos")]
    let webview_builder = webview_builder
        .with_accept_first_mouse(false)
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

fn webview_url() -> Result<String, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../runtime/web/index.html")
        .canonicalize()?;

    Ok(format!("file://{}", path.display()))
}
