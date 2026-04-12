#![allow(clippy::expect_used)]

use bridge::{dispatch, Request, Response};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn dispatch_unknown_method_returns_error() {
    let response = dispatch_request("missing.method", json!({}));

    assert!(!response.ok);
    assert_eq!(response.id, "req-missing.method");
    assert_eq!(response.result, Value::Null);
    assert_eq!(response.error.as_deref(), Some("unknown method: missing.method"));
}

#[test]
fn dispatch_fs_read_with_valid_temp_file_returns_contents() {
    let temp = TestDir::new("integration-fs-read");
    let path = temp.join("note.txt");
    fs::write(&path, "hello from integration test").expect("write temp file");

    let response = dispatch_request(
        "fs.read",
        json!({ "path": path.display().to_string() }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-fs.read");
    assert_eq!(
        response.result,
        json!({
            "path": path.display().to_string(),
            "contents": "hello from integration test",
        })
    );
    assert_eq!(response.error, None);
}

#[test]
fn dispatch_fs_write_creates_file() {
    let temp = TestDir::new("integration-fs-write");
    let path = temp.join("written.txt");

    let response = dispatch_request(
        "fs.write",
        json!({
            "path": path.display().to_string(),
            "contents": "written by dispatch",
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-fs.write");
    assert_eq!(
        fs::read_to_string(&path).expect("read written file"),
        "written by dispatch"
    );
    assert_eq!(
        response.result.get("path"),
        Some(&json!(path.display().to_string()))
    );
}

#[test]
fn dispatch_scene_list_returns_non_empty_array() {
    let response = dispatch_request("scene.list", json!({}));

    assert!(response.ok);
    assert_eq!(response.id, "req-scene.list");
    let scenes = response.result.as_array().expect("scene list array");
    assert!(!scenes.is_empty(), "expected scene list to be non-empty");
}

#[test]
fn dispatch_timeline_save_and_load_round_trips_json() {
    let temp = TestDir::new("integration-timeline");
    let path = temp.join("timeline.json");
    let timeline = json!({
        "version": "1",
        "duration": 42,
        "background": "#101820",
        "tracks": [
            {
                "id": "track-1",
                "kind": "video",
                "clips": [
                    {
                        "id": "clip-1",
                        "start": 0,
                        "duration": 42
                    }
                ]
            }
        ]
    });

    let save_response = dispatch_request(
        "timeline.save",
        json!({
            "path": path.display().to_string(),
            "json": timeline.clone(),
        }),
    );
    assert!(save_response.ok);
    assert_eq!(save_response.id, "req-timeline.save");

    let load_response = dispatch_request(
        "timeline.load",
        json!({ "path": path.display().to_string() }),
    );
    assert!(load_response.ok);
    assert_eq!(load_response.id, "req-timeline.load");
    assert_eq!(load_response.result, timeline);
}

#[test]
fn dispatch_log_with_valid_params_returns_logged_true() {
    let response = dispatch_request(
        "log",
        json!({
            "level": "info",
            "msg": "integration test message",
        }),
    );

    assert!(response.ok);
    assert_eq!(response.id, "req-log");
    assert_eq!(response.result.get("logged"), Some(&json!(true)));
    assert_eq!(response.error, None);
}

fn dispatch_request(method: &str, params: Value) -> Response {
    dispatch(Request {
        id: format!("req-{method}"),
        method: method.to_string(),
        params,
    })
}

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-bridge-{label}-{}-{unique}",
            process::id()
        ));

        fs::create_dir_all(&path).expect("create temp test dir");
        Self { path }
    }

    fn join(&self, child: &str) -> PathBuf {
        self.path.join(child)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
