#![deny(unused)]

/// Logging macro that auto-prepends file:line for AI-readable logs.
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

use std::collections::HashMap;
use std::error::Error;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::Component;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use bridge::{Request, Response};
use serde_json::Value;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
#[cfg(target_os = "macos")]
use wry::BackgroundThrottlingPolicy;
#[cfg(target_os = "macos")]
use wry::WebViewExtMacOS;
use wry::{PageLoadEvent, WebViewBuilder};

enum UserEvent {
    IpcResponse(String),
    WindowTitle(String),
}

struct HttpConnection {
    stream: TcpStream,
    buffer: Vec<u8>,
    accepted_at: Instant,
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

struct PendingAppCtlRequest {
    stream: TcpStream,
    success_content_type: &'static str,
    started_at: Instant,
}

fn main() {
    if let Err(error) = run() {
        trace_log!("failed to start shell: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    if let Err(error) = bridge::initialize() {
        trace_log!("bridge initialization warning: {error}");
    }

    let mut event_loop_builder = EventLoopBuilder::<UserEvent>::with_user_event();
    let event_loop = event_loop_builder.build();
    let proxy = event_loop.create_proxy();
    let title_proxy = proxy.clone();
    let pending_appctl = Arc::new(Mutex::new(HashMap::<String, PendingAppCtlRequest>::new()));
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
            protocol_response(&projects_root_for_protocol, relative_path)
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

    let listener = TcpListener::bind("127.0.0.1:19820").ok();
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

fn handle_appctl_ipc_result(
    pending_appctl: &Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>,
    params: &Value,
) {
    let Some(req_id) = params.get("reqId").and_then(Value::as_str) else {
        trace_log!("[appctl] missing reqId in IPC result");
        return;
    };
    let ok = params.get("ok").and_then(Value::as_bool).unwrap_or(true);
    let payload = if ok {
        params
            .get("result")
            .and_then(Value::as_str)
            .unwrap_or("null")
            .to_string()
    } else {
        params
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("app control evaluation failed")
            .to_string()
    };

    let pending_request = match pending_appctl.lock() {
        Ok(mut requests) => requests.remove(req_id),
        Err(error) => {
            trace_log!("[appctl] pending request state poisoned: {error}");
            None
        }
    };

    let Some(mut pending_request) = pending_request else {
        trace_log!("[appctl] no pending request for {req_id}");
        return;
    };

    let status = if ok { 200 } else { 500 };
    let status_text = if ok { "OK" } else { "Internal Server Error" };
    if let Err(error) = write_http_response(
        &mut pending_request.stream,
        status,
        status_text,
        if ok {
            pending_request.success_content_type
        } else {
            "text/plain; charset=utf-8"
        },
        payload.as_bytes(),
    ) {
        trace_log!("[appctl] failed to reply to {req_id}: {error}");
    }
}

fn poll_app_control_server(
    listener: &TcpListener,
    connections: &mut Vec<HttpConnection>,
    webview: &wry::WebView,
    pending_appctl: &Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>,
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

fn read_http_request(connection: &mut HttpConnection) -> Result<Option<HttpRequest>, String> {
    let mut chunk = [0_u8; 8192];
    loop {
        match connection.stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read_len) => connection.buffer.extend_from_slice(&chunk[..read_len]),
            Err(error) if error.kind() == ErrorKind::WouldBlock => break,
            Err(error) => return Err(format!("failed to read request: {error}")),
        }
    }

    let Some(header_end) = connection
        .buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
    else {
        return Ok(None);
    };

    let header_bytes = &connection.buffer[..header_end];
    let header_text = std::str::from_utf8(header_bytes)
        .map_err(|error| format!("invalid header utf-8: {error}"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing HTTP request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "missing HTTP method".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "missing HTTP path".to_string())?
        .to_string();

    let mut content_length = 0_usize;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            content_length = value
                .trim()
                .parse::<usize>()
                .map_err(|error| format!("invalid Content-Length: {error}"))?;
        }
    }

    let body_offset = header_end + 4;
    let total_len = body_offset + content_length;
    if connection.buffer.len() < total_len {
        return Ok(None);
    }

    Ok(Some(HttpRequest {
        method,
        path,
        body: connection.buffer[body_offset..total_len].to_vec(),
    }))
}

fn handle_http_request(
    request: HttpRequest,
    stream: &mut TcpStream,
    webview: &wry::WebView,
    pending_appctl: &Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>,
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
        ("GET", "/pipeline/status") => {
            let script = r#"(function() {
  return JSON.stringify({
    project: currentProject,
    episode: currentEpisode,
    stage: pipelineStage,
    view: document.querySelector(".view.active")?.id,
    data: pipelineData ? {
      scriptSegments: pipelineData.script?.segments?.length || 0,
      audioSegments: pipelineData.audio?.segments?.length || 0,
      atoms: pipelineData.atoms?.length || 0,
      outputs: pipelineData.outputs?.length || 0
    } : null
  });
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
                            format!("failed to write screenshot query error response: {write_error}")
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

fn queue_appctl_script(
    webview: &wry::WebView,
    source: &str,
    stream: &mut TcpStream,
    pending_appctl: &Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>,
    next_request_id: &mut u64,
    success_content_type: &'static str,
) -> Result<(), String> {
    let req_id = next_appctl_request_id(next_request_id);
    let script = appctl_eval_script(&req_id, source)?;
    let owned_stream = stream
        .try_clone()
        .map_err(|error| format!("failed to clone response stream: {error}"))?;

    match pending_appctl.lock() {
        Ok(mut requests) => {
            requests.insert(
                req_id.clone(),
                PendingAppCtlRequest {
                    stream: owned_stream,
                    success_content_type,
                    started_at: Instant::now(),
                },
            );
        }
        Err(error) => {
            return Err(format!("pending request state poisoned: {error}"));
        }
    }

    if let Err(error) = webview.evaluate_script(&script) {
        if let Ok(mut requests) = pending_appctl.lock() {
            requests.remove(&req_id);
        }
        return Err(format!("failed to evaluate app control script: {error}"));
    }

    Ok(())
}

fn next_appctl_request_id(counter: &mut u64) -> String {
    *counter += 1;
    format!("nf-appctl-{}-{counter}", now_unix_millis())
}

fn appctl_eval_script(req_id: &str, source: &str) -> Result<String, String> {
    let req_id_json = serde_json::to_string(req_id)
        .map_err(|error| format!("failed to encode reqId: {error}"))?;
    let source_json = serde_json::to_string(source)
        .map_err(|error| format!("failed to encode script source: {error}"))?;
    Ok(format!(
        r#"(function() {{
  var __nfReqId = {req_id_json};
  var __nfSource = {source_json};
  function __nfReply(ok, value) {{
    if (typeof window.__nfAppCtlRespond === "function") {{
      window.__nfAppCtlRespond(__nfReqId, ok, value);
      return;
    }}
    throw new Error("window.__nfAppCtlRespond is unavailable");
  }}
  try {{
    Promise.resolve((0, eval)(__nfSource)).then(function(value) {{
      __nfReply(true, value);
    }}, function(error) {{
      __nfReply(false, error);
    }});
  }} catch (error) {{
    __nfReply(false, error);
  }}
}})();"#,
    ))
}

