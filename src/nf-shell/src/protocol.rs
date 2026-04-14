//! asset protocol helpers
use std::error::Error;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};

pub(crate) fn web_root() -> Result<PathBuf, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../nf-runtime/web")
        .canonicalize()?;
    Ok(path)
}

pub(crate) fn projects_root() -> Result<PathBuf, Box<dyn Error>> {
    let home = nf_bridge::path::home_dir().ok_or("home directory is unavailable")?;
    Ok(home.join("NextFrame").join("projects"))
}

pub(crate) fn protocol_response(
    root: &Path,
    relative_path: &str,
) -> wry::http::Response<std::borrow::Cow<'static, [u8]>> {
    protocol_response_with_range(root, relative_path, None)
}

pub(crate) fn protocol_response_with_range(
    root: &Path,
    relative_path: &str,
    range_header: Option<&str>,
) -> wry::http::Response<std::borrow::Cow<'static, [u8]>> {
    let Some(safe_relative_path) = sanitize_relative_path(relative_path) else {
        return build_protocol_response(400, "text/plain", b"400".to_vec());
    };

    let file_path = root.join(safe_relative_path);
    let mime = mime_for_path(&file_path);

    // Try Range request for media files
    if let Some(range) = range_header {
        if let Ok(meta) = std::fs::metadata(&file_path) {
            let file_size = meta.len();
            if let Some((start, end)) = parse_range_header(range, file_size) {
                let chunk_size = end - start + 1;
                // Cap chunk at 2MB to avoid huge allocations
                let capped = chunk_size.min(2 * 1024 * 1024);

                if let Ok(mut file) = File::open(&file_path) {
                    if file.seek(SeekFrom::Start(start)).is_ok() {
                        let mut buf = vec![0u8; capped as usize];
                        if let Ok(n) = file.read(&mut buf) {
                            buf.truncate(n);
                            let actual_end = start + n as u64 - 1;
                            return wry::http::Response::builder()
                                .status(206)
                                .header("Content-Type", mime)
                                .header("Accept-Ranges", "bytes")
                                .header("Content-Length", n.to_string())
                                .header(
                                    "Content-Range",
                                    format!("bytes {}-{}/{}", start, actual_end, file_size),
                                )
                                .body(std::borrow::Cow::Owned(buf))
                                .unwrap_or_else(|_| {
                                    wry::http::Response::new(std::borrow::Cow::Owned(Vec::new()))
                                });
                        }
                    }
                }
            }
        }
    }

    // Full file read (non-range or range parse failed)
    match std::fs::read(&file_path) {
        Ok(content) => {
            let len = content.len();
            wry::http::Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", len.to_string())
                .body(std::borrow::Cow::Owned(content))
                .unwrap_or_else(|_| wry::http::Response::new(std::borrow::Cow::Owned(Vec::new())))
        }
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

fn parse_range_header(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let bytes_prefix = header.strip_prefix("bytes=")?;
    let mut parts = bytes_prefix.splitn(2, '-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next().unwrap_or("").trim();

    let start: u64 = if start_str.is_empty() {
        0
    } else {
        start_str.parse().ok()?
    };

    let end: u64 = if end_str.is_empty() {
        file_size.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };

    if start >= file_size {
        return None;
    }
    let end = end.min(file_size - 1);
    Some((start, end))
}

pub(crate) fn shell_init_script() -> &'static str {
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

fn load_error_page(path: &Path, error: &std::io::Error) -> String {
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

fn mime_for_path(path: &Path) -> &'static str {
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
