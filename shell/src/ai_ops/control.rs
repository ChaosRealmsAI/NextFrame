use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use wry::WebView;

use super::{
    build_navigate_script, decode_query_component, default_screenshot_path, native_screenshot,
    query_value, queue_appctl_script, split_path_and_query,
};
use crate::http::{read_http_request, write_http_response, HttpConnection, HttpRequest};

pub(crate) type PendingAppCtlMap = Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>;

pub(crate) struct PendingAppCtlRequest {
    pub(crate) stream: TcpStream,
    pub(crate) success_content_type: &'static str,
    pub(crate) started_at: Instant,
}

pub(crate) fn new_pending_appctl() -> PendingAppCtlMap {
    Arc::new(Mutex::new(HashMap::new()))
}

pub(crate) fn poll_app_control_server(
    listener: &TcpListener,
    connections: &mut Vec<HttpConnection>,
    webview: &WebView,
    pending_appctl: &PendingAppCtlMap,
    next_request_id: &mut u64,
) {
    loop {
        match listener.accept() {
            Ok((stream, addr)) => {
                if let Err(error) = stream.set_nonblocking(true) {
                    trace_log!("[appctl] failed to set non-blocking stream from {addr}: {error}");
                    continue;
                }
                connections.push(HttpConnection {
                    stream,
                    buffer: Vec::new(),
                    accepted_at: Instant::now(),
                });
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => break,
            Err(error) => {
                trace_log!("[appctl] accept failed: {error}");
                break;
            }
        }
    }

    let mut index = 0;
    while index < connections.len() {
        let parsed_request = {
            let connection = &mut connections[index];
            read_http_request(connection)
        };

        match parsed_request {
            Ok(Some(request)) => {
                let mut connection = connections.swap_remove(index);
                if let Err(error) = handle_http_request(
                    request,
                    &mut connection.stream,
                    webview,
                    pending_appctl,
                    next_request_id,
                ) {
                    trace_log!("[appctl] request handling failed: {error}");
                    let _ = write_http_response(
                        &mut connection.stream,
                        500,
                        "Internal Server Error",
                        "text/plain; charset=utf-8",
                        error.as_bytes(),
                    );
                }
            }
            Ok(None) => {
                if connections[index].accepted_at.elapsed() > Duration::from_secs(10) {
                    let mut connection = connections.swap_remove(index);
                    let _ = write_http_response(
                        &mut connection.stream,
                        408,
                        "Request Timeout",
                        "text/plain; charset=utf-8",
                        b"request timed out",
                    );
                } else {
                    index += 1;
                }
            }
            Err(error) => {
                let mut connection = connections.swap_remove(index);
                let _ = write_http_response(
                    &mut connection.stream,
                    400,
                    "Bad Request",
                    "text/plain; charset=utf-8",
                    error.as_bytes(),
                );
            }
        }
    }

    prune_expired_appctl_requests(pending_appctl);
}
fn handle_http_request(
    request: HttpRequest,
    stream: &mut TcpStream,
    webview: &WebView,
    pending_appctl: &PendingAppCtlMap,
    next_request_id: &mut u64,
) -> Result<(), String> {
    let (path, query) = split_path_and_query(&request.path);
    match (request.method.as_str(), path) {
        ("GET", "/status") | ("GET", "/diagnose") => {
            let script = r#"(function() {
  if (typeof window.__diagnose === "function") {
    try {
      return JSON.parse(window.__diagnose());
    } catch (_) {
      return window.__diagnose();
    }
  }
  return {
    title: document.title || "NextFrame",
    location: String(window.location),
    viewActive: document.querySelector(".view.active")?.id || "none"
  };
})()"#;
            queue_appctl_script(
                webview,
                script,
                stream,
                pending_appctl,
                next_request_id,
                "application/json; charset=utf-8",
            )
        }
        ("POST", "/eval") => {
            let script = String::from_utf8(request.body)
                .map_err(|error| format!("invalid UTF-8 body: {error}"))?;
            queue_appctl_script(
                webview,
                &script,
                stream,
                pending_appctl,
                next_request_id,
                "text/plain; charset=utf-8",
            )
        }
        ("POST", "/navigate") => {
            let payload = if request.body.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice::<Value>(&request.body)
                    .map_err(|error| format!("invalid JSON body: {error}"))?
            };
            let navigation_script = build_navigate_script(&payload)?;
            queue_appctl_script(
                webview,
                &navigation_script,
                stream,
                pending_appctl,
                next_request_id,
                "application/json; charset=utf-8",
            )
        }
        ("GET", "/screenshot") => {
            let requested_path = match query_value(query, "out") {
                Some(raw_path) => {
                    Some(match decode_query_component(raw_path) {
                        Ok(path) => path,
                        Err(error) => {
                            return write_http_response(
                                stream,
                                400,
                                "Bad Request",
                                "text/plain; charset=utf-8",
                                error.as_bytes(),
                            )
                            .map_err(|write_error| {
                                format!(
                                    "failed to write screenshot query error response: {write_error}"
                                )
                            });
                        }
                    })
                }
                None => None,
            };
            let out_path = requested_path.unwrap_or_else(default_screenshot_path);
            if out_path.trim().is_empty() {
                return write_http_response(
                    stream,
                    400,
                    "Bad Request",
                    "text/plain; charset=utf-8",
                    b"missing screenshot output path",
                )
                .map_err(|error| {
                    format!("failed to write screenshot output path error response: {error}")
                });
            }
            native_screenshot(webview, &out_path, stream)
        }
        _ => write_http_response(
            stream,
            404,
            "Not Found",
            "text/plain; charset=utf-8",
            b"unknown app-control endpoint",
        )
        .map_err(|error| format!("failed to write HTTP 404 response: {error}")),
    }
}

pub(crate) fn prune_expired_appctl_requests(pending_appctl: &PendingAppCtlMap) {
    let expired_ids = match pending_appctl.lock() {
        Ok(requests) => requests
            .iter()
            .filter_map(|(req_id, pending)| {
                if pending.started_at.elapsed() > Duration::from_secs(10) {
                    Some(req_id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>(),
        Err(error) => {
            trace_log!("[appctl] pending request state poisoned: {error}");
            return;
        }
    };

    if expired_ids.is_empty() {
        return;
    }

    let mut expired_requests = Vec::new();
    if let Ok(mut requests) = pending_appctl.lock() {
        for req_id in expired_ids {
            if let Some(request) = requests.remove(&req_id) {
                expired_requests.push((req_id, request));
            }
        }
    }

    for (req_id, mut request) in expired_requests {
        trace_log!("[appctl] request timed out: {req_id}");
        let _ = write_http_response(
            &mut request.stream,
            504,
            "Gateway Timeout",
            "text/plain; charset=utf-8",
            b"desktop app evaluation timed out",
        );
    }
}
