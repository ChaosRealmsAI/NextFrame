#![allow(clippy::expect_used)]

use bridge::{dispatch, Request, Response};
use serde_json::{json, Value};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process;
use std::sync::{MutexGuard, OnceLock};
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

#[test]
fn dispatch_project_create_then_list_returns_created_project() {
    let temp = TestDir::new("integration-project-create-list");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_path = temp.join("NextFrame/projects/alpha");

    let create_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(create_response.ok);
    assert_eq!(
        create_response.result,
        json!({ "path": project_path.display().to_string() })
    );

    let list_response = dispatch_request("project.list", json!({}));
    assert!(list_response.ok);

    let projects = list_response
        .result
        .get("projects")
        .and_then(Value::as_array)
        .expect("projects array");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].get("name"), Some(&json!("alpha")));
    assert_eq!(
        projects[0].get("path"),
        Some(&json!(project_path.display().to_string()))
    );
    assert_eq!(projects[0].get("episodes"), Some(&json!(0)));
    assert!(
        projects[0]
            .get("updated")
            .and_then(Value::as_str)
            .is_some_and(|updated| !updated.is_empty()),
        "expected updated timestamp"
    );
}

#[test]
fn dispatch_project_create_duplicate_name_returns_error() {
    let temp = TestDir::new("integration-project-create-duplicate");
    let _home = HomeDirOverrideGuard::new(&temp.path);

    let first_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(first_response.ok);

    let second_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(!second_response.ok);
    assert_eq!(second_response.result, Value::Null);
    assert_eq!(
        second_response.error.as_deref(),
        Some("project 'alpha' already exists")
    );
}

#[test]
fn dispatch_episode_create_then_list_returns_created_episode() {
    let temp = TestDir::new("integration-episode-create-list");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_path = temp.join("NextFrame/projects/alpha/ep-01");

    let project_response = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(project_response.ok);

    let create_response = dispatch_request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    );
    assert!(create_response.ok);
    assert_eq!(
        create_response.result,
        json!({ "path": episode_path.display().to_string() })
    );

    let list_response = dispatch_request("episode.list", json!({ "project": "alpha" }));
    assert!(list_response.ok);

    let episodes = list_response
        .result
        .get("episodes")
        .and_then(Value::as_array)
        .expect("episodes array");
    assert_eq!(episodes.len(), 1);
    assert_eq!(episodes[0].get("name"), Some(&json!("ep-01")));
    assert_eq!(
        episodes[0].get("path"),
        Some(&json!(episode_path.display().to_string()))
    );
    assert_eq!(episodes[0].get("order"), Some(&json!(0)));
    assert_eq!(episodes[0].get("segments"), Some(&json!(0)));
    assert_eq!(episodes[0].get("totalDuration"), Some(&json!(0.0)));
}

#[test]
fn dispatch_autosave_write_list_and_clear_round_trip() {
    let temp = TestDir::new("integration-autosave-round-trip");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let autosave_path = temp.join(".nextframe/autosave/alpha.nfproj");
    let timeline = json!({
        "version": "1",
        "tracks": [{"id": "track-1", "clips": []}],
    });

    let write_response = dispatch_request(
        "autosave.write",
        json!({
            "projectId": "alpha",
            "timeline": timeline,
        }),
    );
    assert!(write_response.ok);
    assert_eq!(
        write_response.result.get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );

    let list_response = dispatch_request("autosave.list", json!({}));
    assert!(list_response.ok);
    let entries = list_response.result.as_array().expect("autosave entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("projectId"), Some(&json!("alpha")));
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );
    assert!(
        entries[0]
            .get("modified")
            .and_then(Value::as_u64)
            .is_some_and(|modified| modified > 0),
        "expected modified timestamp"
    );

    let clear_response = dispatch_request("autosave.clear", json!({ "projectId": "alpha" }));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let cleared_list_response = dispatch_request("autosave.list", json!({}));
    assert!(cleared_list_response.ok);
    assert_eq!(cleared_list_response.result, json!([]));
}