fn build_navigate_script(payload: &Value) -> Result<String, String> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|error| format!("failed to encode navigate payload: {error}"))?;
    Ok(format!(
        r#"(async function() {{
  var payload = {payload_json};
  var view = payload && typeof payload.view === "string" ? payload.view : null;
  var hasSegment = payload && Object.prototype.hasOwnProperty.call(payload, "segment");
  if (view === "project") {{
    await goProject(payload.project || null);
  }} else if (view === "pipeline") {{
    await goPipeline(
      payload && typeof payload.project === "string" ? payload.project : null,
      payload && typeof payload.episode === "string" ? payload.episode : null
    );
  }} else {{
    await goEditor(
      payload && typeof payload.project === "string" ? payload.project : null,
      payload && typeof payload.episode === "string" ? payload.episode : null,
      hasSegment && typeof payload.segment === "string" ? payload.segment : null
    );
  }}
  if (typeof window.__diagnose === "function") {{
    try {{
      return JSON.parse(window.__diagnose());
    }} catch (_) {{
      return window.__diagnose();
    }}
  }}
  return {{
    view: view || "editor",
    project: payload && payload.project ? payload.project : null,
    episode: payload && payload.episode ? payload.episode : null,
    segment: hasSegment ? payload.segment : null
  }};
}})()"#,
    ))
}

