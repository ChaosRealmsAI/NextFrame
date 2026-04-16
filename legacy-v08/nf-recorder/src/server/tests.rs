//! local server tests helpers
#![allow(clippy::unwrap_used)]
#![allow(clippy::expect_used)]
#![allow(clippy::panic)]

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::HttpFileServer;

static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new() -> Self {
        let unique_id = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after UNIX_EPOCH")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-recorder-server-tests-{}-{timestamp}-{unique_id}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("failed to create test directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

struct HttpResponse {
    status_code: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl HttpResponse {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[test]
fn http_file_server_start_listens_on_localhost() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    write_file(temp_dir.path(), "index.html", b"server is up");

    let server = HttpFileServer::start(temp_dir.path().to_path_buf())
        .expect("server should start successfully");

    let response = request(&server, "HEAD", "/");
    assert_eq!(response.status_code, 200);
}

#[test]
fn http_file_server_serves_static_html_from_temp_dir() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    write_file(
        temp_dir.path(),
        "index.html",
        b"<html><body>hello</body></html>",
    );

    let server = HttpFileServer::start(temp_dir.path().to_path_buf())
        .expect("server should start successfully");

    let response = request(&server, "GET", "/index.html");
    assert_eq!(response.status_code, 200);
    assert_eq!(
        response.header("Content-Type"),
        Some("text/html; charset=utf-8")
    );
    assert_eq!(response.body, b"<html><body>hello</body></html>");
}

#[test]
fn http_file_server_sets_expected_mime_types() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    write_file(temp_dir.path(), "index.html", b"<html></html>");
    write_file(temp_dir.path(), "styles.css", b"body {}");
    write_file(temp_dir.path(), "app.js", b"console.log('ok');");
    write_file(temp_dir.path(), "image.png", b"\x89PNG\r\n\x1a\n");
    write_file(temp_dir.path(), "clip.mp4", b"mp4");

    let server = HttpFileServer::start(temp_dir.path().to_path_buf())
        .expect("server should start successfully");

    assert_content_type(&server, "/index.html", "text/html; charset=utf-8");
    assert_content_type(&server, "/styles.css", "text/css; charset=utf-8");
    assert_content_type(&server, "/app.js", "text/javascript; charset=utf-8");
    assert_content_type(&server, "/image.png", "image/png");
    assert_content_type(&server, "/clip.mp4", "video/mp4");
}

#[test]
fn http_file_server_returns_404_for_missing_files() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    write_file(temp_dir.path(), "index.html", b"<html></html>");

    let server = HttpFileServer::start(temp_dir.path().to_path_buf())
        .expect("server should start successfully");

    let response = request(&server, "GET", "/missing.html");
    assert_eq!(response.status_code, 404);
    assert_eq!(
        response.header("Content-Type"),
        Some("text/plain; charset=utf-8")
    );
    assert_eq!(response.body, b"not found");
}

#[test]
fn http_file_server_rejects_path_traversal() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    let root = temp_dir.path().join("root");
    fs::create_dir_all(&root).expect("failed to create root directory");
    write_file(&root, "index.html", b"<html></html>");
    write_file(temp_dir.path(), "secret.txt", b"secret");

    let server = HttpFileServer::start(root).expect("server should start successfully");

    let response = request(&server, "GET", "/../secret.txt");
    assert_eq!(response.status_code, 403);
    assert_eq!(response.body, b"forbidden");
}

#[test]
fn http_file_server_decodes_percent_encoded_paths() {
    let _guard = test_lock()
        .lock()
        .expect("test lock should not be poisoned");
    let temp_dir = TestDir::new();
    write_file(
        temp_dir.path(),
        "nested/hello world.html",
        b"<html><body>decoded</body></html>",
    );

    let server = HttpFileServer::start(temp_dir.path().to_path_buf())
        .expect("server should start successfully");

    let response = request(&server, "GET", "/nested/hello%20world.html");
    assert_eq!(response.status_code, 200);
    assert_eq!(response.body, b"<html><body>decoded</body></html>");
}

fn assert_content_type(server: &HttpFileServer, path: &str, expected: &str) {
    let response = request(server, "HEAD", path);
    assert_eq!(response.status_code, 200, "unexpected status for {path}");
    assert_eq!(
        response.header("Content-Type"),
        Some(expected),
        "unexpected content type for {path}"
    );
    assert!(
        response.body.is_empty(),
        "HEAD {path} should not include a body"
    );
}

fn request(server: &HttpFileServer, method: &str, path: &str) -> HttpResponse {
    let address = server
        .base_url()
        .strip_prefix("http://")
        .expect("base URL should start with http://")
        .to_string();

    let mut last_error = None;
    for _ in 0..80 {
        match try_request(&address, method, path) {
            Ok(response) => return response,
            Err(err) => {
                last_error = Some(err);
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }

    panic!(
        "failed to connect to HTTP test server after retries: {}",
        last_error.expect("connection errors should be recorded")
    );
}

fn try_request(address: &str, method: &str, path: &str) -> Result<HttpResponse, String> {
    let mut stream =
        TcpStream::connect(address).map_err(|err| format!("connect to {address}: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|err| format!("set read timeout for {address}: {err}"))?;
    let request =
        format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("write {method} {path} request to {address}: {err}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|err| format!("read {method} {path} response from {address}: {err}"))?;
    parse_response(&response)
}

fn parse_response(response: &[u8]) -> Result<HttpResponse, String> {
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "HTTP response should contain a header terminator".to_string())?;
    let header_bytes = &response[..header_end];
    let body = response[header_end + 4..].to_vec();
    let header_text = std::str::from_utf8(header_bytes)
        .map_err(|err| format!("response headers should be valid UTF-8: {err}"))?;
    let mut lines = header_text.lines();
    let status_line = lines
        .next()
        .ok_or_else(|| "response should have a status line".to_string())?;
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "status line should contain a status code".to_string())?
        .parse::<u16>()
        .map_err(|err| format!("status code should parse: {err}"))?;
    let headers = lines
        .filter_map(|line| {
            line.split_once(':')
                .map(|(name, value)| (name.trim().to_string(), value.trim().to_string()))
        })
        .collect();

    Ok(HttpResponse {
        status_code,
        headers,
        body,
    })
}

fn write_file(root: &Path, relative_path: &str, contents: &[u8]) {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("failed to create parent directories");
    }
    fs::write(&path, contents).expect("failed to write test file");
}

fn test_lock() -> &'static Mutex<()> {
    TEST_LOCK.get_or_init(|| Mutex::new(()))
}