#[test]
fn dispatch_recent_add_list_and_clear_round_trip() {
    let temp = TestDir::new("integration-recent-round-trip");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_file = temp.join("alpha.nfproj");
    fs::write(&project_file, "{}").expect("write recent project file");
    let canonical_project_file = fs::canonicalize(&project_file).expect("canonicalize project");

    let add_response = dispatch_request(
        "recent.add",
        json!({ "path": project_file.display().to_string() }),
    );
    assert!(add_response.ok);
    assert_eq!(add_response.result.get("count"), Some(&json!(1)));

    let list_response = dispatch_request("recent.list", json!({}));
    assert!(list_response.ok);
    let entries = list_response.result.as_array().expect("recent entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].get("path"),
        Some(&json!(canonical_project_file.display().to_string()))
    );
    assert_eq!(entries[0].get("name"), Some(&json!("alpha.nfproj")));
    assert!(
        entries[0]
            .get("lastOpened")
            .and_then(Value::as_u64)
            .is_some_and(|last_opened| last_opened > 0),
        "expected lastOpened timestamp"
    );

    let clear_response = dispatch_request("recent.clear", json!({}));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let cleared_list_response = dispatch_request("recent.list", json!({}));
    assert!(cleared_list_response.ok);
    assert_eq!(cleared_list_response.result, json!([]));
}

#[test]
fn dispatch_fs_write_then_read_round_trips() {
    let temp = TestDir::new("integration-fs-round-trip");
    let path = temp.join("round-trip.txt");

    let write_response = dispatch_request(
        "fs.write",
        json!({
            "path": path.display().to_string(),
            "contents": "hello\nfrom\ndispatch",
        }),
    );
    assert!(write_response.ok);
    assert_eq!(
        write_response.result,
        json!({
            "path": path.display().to_string(),
            "bytesWritten": "hello\nfrom\ndispatch".len(),
        })
    );

    let read_response = dispatch_request(
        "fs.read",
        json!({ "path": path.display().to_string() }),
    );
    assert!(read_response.ok);
    assert_eq!(
        read_response.result,
        json!({
            "path": path.display().to_string(),
            "contents": "hello\nfrom\ndispatch",
        })
    );
}

#[test]
fn dispatch_fs_list_dir_returns_expected_entries() {
    let temp = TestDir::new("integration-fs-list-dir");
    let nested_dir = temp.join("nested");
    let a_path = temp.join("a.txt");
    let b_path = temp.join("b.txt");
    fs::write(&b_path, "b").expect("write b.txt");
    fs::write(&a_path, "a").expect("write a.txt");
    fs::create_dir_all(&nested_dir).expect("create nested dir");
    let canonical_a_path = fs::canonicalize(&a_path).expect("canonicalize a.txt");
    let canonical_b_path = fs::canonicalize(&b_path).expect("canonicalize b.txt");
    let canonical_nested_dir = fs::canonicalize(&nested_dir).expect("canonicalize nested dir");

    let response = dispatch_request(
        "fs.listDir",
        json!({ "path": temp.path.display().to_string() }),
    );
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "path": temp.path.display().to_string(),
            "entries": [
                {
                    "name": "a.txt",
                    "path": canonical_a_path.display().to_string(),
                    "isDir": false,
                },
                {
                    "name": "b.txt",
                    "path": canonical_b_path.display().to_string(),
                    "isDir": false,
                },
                {
                    "name": "nested",
                    "path": canonical_nested_dir.display().to_string(),
                    "isDir": true,
                }
            ]
        })
    );
}