#[cfg(target_os = "macos")]
fn native_screenshot(
    webview: &wry::WebView,
    out_path: &str,
    stream: &mut TcpStream,
) -> Result<(), String> {
    use std::cell::RefCell;
    use std::rc::Rc;

    use block2::RcBlock;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::WKSnapshotConfiguration;

    let mtm = MainThreadMarker::new().ok_or("native_screenshot must run on the main thread")?;

    let wk_webview = webview.webview();
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };

    type Slot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
    let slot: Slot = Rc::new(RefCell::new(None));
    let slot_clone = slot.clone();

    let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        autoreleasepool(|_| {
            let result = if let Some(error) = unsafe { error.as_ref() } {
                Err(format!(
                    "WKWebView.takeSnapshot error: {}",
                    error.localizedDescription()
                ))
            } else if let Some(image) = unsafe { Retained::retain(image) } {
                Ok(image)
            } else {
                Err("WKWebView.takeSnapshot returned nil".into())
            };
            *slot_clone.borrow_mut() = Some(result);
        });
    });

    unsafe {
        wk_webview.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
    }

    let started = Instant::now();
    while slot.borrow().is_none() {
        if started.elapsed() > Duration::from_secs(10) {
            return write_http_response(
                stream,
                500,
                "Internal Server Error",
                "text/plain; charset=utf-8",
                b"timed out waiting for WKWebView.takeSnapshot",
            )
            .map_err(|e| format!("failed to write timeout response: {e}"));
        }
        std::thread::sleep(Duration::from_millis(10));
        // Pump the run loop so the completion handler fires
        #[allow(clippy::undocumented_unsafe_blocks)]
        unsafe {
            use objc2_foundation::NSDate;
            let run_loop: *mut objc2::runtime::AnyObject =
                objc2::msg_send![objc2::class!(NSRunLoop), currentRunLoop];
            let until = NSDate::dateWithTimeIntervalSinceNow(0.01);
            let _: () = objc2::msg_send![run_loop, runUntilDate: &*until];
        }
    }

    let image = slot
        .borrow_mut()
        .take()
        .ok_or("snapshot slot empty")?
        .map_err(|e| format!("snapshot failed: {e}"))?;

    // Convert NSImage → PNG data
    let tiff_data = image
        .TIFFRepresentation()
        .ok_or("failed to get TIFF data from NSImage")?;
    let bitmap_rep = NSBitmapImageRep::imageRepWithData(&tiff_data)
        .ok_or("failed to create NSBitmapImageRep")?;

    // NSBitmapImageFileType.PNG = 4
    let png_data: Option<Retained<NSData>> = unsafe {
        objc2::msg_send![&bitmap_rep, representationUsingType: 4_usize, properties: std::ptr::null::<objc2::runtime::AnyObject>()]
    };
    let png_data = png_data.ok_or("failed to generate PNG data")?;

    let png_len: usize = unsafe { objc2::msg_send![&*png_data, length] };
    let png_ptr: *const u8 = unsafe { objc2::msg_send![&*png_data, bytes] };
    let png_bytes = if png_ptr.is_null() || png_len == 0 {
        return Err("PNG data is empty".into());
    } else {
        unsafe { std::slice::from_raw_parts(png_ptr, png_len) }
    };
    let out_path_buf = PathBuf::from(out_path);
    if let Some(parent) = out_path_buf
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed to create screenshot directory {}: {e}",
                parent.display()
            )
        })?;
    }
    std::fs::write(&out_path_buf, png_bytes)
        .map_err(|e| format!("failed to write PNG to {}: {e}", out_path_buf.display()))?;

    let response_json = serde_json::json!({
        "path": out_path_buf.display().to_string(),
        "mode": "native-wkwebview",
        "size": png_bytes.len(),
    });
    write_http_response(
        stream,
        200,
        "OK",
        "application/json; charset=utf-8",
        response_json.to_string().as_bytes(),
    )
    .map_err(|e| format!("failed to write response: {e}"))
}

#[cfg(not(target_os = "macos"))]
fn native_screenshot(
    _webview: &wry::WebView,
    _out_path: &str,
    stream: &mut TcpStream,
) -> Result<(), String> {
    write_http_response(
        stream,
        501,
        "Not Implemented",
        "text/plain; charset=utf-8",
        b"native screenshot only available on macOS",
    )
    .map_err(|e| format!("failed to write response: {e}"))
}

fn split_path_and_query(path: &str) -> (&str, Option<&str>) {
    match path.split_once('?') {
        Some((base, query)) => (base, Some(query)),
        None => (path, None),
    }
}

fn query_value<'a>(query: Option<&'a str>, key: &str) -> Option<&'a str> {
    query.and_then(|query| {
        query.split('&').find_map(|part| {
            let (name, value) = part.split_once('=').unwrap_or((part, ""));
            if name == key {
                Some(value)
            } else {
                None
            }
        })
    })
}

fn decode_query_component(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err("invalid percent-encoding in query string".to_string());
                }
                let hi = decode_hex_nibble(bytes[index + 1])?;
                let lo = decode_hex_nibble(bytes[index + 2])?;
                output.push((hi << 4) | lo);
                index += 3;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(output).map_err(|error| format!("invalid UTF-8 in query string: {error}"))
}

