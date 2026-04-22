use std::io::Write;
use std::sync::Arc;

use nf_shell::errors::NfError;
use nf_shell::events::UserEvent;
use nf_shell::handlers::ComposeOpHandler;
use nf_shell::handlers::app::AppOpHandler;
use nf_shell::ipc_server::{self, IpcRequest, IpcResponse, OpHandler, ok_response};
use nf_shell::window_manager::WindowManager;
use serde_json::json;
use tao::dpi::LogicalSize;
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Window, WindowBuilder};

fn main() {
    if std::env::args().any(|arg| arg == "--version" || arg == "-V") {
        println!("nf-shell {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    let mut builder = EventLoopBuilder::<UserEvent>::with_user_event();
    let event_loop = builder.build();
    let proxy = event_loop.create_proxy();
    let handler = match ComposeOpHandler::from_default_storage() {
        Ok(handler) => Arc::new(handler),
        Err(err) => {
            eprintln!("{}", err.to_record().detail);
            std::process::exit(i32::from(err.exit_code()));
        }
    };

    if let Err(err) = ipc_server::spawn_server_thread(proxy.clone(), handler.clone()) {
        eprintln!("nf-shell IPC failed to start: {err}");
        std::process::exit(1);
    }

    let socket_path = ipc_server::socket_path();
    let mut stdout = std::io::stdout().lock();
    let _write_result = writeln!(
        stdout,
        "{{\"event\":\"ready\",\"bin\":\"nf-shell\",\"version\":\"{}\",\"sock\":\"{}\"}}",
        env!("CARGO_PKG_VERSION"),
        socket_path.display()
    );
    let _flush_result = stdout.flush();

    let mut manager = WindowManager::new();
    let mut keepalive_window: Option<Window> = None;

    event_loop.run(move |event, target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                if keepalive_window.is_none() {
                    keepalive_window = WindowBuilder::new()
                        .with_title("NextFrame Shell")
                        .with_decorations(false)
                        .with_inner_size(LogicalSize::new(1.0, 1.0))
                        .with_visible(true)
                        .build(target)
                        .ok();
                }
            }
            Event::LoopDestroyed => {
                manager.quit_all();
                let _cleanup_result = std::fs::remove_file(ipc_server::socket_path());
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                window_id,
                ..
            } => {
                let _removed = manager.remove_by_tao_window_id(window_id);
            }
            Event::UserEvent(event) => match event {
                UserEvent::OpenWindow { request, ack } => {
                    let response = AppOpHandler::open(&mut manager, target, &proxy, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::CloseWindow { request, ack } => {
                    let response = AppOpHandler::close(&mut manager, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::StateQuery { request, ack } => {
                    let response = AppOpHandler::state_query(&manager, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::ClickSim { request, ack } => {
                    AppOpHandler::click(&manager, request, ack);
                }
                UserEvent::Screenshot { request, ack } => {
                    AppOpHandler::screenshot(&manager, request, ack);
                }
                UserEvent::CaptureWindow { request, ack } => {
                    let response = AppOpHandler::capture(&mut manager, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::DevtoolsQuery { request, ack } => {
                    AppOpHandler::devtools_query(&manager, request, ack);
                }
                UserEvent::IpcFromJs { window_id, body } => {
                    handle_js_ipc(&manager, handler.as_ref(), &window_id, &body);
                }
                UserEvent::Quit { request, ack } => {
                    manager.quit_all();
                    let _cleanup_result = std::fs::remove_file(ipc_server::socket_path());
                    let response = ok_response(&request, serde_json::json!({ "quit": true }));
                    let _send_result = ack.send(response);
                    *control_flow = ControlFlow::Exit;
                }
            },
            _ => {}
        }
    });
}

fn handle_js_ipc(manager: &WindowManager, handler: &ComposeOpHandler, window_id: &str, body: &str) {
    let trimmed = body.trim();
    if trimmed == "drag_window" {
        if let Ok(window) = manager.window_by_id(window_id) {
            let _ = window.drag_window();
        }
        return;
    }
    if trimmed == "maximize_toggle" {
        if let Ok(window) = manager.window_by_id(window_id) {
            let next = !window.is_maximized();
            window.set_maximized(next);
        }
        return;
    }
    let response = dispatch_js_ipc(handler, body);
    let Ok(response_json) = serde_json::to_string(&response) else {
        return;
    };
    let script = format!(
        "window.__NEXTFRAME_IPC_RESOLVE__ && window.__NEXTFRAME_IPC_RESOLVE__({response_json});"
    );

    if let Ok(webview) = manager.webview_by_window_id(window_id) {
        if let Err(err) = webview.evaluate_script(&script) {
            log_js_ipc_issue(window_id, format!("webview callback failed: {err}"));
        }
    } else {
        log_js_ipc_issue(window_id, "webview missing for JS IPC response".to_string());
    }
}

fn dispatch_js_ipc(handler: &dyn OpHandler, body: &str) -> IpcResponse {
    let request = match serde_json::from_str::<IpcRequest>(body) {
        Ok(request) => normalize_js_request(request),
        Err(err) => {
            return IpcResponse {
                req_id: "parse-error".to_string(),
                ok: false,
                data: None,
                error: Some(json!({
                    "error": "validation failed",
                    "detail": format!("invalid webview IPC request: {err}"),
                    "hint": "send { req_id, op, params } as JSON",
                    "exit_code": 2
                })),
            };
        }
    };

    match handler.handle(&request) {
        Ok(Some(data)) => ok_response(&request, data),
        Ok(None) => IpcResponse {
            req_id: request.req_id,
            ok: false,
            data: None,
            error: Some(json!(
                NfError::ValidationFailed(format!("unknown op: {}", request.op)).to_record()
            )),
        },
        Err(err) => IpcResponse {
            req_id: request.req_id,
            ok: false,
            data: None,
            error: Some(json!(err.to_record())),
        },
    }
}

fn normalize_js_request(mut request: IpcRequest) -> IpcRequest {
    if let Some((prefix, rest)) = request.op.split_once('.') {
        request.op = format!("{prefix}-{rest}");
    }
    request
}

fn log_js_ipc_issue(window_id: &str, detail: String) {
    let mut stdout = std::io::stdout().lock();
    let event = json!({
        "event": "ipc-from-js-error",
        "window_id": window_id,
        "detail": detail
    });
    let _write_result = writeln!(stdout, "{}", event);
    let _flush_result = stdout.flush();
}