#[test]
fn dispatch_multiple_methods_support_a_real_user_session() {
    let temp = TestDir::new("integration-real-session");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_path = temp.join("NextFrame/projects/alpha");
    let episode_path = project_path.join("ep-01");
    let note_path = episode_path.join("notes.txt");
    let autosave_path = temp.join(".nextframe/autosave/alpha.nfproj");
    let recent_project_file = temp.join("alpha-session.nfproj");
    fs::write(&recent_project_file, "{}").expect("write recent project file");
    let canonical_recent_project =
        fs::canonicalize(&recent_project_file).expect("canonicalize recent project");

    let create_project = dispatch_request("project.create", json!({ "name": "alpha" }));
    assert!(create_project.ok);

    let create_episode = dispatch_request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    );
    assert!(create_episode.ok);

    let write_note = dispatch_request(
        "fs.write",
        json!({
            "path": note_path.display().to_string(),
            "contents": "shot list",
        }),
    );
    assert!(write_note.ok);

    let read_note = dispatch_request(
        "fs.read",
        json!({ "path": note_path.display().to_string() }),
    );
    assert!(read_note.ok);
    assert_eq!(read_note.result.get("contents"), Some(&json!("shot list")));

    let autosave_write = dispatch_request(
        "autosave.write",
        json!({
            "projectId": "alpha",
            "json": {
                "version": "1",
                "tracks": [{"id": "track-1", "clips": []}],
            }
        }),
    );
    assert!(autosave_write.ok);

    let recent_add = dispatch_request(
        "recent.add",
        json!({ "path": recent_project_file.display().to_string() }),
    );
    assert!(recent_add.ok);

    let project_list = dispatch_request("project.list", json!({}));
    assert!(project_list.ok);
    assert_eq!(
        project_list.result,
        json!({
            "projects": [{
                "name": "alpha",
                "path": project_path.display().to_string(),
                "episodes": 1,
                "updated": project_list.result["projects"][0]["updated"].as_str().expect("updated timestamp"),
            }]
        })
    );

    let episode_list = dispatch_request("episode.list", json!({ "project": "alpha" }));
    assert!(episode_list.ok);
    assert_eq!(
        episode_list.result,
        json!({
            "episodes": [{
                "name": "ep-01",
                "path": episode_path.display().to_string(),
                "order": 0,
                "segments": 0,
                "totalDuration": 0.0,
            }]
        })
    );

    let autosave_list = dispatch_request("autosave.list", json!({}));
    assert!(autosave_list.ok);
    let autosave_entries = autosave_list
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(autosave_entries.len(), 1);
    assert_eq!(autosave_entries[0].get("projectId"), Some(&json!("alpha")));
    assert_eq!(
        autosave_entries[0].get("path"),
        Some(&json!(autosave_path.display().to_string()))
    );

    let recent_list = dispatch_request("recent.list", json!({}));
    assert!(recent_list.ok);
    let recent_entries = recent_list.result.as_array().expect("recent entries array");
    assert_eq!(recent_entries.len(), 1);
    assert_eq!(
        recent_entries[0].get("path"),
        Some(&json!(canonical_recent_project.display().to_string()))
    );

    let autosave_clear = dispatch_request("autosave.clear", json!({ "projectId": "alpha" }));
    assert!(autosave_clear.ok);
    let recent_clear = dispatch_request("recent.clear", json!({}));
    assert!(recent_clear.ok);
    assert_eq!(dispatch_request("autosave.list", json!({})).result, json!([]));
    assert_eq!(dispatch_request("recent.list", json!({})).result, json!([]));
}

static HOME_ENV_TEST_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();

struct HomeDirOverrideGuard {
    _lock: MutexGuard<'static, ()>,
    home: Option<OsString>,
    userprofile: Option<OsString>,
    homedrive: Option<OsString>,
    homepath: Option<OsString>,
}

impl HomeDirOverrideGuard {
    fn new(path: &std::path::Path) -> Self {
        let lock = lock_home_env_for_test();

        let home = env::var_os("HOME");
        let userprofile = env::var_os("USERPROFILE");
        let homedrive = env::var_os("HOMEDRIVE");
        let homepath = env::var_os("HOMEPATH");

        env::set_var("HOME", path);
        env::remove_var("USERPROFILE");
        env::remove_var("HOMEDRIVE");
        env::remove_var("HOMEPATH");

        Self {
            _lock: lock,
            home,
            userprofile,
            homedrive,
            homepath,
        }
    }
}

fn lock_home_env_for_test() -> MutexGuard<'static, ()> {
    HOME_ENV_TEST_LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Drop for HomeDirOverrideGuard {
    fn drop(&mut self) {
        restore_env_var("HOME", self.home.as_ref());
        restore_env_var("USERPROFILE", self.userprofile.as_ref());
        restore_env_var("HOMEDRIVE", self.homedrive.as_ref());
        restore_env_var("HOMEPATH", self.homepath.as_ref());
    }
}

fn restore_env_var(key: &str, value: Option<&OsString>) {
    match value {
        Some(value) => env::set_var(key, value),
        None => env::remove_var(key),
    }
}
