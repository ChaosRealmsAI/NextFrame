//! Crate-level smoke tests for nf-shell.

use std::borrow::Cow;
use std::fs;
use std::io::Write;
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::json;

use crate::ai_ops::build_navigate_script;
use crate::ipc::{HttpConnection, read_http_request};
use crate::protocol::protocol_response;

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after UNIX_EPOCH")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "{prefix}-{}-{nanos}",
        std::process::id()
    ))
}

fn response_body_bytes<'a>(body: &'a Cow<'static, [u8]>) -> &'a [u8] {
    body.as_ref()
}

#[test]
fn http_parsing_reads_complete_post_requests() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test listener should bind");
    let address = listener
        .local_addr()
        .expect("test listener should have a local address");
    let body = br#"{"expr":"1 + 1"}"#;
    let request = format!(
        "POST /eval HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );

    let mut client = TcpStream::connect(address).expect("test client should connect");
    let (server_stream, _) = listener.accept().expect("listener should accept");
    client
        .write_all(request.as_bytes())
        .expect("request headers should be written");
    client.write_all(body).expect("request body should be written");
    client
        .shutdown(Shutdown::Write)
        .expect("client write side should close");

    let mut connection = HttpConnection {
        stream: server_stream,
        buffer: Vec::new(),
        accepted_at: Instant::now(),
    };

    let parsed = read_http_request(&mut connection)
        .expect("HTTP request should parse")
        .expect("HTTP request should be complete");

    assert_eq!(parsed.method, "POST");
    assert_eq!(parsed.path, "/eval");
    assert_eq!(parsed.body, body);
}

#[test]
fn protocol_path_resolution_serves_safe_files_and_blocks_traversal() {
    let root = unique_temp_dir("nf-shell-protocol");
    let asset_dir = root.join("space dir");
    fs::create_dir_all(&asset_dir).expect("protocol asset directory should exist");
    fs::write(asset_dir.join("app.js"), "console.log('nf-shell');")
        .expect("protocol asset file should be written");

    let ok_response = protocol_response(&root, "/space%20dir/app.js");
    assert_eq!(ok_response.status().as_u16(), 200);
    assert_eq!(
        ok_response.headers().get("Content-Type").and_then(|value| value.to_str().ok()),
        Some("application/javascript")
    );
    assert_eq!(
        response_body_bytes(ok_response.body()),
        b"console.log('nf-shell');"
    );

    let traversal_response = protocol_response(&root, "/../secret.js");
    assert_eq!(traversal_response.status().as_u16(), 400);
    assert_eq!(response_body_bytes(traversal_response.body()), b"400");

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn script_building_embeds_navigation_payloads_for_project_and_editor_views() {
    let project_script = build_navigate_script(&json!({
        "view": "project",
        "project": "demo-project"
    }))
    .expect("project navigate script should build");
    let editor_script = build_navigate_script(&json!({
        "project": "demo-project",
        "episode": "ep-01",
        "segment": "seg-a"
    }))
    .expect("editor navigate script should build");

    assert!(
        project_script.contains("\"view\":\"project\""),
        "project payload should be serialized into the script"
    );
    assert!(
        project_script.contains("await goProject(payload.project || null);"),
        "project navigation should target goProject"
    );
    assert!(
        editor_script.contains("\"segment\":\"seg-a\""),
        "editor payload should keep the segment field"
    );
    assert!(
        editor_script.contains("await goEditor("),
        "editor navigation should target goEditor"
    );
}
