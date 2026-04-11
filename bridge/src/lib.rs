use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Serialize)]
pub struct Request {
    pub id: String,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Response {
    pub id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
}

pub fn dispatch(req: Request) -> Response {
    let Request { id, method, params } = req;

    match dispatch_inner(&method, params) {
        Ok(result) => Response {
            id,
            ok: true,
            result,
            error: None,
        },
        Err(error) => Response {
            id,
            ok: false,
            result: Value::Null,
            error: Some(error),
        },
    }
}

fn dispatch_inner(method: &str, params: Value) -> Result<Value, String> {
    match method {
        "fs.read" => handle_fs_read(&params),
        "fs.write" => handle_fs_write(&params),
        "fs.listDir" => handle_fs_list_dir(&params),
        "fs.dialogOpen" => handle_fs_dialog_open(&params),
        "fs.dialogSave" => handle_fs_dialog_save(&params),
        "log" => handle_log(&params),
        "scene.list" => handle_scene_list(&params),
        "timeline.load" => handle_timeline_load(&params),
        "timeline.save" => handle_timeline_save(&params),
        _ => Err(format!("unknown method: {method}")),
    }
}

fn handle_fs_read(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = validate_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "contents": contents,
    }))
}

fn handle_fs_write(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let contents = require_string(params, "contents")?;
    let path_buf = validate_path(path)?;

    fs::write(&path_buf, contents)
        .map_err(|error| format!("failed to write '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": contents.len(),
    }))
}

fn handle_fs_list_dir(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = validate_path(path)?;
    let mut entries = fs::read_dir(&path_buf)
        .map_err(|error| format!("failed to list '{}': {error}", path_buf.display()))?
        .map(|entry_result| {
            let entry =
                entry_result.map_err(|error| format!("failed to inspect dir entry: {error}"))?;
            let entry_path = entry.path();
            let metadata = entry.metadata().map_err(|error| {
                format!(
                    "failed to read metadata for '{}': {error}",
                    entry_path.display()
                )
            })?;

            Ok(json!({
                "name": entry.file_name().to_string_lossy().to_string(),
                "path": entry_path.display().to_string(),
                "isDir": metadata.is_dir(),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|left, right| {
        let left_name = left.get("name").and_then(Value::as_str).unwrap_or_default();
        let right_name = right
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        left_name.cmp(right_name)
    });

    Ok(json!({
        "path": path,
        "entries": entries,
    }))
}

fn handle_fs_dialog_open(params: &Value) -> Result<Value, String> {
    let filters = require_array(params, "filters")?;

    Ok(json!({
        "status": "unimplemented",
        "filters": filters,
    }))
}

fn handle_fs_dialog_save(params: &Value) -> Result<Value, String> {
    let default_name = require_string(params, "default_name")?;

    Ok(json!({
        "status": "unimplemented",
        "default_name": default_name,
    }))
}

fn handle_log(params: &Value) -> Result<Value, String> {
    let level = require_string(params, "level")?;
    let message = require_string(params, "msg")?;

    match level {
        "error" => eprintln!("[webview][error] {message}"),
        _ => println!("[webview][{level}] {message}"),
    }

    Ok(json!({
        "logged": true,
        "level": level,
    }))
}

fn handle_scene_list(params: &Value) -> Result<Value, String> {
    require_object(params)?;

    Ok(json!([
        {
            "id": "gradientBg",
            "name": "Gradient Background",
            "category": "background"
        },
        {
            "id": "text",
            "name": "Text",
            "category": "typography"
        },
        {
            "id": "shape",
            "name": "Shape",
            "category": "geometry"
        },
        {
            "id": "image",
            "name": "Image",
            "category": "media"
        },
        {
            "id": "counter",
            "name": "Counter",
            "category": "data"
        }
    ]))
}

fn handle_timeline_load(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = validate_path(path)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("failed to read timeline '{}': {error}", path_buf.display()))?;

    serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse timeline '{}': {error}", path_buf.display()))
}

fn handle_timeline_save(params: &Value) -> Result<Value, String> {
    let path = require_string(params, "path")?;
    let path_buf = validate_path(path)?;
    let json_value = require_value(params, "json")?;
    let serialized = serde_json::to_string_pretty(json_value).map_err(|error| {
        format!(
            "failed to serialize timeline for '{}': {error}",
            path_buf.display()
        )
    })?;

    fs::write(&path_buf, &serialized)
        .map_err(|error| format!("failed to write timeline '{}': {error}", path_buf.display()))?;

    Ok(json!({
        "path": path,
        "bytesWritten": serialized.len(),
    }))
}

fn require_object(params: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    params
        .as_object()
        .ok_or_else(|| "params must be a JSON object".to_string())
}

fn require_value<'a>(params: &'a Value, key: &str) -> Result<&'a Value, String> {
    require_object(params)?
        .get(key)
        .ok_or_else(|| format!("missing params.{key}"))
}

fn require_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    require_value(params, key)?
        .as_str()
        .ok_or_else(|| format!("params.{key} must be a string"))
}

