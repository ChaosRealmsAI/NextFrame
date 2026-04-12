#![deny(unused)]

/// Logging macro that auto-prepends file:line for AI-readable logs.
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

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
use wry::{PageLoadEvent, WebViewBuilder};

enum UserEvent {
    IpcResponse(String),
    WindowTitle(String),
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
                    let is_fire_and_forget =
                        parsed_request.method == "log" || parsed_request.method == "shell.ready";

                    if !is_poll && !is_fire_and_forget {
                        trace_log!("[ipc] {body_preview}");
                    }

                    if parsed_request.method == "shell.ready" {
                        trace_log!("[shell] ready");
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

    // AI command queue file — CLI writes commands here, shell polls and executes
    let cmd_path = std::env::temp_dir().join("nextframe-cmd.js");
    let result_path = std::env::temp_dir().join("nextframe-cmd-result.txt");
    // Clear any stale commands
    let _ = std::fs::remove_file(&cmd_path);
    let _ = std::fs::remove_file(&result_path);
    trace_log!("[shell] AI command queue: {}", cmd_path.display());

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(
            std::time::Instant::now() + std::time::Duration::from_millis(200)
        );

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
            Event::NewEvents(tao::event::StartCause::ResumeTimeReached { .. }) => {
                // Poll for AI commands
                if let Ok(script) = std::fs::read_to_string(&cmd_path) {
                    if !script.trim().is_empty() {
                        trace_log!("[shell] executing AI command: {}...", &script[..script.len().min(100)]);
                        let _ = std::fs::remove_file(&cmd_path);
                        // Execute the JS and capture result via a callback
                        let result_path_clone = result_path.clone();
                        let capture_script = format!(
                            r#"(function(){{ try {{ var r = (function(){{ {script} }})(); var s = typeof r === 'string' ? r : JSON.stringify(r); window.ipc.postMessage(JSON.stringify({{id:'_cmd_result',method:'log',params:{{level:'cmd_result',msg:s}}}})); }} catch(e) {{ window.ipc.postMessage(JSON.stringify({{id:'_cmd_result',method:'log',params:{{level:'cmd_error',msg:e.message}}}})); }} }})()"#
                        );
                        if let Err(error) = webview.evaluate_script(&capture_script) {
                            trace_log!("[shell] AI command failed: {error}");
                            let _ = std::fs::write(&result_path_clone, format!("ERROR: {error}"));
                        }
                    }
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
