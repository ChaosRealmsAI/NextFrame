use super::*;
use std::ffi::OsString;
use std::sync::{MutexGuard, OnceLock};
use std::time::Duration;

static ENV_OVERRIDE_TEST_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();

struct EnvOverrideGuard {
    _lock: MutexGuard<'static, ()>,
    previous: Vec<(String, Option<OsString>)>,
}

impl EnvOverrideGuard {
    fn new() -> Self {
        let lock = ENV_OVERRIDE_TEST_LOCK
            .get_or_init(|| std::sync::Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self {
            _lock: lock,
            previous: Vec::new(),
        }
    }

    fn set(&mut self, key: &str, value: impl Into<OsString>) {
        if !self.previous.iter().any(|(existing, _)| existing == key) {
            self.previous.push((key.to_string(), env::var_os(key)));
        }
        let value: OsString = value.into();
        // SAFETY: integration tests serialize these process-wide env mutations with ENV_OVERRIDE_TEST_LOCK.
        unsafe {
            // SAFETY: integration tests serialize these process-wide env mutations with ENV_OVERRIDE_TEST_LOCK.
            env::set_var(key, &value);
        }
    }
}

impl Drop for EnvOverrideGuard {
    fn drop(&mut self) {
        for (key, previous) in self.previous.iter().rev() {
            restore_env_var(key, previous.as_ref());
        }
    }
}

fn tiny_png() -> &'static [u8] {
    &[
        0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D',
        b'R', 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xB5,
        0x1C, 0x0C, 0x02, 0x00, 0x00, 0x00, 0x0B, b'I', b'D', b'A', b'T', 0x78, 0xDA, 0x63, 0xFC,
        0xFF, 0x1F, 0x00, 0x03, 0x03, 0x01, 0xFF, 0xA5, 0x5B, 0x9B, 0xB0, 0x00, 0x00, 0x00, 0x00,
        b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
    ]
}

#[test]
fn dispatch_compose_generate_writes_stubbed_html_output() {
    let temp = TestDir::new("integration-compose-generate");
    let timeline_path = temp.join("timeline.json");
    let output_path = temp.join("nested/timeline.html");
    let html = "<!doctype html><title>stub compose</title>";
    fs::write(&timeline_path, "{\"version\":1}").expect("write timeline fixture");

    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_COMPOSE_HTML", html);

    let response = dispatch_request(
        "compose.generate",
        json!({
            "timelinePath": timeline_path.display().to_string(),
            "outputPath": output_path.display().to_string(),
        }),
    );

    assert!(response.ok, "{response:?}");
    assert_eq!(response.id, "req-compose.generate");
    assert_eq!(
        response.result.get("path"),
        Some(&json!(output_path.display().to_string()))
    );
    assert_eq!(response.result.get("size"), Some(&json!(html.len() as u64)));
    assert_eq!(
        fs::read_to_string(&output_path).expect("read stub html"),
        html
    );
}

#[test]
fn dispatch_compose_generate_rejects_missing_timeline_path() {
    let response = dispatch_request("compose.generate", json!({}));

    assert!(!response.ok);
    assert_eq!(response.id, "req-compose.generate");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "missing params.timelinePath");
}

#[test]
fn dispatch_fs_dialog_open_uses_stubbed_selection() {
    let temp = TestDir::new("integration-dialog-open");
    let selected_path = temp.join("picked.nfproj");
    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_DIALOG_OPEN_PATH", selected_path.as_os_str());

    let response = dispatch_request(
        "fs.dialogOpen",
        json!({
            "filters": [".nfproj", { "extensions": ["json"] }]
        }),
    );

    assert!(response.ok, "{response:?}");
    assert_eq!(
        response.result,
        json!({
            "path": selected_path.display().to_string(),
            "canceled": false,
        })
    );
}