fn require_array<'a>(params: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    require_value(params, key)?
        .as_array()
        .ok_or_else(|| format!("params.{key} must be an array"))
}

fn validate_path(raw_path: &str) -> Result<PathBuf, String> {
    if raw_path.trim().is_empty() {
        return Err("path must not be empty".to_string());
    }

    if raw_path.contains("..") {
        return Err(format!("path is outside sandbox: {raw_path}"));
    }

    let path = PathBuf::from(raw_path);

    if path.is_absolute() && !is_allowed_absolute_path(&path) {
        return Err(format!("path is outside sandbox: {raw_path}"));
    }

    Ok(path)
}

fn is_allowed_absolute_path(path: &Path) -> bool {
    path.starts_with(env::temp_dir())
        || home_dir()
            .as_deref()
            .map(|home| path.starts_with(home))
            .unwrap_or(false)
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| {
            let home_drive = env::var_os("HOMEDRIVE")?;
            let home_path = env::var_os("HOMEPATH")?;
            Some(PathBuf::from(home_drive).join(home_path))
        })
}

#[cfg(test)]
mod tests {
    use super::{dispatch, Request};
    use serde_json::{json, Value};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn fs_read_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-read");
        let file_path = temp.join("note.txt");
        fs::write(&file_path, "hello bridge").expect("write fixture");

