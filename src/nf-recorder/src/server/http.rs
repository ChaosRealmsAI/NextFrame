//! local server http file server
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::path::{ResolvedRequestPath, resolve_request_path};

/// Serves files from a root directory over localhost for `WKWebView` loading.
pub struct HttpFileServer {
    port: u16,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl HttpFileServer {
    /// Starts a non-blocking localhost file server rooted at `root`.
    pub fn start(root: PathBuf) -> Result<Self, String> {
        let root = root.canonicalize().map_err(|err| {
            format!(
                "failed to canonicalize server root {}: {err}",
                root.display()
            )
        })?;
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|err| format!("failed to bind HTTP server: {err}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|err| format!("failed to mark HTTP listener nonblocking: {err}"))?;
        let port = listener
            .local_addr()
            .map_err(|err| format!("failed to inspect HTTP listener address: {err}"))?
            .port();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);
        let thread = thread::spawn(move || run_server(listener, root, stop_flag));
        Ok(Self {
            port,
            stop,
            thread: Some(thread),
        })
    }

    /// Returns the base URL for the running server.
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

impl Drop for HttpFileServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", self.port)).and_then(|stream| {
            stream.shutdown(Shutdown::Both)?;
            Ok(())
        });
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run_server(listener: TcpListener, root: PathBuf, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = handle_connection(stream, &root);
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => break,
        }
    }
}

fn handle_connection(mut stream: TcpStream, root: &Path) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|err| format!("failed to set read timeout: {err}"))?;
    let mut request_bytes = Vec::new();
    let mut buffer = [0u8; 4096];
    loop {
        let read = stream
            .read(&mut buffer)
            .map_err(|err| format!("failed to read HTTP request: {err}"))?;
        if read == 0 {
            return Ok(());
        }
        request_bytes.extend_from_slice(&buffer[..read]);
        if request_bytes.windows(4).any(|window| window == b"\r\n\r\n")
            || request_bytes.len() > 64 * 1024
        {
            break;
        }
    }

    let request_text = String::from_utf8_lossy(&request_bytes);
    let mut lines = request_text.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or("/");
    let range_header = lines
        .find_map(|line| line.split_once(':'))
        .and_then(|(name, value)| {
            name.eq_ignore_ascii_case("range")
                .then_some(value.trim().to_string())
        });

    if method != "GET" && method != "HEAD" {
        return write_response(
            &mut stream,
            405,
            "Method Not Allowed",
            "text/plain; charset=utf-8",
            b"method not allowed",
            true,
        );
    }

    let path = match resolve_request_path(root, raw_path)? {
        ResolvedRequestPath::Found(path) => path,
        ResolvedRequestPath::NotFound => {
            trace_log!("  http 404: {raw_path}");
            return write_response(
                &mut stream,
                404,
                "Not Found",
                "text/plain; charset=utf-8",
                b"not found",
                method != "HEAD",
            );
        }
        ResolvedRequestPath::Forbidden => {
            trace_log!("  http 403: {raw_path}");
            return write_response(
                &mut stream,
                403,
                "Forbidden",
                "text/plain; charset=utf-8",
                b"forbidden",
                method != "HEAD",
            );
        }
    };

    let mut file =
        File::open(&path).map_err(|err| format!("failed to open {}: {err}", path.display()))?;
    let total_len = file
        .metadata()
        .map_err(|err| format!("failed to stat {}: {err}", path.display()))?
        .len();
    let content_type = mime_type(&path);

    if let Some(range) = range_header.and_then(|value| parse_range_header(&value, total_len)) {
        file.seek(SeekFrom::Start(range.0))
            .map_err(|err| format!("failed to seek {}: {err}", path.display()))?;
        let mut body = vec![0u8; (range.1 - range.0 + 1) as usize];
        file.read_exact(&mut body)
            .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
        let headers = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{total_len}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n",
            body.len(),
            range.0,
            range.1
        );
        stream
            .write_all(headers.as_bytes())
            .map_err(|err| format!("failed to write partial response headers: {err}"))?;
        if method != "HEAD" {
            stream
                .write_all(&body)
                .map_err(|err| format!("failed to write partial response body: {err}"))?;
        }
        return Ok(());
    }

    let mut body = Vec::with_capacity(total_len as usize);
    file.read_to_end(&mut body)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    write_response(
        &mut stream,
        200,
        "OK",
        content_type,
        &body,
        method != "HEAD",
    )
}

fn parse_range_header(header: &str, total_len: u64) -> Option<(u64, u64)> {
    let header = header.strip_prefix("bytes=")?;
    let (start, end) = header.split_once('-')?;
    let start = start.parse::<u64>().ok()?;
    let end = if end.trim().is_empty() {
        total_len.checked_sub(1)?
    } else {
        end.parse::<u64>().ok()?.min(total_len.checked_sub(1)?)
    };
    (start <= end).then_some((start, end))
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &[u8],
    include_body: bool,
) -> Result<(), String> {
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(headers.as_bytes())
        .map_err(|err| format!("failed to write HTTP headers: {err}"))?;
    if include_body {
        stream
            .write_all(body)
            .map_err(|err| format!("failed to write HTTP body: {err}"))?;
    }
    Ok(())
}

fn mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "srt" => "text/plain; charset=utf-8",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}