#[test]
fn dispatch_fs_dialog_open_rejects_invalid_filters() {
    let response = dispatch_request(
        "fs.dialogOpen",
        json!({
            "filters": [""]
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-fs.dialogOpen");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "extension must not be empty");
}

#[test]
fn dispatch_fs_dialog_save_uses_stubbed_selection_and_default_extension() {
    let temp = TestDir::new("integration-dialog-save");
    let selected_path = temp.join("chosen-project");
    let expected_path = selected_path.with_extension("nfproj");
    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_DIALOG_SAVE_PATH", selected_path.as_os_str());

    let response = dispatch_request("fs.dialogSave", json!({ "defaultName": "project.nfproj" }));

    assert!(response.ok, "{response:?}");
    assert_eq!(
        response.result,
        json!({
            "path": expected_path.display().to_string(),
            "canceled": false,
        })
    );
}

#[test]
fn dispatch_fs_dialog_save_requires_default_name() {
    let response = dispatch_request("fs.dialogSave", json!({}));

    assert!(!response.ok);
    assert_eq!(response.id, "req-fs.dialogSave");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "missing params.defaultName");
}

#[test]
fn dispatch_fs_reveal_uses_stubbed_file_manager() {
    let temp = TestDir::new("integration-fs-reveal");
    let file_path = temp.join("export.mp4");
    fs::write(&file_path, "video").expect("write export fixture");
    let canonical_path = fs::canonicalize(&file_path).expect("canonicalize export fixture");
    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_REVEAL_MODE", "ok");

    let response = dispatch_request(
        "fs.reveal",
        json!({ "path": file_path.display().to_string() }),
    );

    assert!(response.ok, "{response:?}");
    assert_eq!(
        response.result,
        json!({
            "path": canonical_path.display().to_string(),
            "revealed": true,
        })
    );
}

#[test]
fn dispatch_fs_reveal_requires_path() {
    let response = dispatch_request("fs.reveal", json!({}));

    assert!(!response.ok);
    assert_eq!(response.id, "req-fs.reveal");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "missing params.path");
}

#[test]
fn dispatch_export_start_runs_stubbed_export_to_completion() {
    let temp = TestDir::new("integration-export-start");
    let output_path = temp.join("exports/final.mp4");
    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_EXPORT_MODE", "success");

    let response = dispatch_request(
        "export.start",
        json!({
            "outputPath": output_path.display().to_string(),
            "width": 1280,
            "height": 720,
            "fps": 30,
            "duration": 1.5,
        }),
    );

    assert!(response.ok, "{response:?}");
    assert_eq!(response.id, "req-export.start");
    assert_eq!(response.result.get("ok"), Some(&json!(true)));
    let pid = response.result["pid"].as_u64().expect("export pid") as u32;
    let log_path = PathBuf::from(
        response.result["logPath"]
            .as_str()
            .expect("export log path"),
    );

    let mut final_status = None;
    for _ in 0..40 {
        let status = dispatch_request("export.status", json!({ "pid": pid }));
        assert!(status.ok, "{status:?}");
        if status.result.get("state") == Some(&json!("done")) {
            final_status = Some(status);
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }

    let status = final_status.expect("export should finish");
    assert_eq!(status.result.get("state"), Some(&json!("done")));
    assert_eq!(
        status.result.get("outputPath"),
        Some(&json!(output_path.display().to_string()))
    );
    assert!(output_path.exists(), "stub export should write output");
    assert!(log_path.exists(), "stub export should write a log");
}

#[test]
fn dispatch_export_start_rejects_zero_dimensions() {
    let temp = TestDir::new("integration-export-start-error");
    let output_path = temp.join("out.mp4");
    let response = dispatch_request(
        "export.start",
        json!({
            "outputPath": output_path.display().to_string(),
            "width": 0,
            "height": 720,
            "fps": 30,
            "duration": 1.5,
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-export.start");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(
        response.error.as_deref(),
        "params.width must be greater than 0",
    );
}

#[test]
fn dispatch_preview_frame_returns_stubbed_png_data_url() {
    let temp = TestDir::new("integration-preview-frame");
    let png_path = temp.join("frame.png");
    fs::write(&png_path, tiny_png()).expect("write png fixture");
    let mut env_guard = EnvOverrideGuard::new();
    env_guard.set("NF_BRIDGE_TEST_PREVIEW_PNG", png_path.as_os_str());

    let response = dispatch_request(
        "preview.frame",
        json!({
            "timelinePath": "fixtures/timeline.json",
            "t": 1.25,
            "width": 320,
            "height": 180,
        }),
    );

    assert!(response.ok, "{response:?}");
    assert_eq!(response.id, "req-preview.frame");
    assert_eq!(response.result.get("width"), Some(&json!(320)));
    assert_eq!(response.result.get("height"), Some(&json!(180)));
    assert_eq!(response.result.get("t"), Some(&json!(1.25)));
    assert!(
        response.result["dataUrl"]
            .as_str()
            .is_some_and(|data| data.starts_with("data:image/png;base64,")),
        "expected preview data URL"
    );
}

#[test]
fn dispatch_preview_frame_requires_numeric_t() {
    let response = dispatch_request(
        "preview.frame",
        json!({
            "timelinePath": "fixtures/timeline.json",
            "t": "soon",
        }),
    );

    assert!(!response.ok);
    assert_eq!(response.id, "req-preview.frame");
    assert_eq!(response.result, Value::Null);
    assert_error_contains(response.error.as_deref(), "params.t must be a number");
}