        let response = dispatch(request(
            "fs.read",
            json!({ "path": file_path.display().to_string() }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result,
            json!({
                "path": file_path.display().to_string(),
                "contents": "hello bridge",
            })
        );

        let error_response = dispatch(request(
            "fs.read",
            json!({ "path": disallowed_absolute_path() }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    #[test]
    fn fs_read_rejects_parent_traversal_path() {
        let response = dispatch(request("fs.read", json!({ "path": "../../../etc/passwd" })));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-write");
        let file_path = temp.join("write.txt");

        let response = dispatch(request(
            "fs.write",
            json!({
                "path": file_path.display().to_string(),
                "contents": "written from test",
            }),
        ));
        assert!(response.ok);
        assert_eq!(
            fs::read_to_string(&file_path).expect("read written file"),
            "written from test"
        );

        let error_response = dispatch(request(
            "fs.write",
            json!({
                "path": "../escape.txt",
                "contents": "nope",
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    #[test]
    fn fs_write_rejects_absolute_system_path() {
        let response = dispatch(request(
            "fs.write",
            json!({
                "path": absolute_write_rejection_path(),
                "contents": "blocked write",
            }),
        ));

        assert!(!response.ok);
        assert_error_contains(&response.error, "outside sandbox");
    }

    #[test]
    fn fs_list_dir_dispatch_happy_and_error() {
        let temp = TestDir::new("fs-list");
        fs::write(temp.join("b.txt"), "b").expect("write b");
        fs::write(temp.join("a.txt"), "a").expect("write a");
        fs::create_dir(temp.join("nested")).expect("create nested dir");

        let response = dispatch(request(
            "fs.listDir",
            json!({ "path": temp.path.display().to_string() }),
        ));
        assert!(response.ok);

        let entries = response
            .result
            .get("entries")
            .and_then(Value::as_array)
            .expect("entries array");
        let names = entries
            .iter()
            .filter_map(|entry| entry.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["a.txt", "b.txt", "nested"]);

        let error_response = dispatch(request("fs.listDir", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.path");
    }

    #[test]
    fn fs_dialog_open_dispatch_happy_and_error() {
        let response = dispatch(request(
            "fs.dialogOpen",
            json!({
                "filters": [
                    { "name": "JSON", "extensions": ["json"] }
                ]
            }),
        ));
        assert!(response.ok);
        assert_eq!(response.result.get("status"), Some(&json!("unimplemented")));

        let error_response = dispatch(request("fs.dialogOpen", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.filters");
    }

    #[test]
    fn fs_dialog_save_dispatch_happy_and_error() {
        let response = dispatch(request(
            "fs.dialogSave",
            json!({ "default_name": "project.json" }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result.get("default_name"),
            Some(&json!("project.json"))
        );

        let error_response = dispatch(request("fs.dialogSave", json!({})));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.default_name");
    }

    #[test]
    fn log_dispatch_happy_and_error() {
        let response = dispatch(request(
            "log",
            json!({
                "level": "info",
                "msg": "hello from tests",
            }),
        ));
        assert!(response.ok);
        assert_eq!(response.result.get("logged"), Some(&json!(true)));

        let error_response = dispatch(request(
            "log",
            json!({
                "level": "info",
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "missing params.msg");
    }

    #[test]
    fn scene_list_dispatch_happy_and_error() {
        let response = dispatch(request("scene.list", json!({})));
        assert!(response.ok);

        let scenes = response.result.as_array().expect("scene array");
        assert_eq!(scenes.len(), 5);
        assert_eq!(scenes[0].get("id"), Some(&json!("gradientBg")));

        let error_response = dispatch(request("scene.list", json!("bad params")));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "params must be a JSON object");
    }

    #[test]
    fn timeline_load_dispatch_happy_and_error() {
        let temp = TestDir::new("timeline-load");
        let timeline_path = temp.join("timeline.json");
        fs::write(
            &timeline_path,
            r#"{"version":1,"tracks":[{"id":"track-1","clips":[]}]}"#,
        )
        .expect("write timeline");

        let response = dispatch(request(
            "timeline.load",
            json!({ "path": timeline_path.display().to_string() }),
        ));
        assert!(response.ok);
        assert_eq!(
            response.result,
            json!({
                "version": 1,
                "tracks": [
                    { "id": "track-1", "clips": [] }
                ]
            })
        );

        fs::write(&timeline_path, "not-json").expect("write invalid timeline");
        let error_response = dispatch(request(
            "timeline.load",
            json!({ "path": timeline_path.display().to_string() }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "failed to parse timeline");
    }

    #[test]
    fn timeline_save_dispatch_happy_and_error() {
        let temp = TestDir::new("timeline-save");
        let timeline_path = temp.join("saved-timeline.json");
        let timeline_path_string = timeline_path.display().to_string();

        let response = dispatch(request(
            "timeline.save",
            json!({
                "path": timeline_path_string,
                "json": {
                    "version": 2,
                    "tracks": [
                        { "id": "track-2", "clips": [] }
                    ]
                }
            }),
        ));
        assert!(response.ok);

        let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
        assert!(saved.contains("\"version\": 2"));

        let error_response = dispatch(request(
            "timeline.save",
            json!({
                "path": disallowed_absolute_path(),
                "json": { "version": 3 }
            }),
        ));
        assert!(!error_response.ok);
        assert_error_contains(&error_response.error, "outside sandbox");
    }

    fn request(method: &str, params: Value) -> Request {
        Request {
            id: format!("req-{method}"),
            method: method.to_string(),
            params,
        }
    }

    fn assert_error_contains(error: &Option<String>, expected: &str) {
        let error = error.as_deref().expect("response should include an error");
        assert!(
            error.contains(expected),
            "expected '{error}' to contain '{expected}'"
        );
    }

    fn disallowed_absolute_path() -> String {
        if cfg!(windows) {
            "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
        } else {
            "/etc/passwd".to_string()
        }
    }

    fn absolute_write_rejection_path() -> String {
        if cfg!(windows) {
            "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
        } else {
            "/etc/hosts".to_string()
        }
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
                let _ = remove_dir_all_if_present(&self.path);
            }
        }
    }

    fn remove_dir_all_if_present(path: &Path) -> std::io::Result<()> {
        if path.exists() {
            fs::remove_dir_all(path)?;
        }

        Ok(())
    }
}
