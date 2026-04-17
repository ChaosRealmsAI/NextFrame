use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

#[test]
fn ai_ops_serve_exposes_stub_http_surface() {
    let mut server = match ServerProcess::spawn() {
        Ok(server) => server,
        Err(err) => panic_test(&err),
    };

    let health = match request_bytes(
        server.port,
        "GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(response) => response,
        Err(err) => panic_test(&err),
    };
    assert_status_ok(&health, "/healthz");
    assert_body_text(&health, "ok", "/healthz");

    let status = match request_json(
        server.port,
        "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(status["mode"], "stub");
    assert!(status.get("viewport").is_some(), "status missing viewport");

    let action = match request_json(
        server.port,
        concat!(
            "POST /action HTTP/1.1\r\n",
            "Host: 127.0.0.1\r\n",
            "Content-Type: application/json\r\n",
            "Connection: close\r\n",
            "Content-Length: 14\r\n",
            "\r\n",
            "{\"cmd\":\"noop\"}"
        ),
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(action["accepted"], Value::Bool(true));
    let action_id = match action.get("action_id").and_then(Value::as_str) {
        Some(id) => id,
        None => panic_test("action response missing action_id"),
    };
    assert_eq!(action_id.len(), 36, "action_id should be a UUID");

    let screenshot = match request_bytes(
        server.port,
        "GET /screenshot HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(response) => response,
        Err(err) => panic_test(&err),
    };
    assert_status_ok(&screenshot, "/screenshot");
    assert_png_response(&screenshot);

    let sse = match request_stream(
        server.port,
        "GET /events HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        Duration::from_secs(3),
    ) {
        Ok(response) => response,
        Err(err) => panic_test(&err),
    };
    assert!(
        sse.contains("event: ping") || sse.contains("event: state_change"),
        "events stream missing expected event: {sse}"
    );

    let source_before = match request_json(
        server.port,
        "GET /source/current HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(source_before["version"], 1);

    let writeback = match request_json(
        server.port,
        concat!(
            "POST /source/writeback HTTP/1.1\r\n",
            "Host: 127.0.0.1\r\n",
            "Content-Type: application/json\r\n",
            "Connection: close\r\n",
            "Content-Length: 42\r\n",
            "\r\n",
            "{\"path\":\"memory://updated.json\",\"ok\":true}"
        ),
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(writeback["accepted"], Value::Bool(true));
    assert_eq!(writeback["version"], 2);

    let source_after = match request_json(
        server.port,
        "GET /source/current HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    assert_eq!(source_after["version"], 2);
    assert_eq!(source_after["path"], "memory://updated.json");

    let describe = match request_json(
        server.port,
        "GET /ai-ops/describe HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    ) {
        Ok(value) => value,
        Err(err) => panic_test(&err),
    };
    let actions = match describe.get("actions").and_then(Value::as_array) {
        Some(actions) => actions,
        None => panic_test("describe response missing actions"),
    };
    assert!(
        !actions.is_empty(),
        "describe response contained no actions"
    );

    let _ = server.stop();
}

struct ServerProcess {
    child: Child,
    stderr_path: PathBuf,
    port: u16,
}

impl ServerProcess {
    fn spawn() -> Result<Self, String> {
        let stderr_path = temp_log_path("nextframe-ai-ops-serve-stderr")?;
        let stderr_file =
            fs::File::create(&stderr_path).map_err(|err| format!("create stderr log: {err}"))?;
        let mut child = Command::new(env!("CARGO_BIN_EXE_nf"))
            .arg("ai-ops")
            .arg("serve")
            .stdout(Stdio::piped())
            .stderr(Stdio::from(stderr_file))
            .spawn()
            .map_err(|err| format!("spawn nf ai-ops serve: {err}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| String::from("child stdout unavailable"))?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|err| format!("read boot line: {err}"))?;
        if line.trim().is_empty() {
            return Err(format!(
                "empty boot line, stderr={}",
                read_child_stderr(&stderr_path)
            ));
        }
        let value: Value =
            serde_json::from_str(line.trim()).map_err(|err| format!("parse boot line: {err}"))?;
        let port_u64 = value
            .get("port")
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("boot line missing port: {value}"))?;
        let pid_u64 = value
            .get("pid")
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("boot line missing pid: {value}"))?;
        let expected_pid = u64::from(child.id());
        if pid_u64 != expected_pid {
            return Err(format!(
                "boot pid mismatch: expected {expected_pid}, got {pid_u64}"
            ));
        }
        let port =
            u16::try_from(port_u64).map_err(|err| format!("invalid port {port_u64}: {err}"))?;
        Ok(Self {
            child,
            stderr_path,
            port,
        })
    }

    fn stop(&mut self) -> Result<(), String> {
        self.child
            .kill()
            .map_err(|err| format!("kill server {}: {err}", self.child.id()))?;
        let status = self
            .child
            .wait()
            .map_err(|err| format!("wait for server {}: {err}", self.child.id()))?;
        if status.success() {
            return Ok(());
        }
        Err(format!(
            "server exited unsuccessfully: {status}; stderr={}",
            read_child_stderr(&self.stderr_path)
        ))
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn request_json(port: u16, request: &str) -> Result<Value, String> {
    let response = request_bytes(port, request)?;
    assert_status_ok(&response, "json request");
    let body = response_body(&response)?;
    serde_json::from_slice(body).map_err(|err| format!("parse json response: {err}"))
}

fn request_bytes(port: u16, request: &str) -> Result<Vec<u8>, String> {
    let mut stream =
        TcpStream::connect(("127.0.0.1", port)).map_err(|err| format!("connect {port}: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|err| format!("set read timeout: {err}"))?;
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("write request: {err}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|err| format!("read response: {err}"))?;
    Ok(response)
}

fn request_stream(port: u16, request: &str, timeout: Duration) -> Result<String, String> {
    let mut stream =
        TcpStream::connect(("127.0.0.1", port)).map_err(|err| format!("connect {port}: {err}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|err| format!("set stream read timeout: {err}"))?;
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("write stream request: {err}"))?;
    thread::sleep(Duration::from_secs(2));
    let mut response = [0_u8; 4096];
    let count = stream
        .read(&mut response)
        .map_err(|err| format!("read stream response: {err}"))?;
    String::from_utf8(response[..count].to_vec())
        .map_err(|err| format!("decode stream response: {err}"))
}

fn response_body(response: &[u8]) -> Result<&[u8], String> {
    response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| &response[index + 4..])
        .ok_or_else(|| String::from("missing HTTP header terminator"))
}

fn assert_status_ok(response: &[u8], label: &str) {
    let text = String::from_utf8_lossy(response);
    assert!(
        text.starts_with("HTTP/1.1 200") || text.starts_with("HTTP/1.0 200"),
        "{label} expected HTTP 200, got {text}"
    );
}

fn assert_body_text(response: &[u8], expected: &str, label: &str) {
    let body = match response_body(response) {
        Ok(body) => body,
        Err(err) => panic_test(&err),
    };
    let text = String::from_utf8_lossy(body);
    assert_eq!(text, expected, "{label} body mismatch");
}

fn assert_png_response(response: &[u8]) {
    let body = match response_body(response) {
        Ok(body) => body,
        Err(err) => panic_test(&err),
    };
    assert!(
        response
            .windows("content-type: image/png".len())
            .any(|window| {
                String::from_utf8_lossy(window).eq_ignore_ascii_case("content-type: image/png")
            }),
        "screenshot response missing image/png content-type"
    );
    assert!(
        body.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]),
        "screenshot body missing PNG signature"
    );
}

fn read_child_stderr(path: &PathBuf) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| String::from("<stderr unavailable>"))
}

fn temp_log_path(prefix: &str) -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("clock failure: {err}"))?
        .as_nanos();
    Ok(std::env::temp_dir().join(format!("{prefix}-{}-{nanos}.log", std::process::id())))
}

#[track_caller]
#[allow(clippy::panic)]
fn panic_test(message: &str) -> ! {
    panic!("{message}");
}
