#![allow(clippy::expect_used)]

use nf_bridge::{dispatch, Request, Response};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;
use std::sync::{MutexGuard, OnceLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

mod autosave_tests;
mod dispatch_tests;
mod episode_tests;
mod export_tests;
mod fs_tests;
mod project_tests;
mod recent_tests;
mod scene_tests;
mod segment_tests;
mod timeline_tests;

fn dispatch_request(method: &str, params: Value) -> Response {
    dispatch(Request {
        id: format!("req-{method}"),
        method: method.to_string(),
        params,
    })
}

fn dispatch_request_with_id(id: impl Into<String>, method: &str, params: Value) -> Response {
    dispatch(Request {
        id: id.into(),
        method: method.to_string(),
        params,
    })
}

fn assert_error_contains(error: Option<&str>, expected: &str) {
    let error = error.expect("response should include an error");
    assert!(
        error.contains(expected),
        "expected '{error}' to contain '{expected}'"
    );
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

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
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

        // SAFETY: integration tests serialize HOME mutations with HOME_ENV_TEST_LOCK.
        unsafe {
            env::set_var("HOME", path);
            env::remove_var("USERPROFILE");
            env::remove_var("HOMEDRIVE");
            env::remove_var("HOMEPATH");
        }

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
    // SAFETY: integration tests serialize HOME mutations with HOME_ENV_TEST_LOCK.
    unsafe {
        match value {
            Some(value) => env::set_var(key, value),
            None => env::remove_var(key),
        }
    }
}