fn decode_hex_nibble(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("invalid percent-encoding in query string".to_string()),
    }
}

fn default_screenshot_path() -> String {
    std::env::temp_dir()
        .join(format!("nf-screenshot-{}.png", now_unix_millis()))
        .display()
        .to_string()
}

fn now_unix_millis() -> u128 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis(),
        Err(_) => 0,
    }
}

fn prune_expired_appctl_requests(
    pending_appctl: &Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>,
) {
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

fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let _ = stream.set_nonblocking(false);
    let header = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()?;
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
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

fn protocol_response(
    root: &std::path::Path,
    relative_path: &str,
) -> wry::http::Response<std::borrow::Cow<'static, [u8]>> {
    let Some(safe_relative_path) = sanitize_relative_path(relative_path) else {
        return build_protocol_response(400, "text/plain", b"400".to_vec());
    };

    let file_path = root.join(safe_relative_path);
    match std::fs::read(&file_path) {
        Ok(content) => build_protocol_response(200, mime_for_path(&file_path), content),
        Err(error) => {
            let html_request = matches!(
                file_path
                    .extension()
                    .and_then(|extension| extension.to_str()),
                Some("html")
            ) || relative_path == "index.html";

            if html_request {
                build_protocol_response(
                    404,
                    "text/html",
                    load_error_page(&file_path, &error).into_bytes(),
                )
            } else {
                build_protocol_response(
                    404,
                    "text/plain",
                    format!("404: {}", file_path.display()).into_bytes(),
                )
            }
        }
    }
}

fn shell_init_script() -> &'static str {
    r#"
window.__ipc = window.__ipc || {};
window.__ipc.resolve = window.__ipc.resolve || function() {};
(function() {
  if (window.__nfShellInitInstalled) {
    return;
  }
  window.__nfShellInitInstalled = true;

  var logCounter = 0;

  function getPostMessage() {
    if (window.ipc && typeof window.ipc.postMessage === "function") {
      return function(message) { window.ipc.postMessage(message); };
    }
    if (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.ipc &&
      typeof window.webkit.messageHandlers.ipc.postMessage === "function"
    ) {
      return function(message) { window.webkit.messageHandlers.ipc.postMessage(message); };
    }
    return null;
  }

  function formatValue(value) {
    if (value instanceof Error) {
      return value.stack || (value.name + ": " + value.message);
    }
    if (typeof value === "string") {
      return value;
    }
    if (value === undefined) {
      return "undefined";
    }
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  function send(method, params) {
    var postMessage = getPostMessage();
    if (!postMessage) {
      return false;
    }
    try {
      postMessage(JSON.stringify({
        id: "shell-" + Date.now() + "-" + (++logCounter),
        method: method,
        params: params || {}
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  window.__nfShellPost = send;
  window.__nfShellFormatValue = formatValue;
  window.__nfAppCtlRespond = function(reqId, ok, value) {
    return send("appctl.result", {
      reqId: reqId,
      ok: !!ok,
      result: ok ? formatValue(value) : undefined,
      error: ok ? undefined : formatValue(value)
    });
  };

  function setErrorTitle(message) {
    var summary = String(message || "Unknown error").slice(0, 120);
    document.title = "NextFrame - Error: " + summary;
  }

  var originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  ["log", "warn", "error"].forEach(function(level) {
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      send("log", {
        level: level,
        msg: args.map(formatValue).join(" ")
      });
      if (level === "error") {
        setErrorTitle(args.map(formatValue).join(" "));
      }
      originalConsole[level].apply(console, args);
    };
  });

  window.onerror = function(message, source, lineno, colno, error) {
    var detail = [
      String(message || "Unhandled error"),
      source ? "at " + source + ":" + lineno + ":" + colno : ""
    ].filter(Boolean).join(" ");
    var fullMessage = error && error.stack ? detail + "\n" + error.stack : detail;
    send("log", { level: "error", msg: fullMessage });
    setErrorTitle(message || fullMessage);
  };

  window.onunhandledrejection = function(event) {
    var reason = event && "reason" in event ? event.reason : event;
    var message = "Unhandled rejection: " + formatValue(reason);
    send("log", { level: "error", msg: message });
    setErrorTitle(message);
  };

  window.addEventListener("DOMContentLoaded", function() {
    send("shell.ready", { url: window.location.href });
  }, { once: true });
})();
"#
}

fn load_error_page(path: &std::path::Path, error: &std::io::Error) -> String {
    let path_display = path.display();
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>NextFrame - Load Error</title></head><body><h1>NextFrame Load Error</h1><p>Failed to load <code>{path_display}</code>.</p><pre>{error}</pre></body></html>"
    )
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
