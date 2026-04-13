use std::error::Error;
use std::sync::Arc;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
#[cfg(target_os = "macos")]
use wry::BackgroundThrottlingPolicy;
use wry::{PageLoadEvent, WebViewBuilder};

use crate::app_control::{
    new_pending_appctl, poll_app_control_server, prune_expired_appctl_requests,
};
use crate::ipc::{handle_appctl_ipc_result, invalid_request_response, parse_request};
use crate::protocol::{projects_root, protocol_response, protocol_response_with_range, shell_init_script, web_root};

enum UserEvent {
    IpcResponse(String),
    WindowTitle(String),
}

pub(crate) fn run() -> Result<(), Box<dyn Error>> {
    if let Err(error) = bridge::initialize() {
        trace_log!("bridge initialization warning: {error}");
    }

    let mut event_loop_builder = EventLoopBuilder::<UserEvent>::with_user_event();
    let event_loop = event_loop_builder.build();
    let proxy = event_loop.create_proxy();
    let title_proxy = proxy.clone();
    let pending_appctl = new_pending_appctl();
    let pending_appctl_for_ipc = Arc::clone(&pending_appctl);

    let window = WindowBuilder::new()
        .with_title("NextFrame")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .build(&event_loop)?;
    trace_log!("[shell] window created");

    let web_root = web_root()?;
    let projects_root = projects_root()?;
    let web_root_for_protocol = web_root.clone();
    let projects_root_for_protocol = projects_root.clone();
    let webview_builder = WebViewBuilder::new()
        .with_initialization_script(shell_init_script())
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
            let relative_path = relative_path.split('?').next().unwrap_or(relative_path);
            let range_header = request
                .headers()
                .get("Range")
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            protocol_response_with_range(
                &projects_root_for_protocol,
                relative_path,
                range_header.as_deref(),
            )
        })
        .with_document_title_changed_handler(move |title| {
            let next_title = if title.trim().is_empty() {
                "NextFrame".to_string()
            } else {
                title
            };
            if let Err(error) = title_proxy.send_event(UserEvent::WindowTitle(next_title)) {
                trace_log!("failed to queue title update: {error}");
            }
        })
        .with_on_page_load_handler(move |event, url| match event {
            PageLoadEvent::Started => {
                trace_log!("[shell] page load started: {url}");
            }
            PageLoadEvent::Finished => {
                trace_log!("[shell] webview loaded");
            }
        })
        .with_ipc_handler(move |request| {
            let body = request.body();
            let body_preview = &body[..body.len().min(300)];
            match parse_request(body) {
                Ok(parsed_request) => {
                    let is_poll = parsed_request.method == "fs.mtime";
                    let is_fire_and_forget = matches!(
                        parsed_request.method.as_str(),
                        "log" | "shell.ready" | "appctl.result"
                    );

                    if !is_poll && !is_fire_and_forget {
                        trace_log!("[ipc] {body_preview}");
                    }

                    if parsed_request.method == "shell.ready" {
                        trace_log!("[shell] ready");
                        return;
                    }

                    if parsed_request.method == "appctl.result" {
                        handle_appctl_ipc_result(&pending_appctl_for_ipc, &parsed_request.params);
                        return;
                    }

                    let response = bridge::dispatch(parsed_request);
                    if is_fire_and_forget {
                        return;
                    }

                    match serde_json::to_string(&response) {
                        Ok(response_json) => {
                            if let Err(error) =
                                proxy.send_event(UserEvent::IpcResponse(response_json))
                            {
                                trace_log!("failed to queue IPC response: {error}");
                            }
                        }
                        Err(error) => {
                            trace_log!("failed to serialize IPC response: {error}");
                        }
                    }
                }
                Err(error) => {
                    let response = invalid_request_response(error);
                    match serde_json::to_string(&response) {
                        Ok(response_json) => {
                            if let Err(error) =
                                proxy.send_event(UserEvent::IpcResponse(response_json))
                            {
                                trace_log!("failed to queue IPC response: {error}");
                            }
                        }
                        Err(error) => {
                            trace_log!("failed to serialize IPC response: {error}");
                        }
                    }
                }
            }
        })
        .with_url("nf://localhost/index.html");

    #[cfg(target_os = "macos")]
    let webview_builder = webview_builder
        .with_accept_first_mouse(true)
        .with_background_throttling(BackgroundThrottlingPolicy::Disabled);

    let webview = match webview_builder.build(&window) {
        Ok(webview) => webview,
        Err(error) => {
            window.set_title(&format!("NextFrame - WebView Error: {error}"));
            return Err(Box::new(error));
        }
    };

    let listener = std::net::TcpListener::bind("127.0.0.1:19820").ok();
    if let Some(ref app_listener) = listener {
        app_listener.set_nonblocking(true).ok();
        trace_log!("[shell] app-control server on http://127.0.0.1:19820");
    } else {
        trace_log!("[shell] failed to bind app-control server on 127.0.0.1:19820");
    }
    let mut http_connections = Vec::new();
    let mut next_appctl_request_id = 0_u64;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;

        match event {
            Event::UserEvent(UserEvent::IpcResponse(response_json)) => {
                let script = format!("window.__ipc.resolve({response_json});");
                if let Err(error) = webview.evaluate_script(&script) {
                    trace_log!("failed to deliver IPC response: {error}");
                }
            }
            Event::UserEvent(UserEvent::WindowTitle(title)) => {
                window.set_title(&title);
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::MainEventsCleared => {
                if let Some(ref app_listener) = listener {
                    poll_app_control_server(
                        app_listener,
                        &mut http_connections,
                        &webview,
                        &pending_appctl,
                        &mut next_appctl_request_id,
                    );
                } else {
                    prune_expired_appctl_requests(&pending_appctl);
                }
            }
            _ => {}
        }
    });
}
