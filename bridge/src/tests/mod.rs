use super::{
    autosave_storage_test_lock,
    build_export_request,
    build_ffmpeg_command,
    build_ffmpeg_filter_complex,
    build_recording_url,
    cleanup_intermediate_video,
    copy_video_output,
    create_export_log_path,
    decode_file_url_path,
    dialog::{normalize_extension, parse_dialog_filters, with_default_extension},
    dispatch,
    encoding,
    export_runtime,
    export_status_json,
    handle_export_mux_audio,
    home_dir,
    initialize,
    mock_ffmpeg_state,
    next_export_pid,
    parse_audio_sources,
    path,
    percent_complete,
    recent_storage_test_lock,
    remaining_secs,
    reset_ffmpeg_path_cache_for_tests,
    resolve_recorder_frame_path_from_url,
    resolve_write_path,
    secs_to_millis,
    set_autosave_storage_path_override_for_tests,
    set_recent_storage_path_override_for_tests,
    time,
    validation::{
        read_optional_u8_in_range, require_array, require_object, require_positive_f64,
        require_positive_u32, require_string, require_u32, require_value_alias,
        validate_project_component,
    },
    AudioSource,
    CommandOutput,
    ExportTask,
    FfmpegCommand,
    MockFfmpegState,
    ProcessHandle,
    ProcessTerminal,
    RecorderRequest,
    Request,
    MOCK_FFMPEG_TEST_LOCK,
};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process;
use std::sync::{MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

mod autosave_tests;
mod dialog_tests;
mod encoding_tests;
mod export_tests;
mod ffmpeg_tests;
mod fs_tests;
mod log_tests;
mod project_tests;
mod recent_tests;
mod recorder_tests;
mod scene_tests;
mod time_tests;
mod timeline_tests;
mod validation_tests;

struct MockFfmpegHarness {
    _guard: MutexGuard<'static, ()>,
}

impl MockFfmpegHarness {
    fn new() -> Self {
        let guard = MOCK_FFMPEG_TEST_LOCK
            .get_or_init(|| std::sync::Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *state = MockFfmpegState::default();
        }
        reset_ffmpeg_path_cache_for_tests();

        Self { _guard: guard }
    }

    fn set_lookup_result(&self, result: Result<Option<PathBuf>, String>) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.lookup_result = result;
        drop(state);
        reset_ffmpeg_path_cache_for_tests();
    }

    fn push_run_result(&self, result: Result<CommandOutput, String>) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.runs.push_back(result);
    }

    fn take_invocations(&self) -> Vec<FfmpegCommand> {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::mem::take(&mut state.invocations)
    }
}

impl Drop for MockFfmpegHarness {
    fn drop(&mut self) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *state = MockFfmpegState::default();
        reset_ffmpeg_path_cache_for_tests();
    }
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

fn disallowed_dir_path() -> String {
    if cfg!(windows) {
        "C:\\Windows\\System32".to_string()
    } else {
        "/etc".to_string()
    }
}

fn minimal_timeline_json() -> Value {
    json!({
        "version": 1,
        "metadata": {
            "name": "Test Timeline",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "durationMs": 1000
        },
        "tracks": []
    })
}

struct RecentStorageOverrideGuard {
    _lock: MutexGuard<'static, ()>,
}

impl RecentStorageOverrideGuard {
    fn new(path: PathBuf) -> Self {
        let lock = recent_storage_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        set_recent_storage_path_override_for_tests(Some(path));
        Self { _lock: lock }
    }
}

impl Drop for RecentStorageOverrideGuard {
    fn drop(&mut self) {
        set_recent_storage_path_override_for_tests(None);
    }
}

struct AutosaveStorageOverrideGuard {
    _lock: MutexGuard<'static, ()>,
}

impl AutosaveStorageOverrideGuard {
    fn new(path: PathBuf) -> Self {
        let lock = autosave_storage_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        set_autosave_storage_path_override_for_tests(Some(path));
        Self { _lock: lock }
    }
}

impl Drop for AutosaveStorageOverrideGuard {
    fn drop(&mut self) {
        set_autosave_storage_path_override_for_tests(None);
    }
}

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(label: &str) -> Self {
        Self::new_in(&std::env::temp_dir(), label)
    }

    fn new_in(base: &Path, label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = base.join(format!(
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

#[cfg(unix)]
fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_file(target, link)
}

#[cfg(unix)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
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
    fn new(path: &Path) -> Self {
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

fn is_basic_iso_8601_utc(value: &str) -> bool {
    value.len() == 20
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value.as_bytes()[10] == b'T'
        && value.as_bytes()[13] == b':'
        && value.as_bytes()[16] == b':'
        && value.as_bytes()[19] == b'Z'
        && value
            .chars()
            .enumerate()
            .all(|(index, ch)| matches!(index, 4 | 7 | 10 | 13 | 16 | 19) || ch.is_ascii_digit())
}

static EXPORT_TEST_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();

fn lock_export_test() -> MutexGuard<'static, ()> {
    EXPORT_TEST_LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn test_process_handle(
    output_path: PathBuf,
    log_path: PathBuf,
    duration_secs: f64,
    terminal: Option<ProcessTerminal>,
) -> ProcessHandle {
    ProcessHandle {
        export_task: ExportTask {
            join_handle: export_runtime()
                .expect("initialize export runtime")
                .spawn(async {}),
            completion: std::sync::Arc::new(std::sync::Mutex::new(None)),
            cancel_requested: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
        output_path,
        log_path,
        duration_secs,
        started_at: Instant::now(),
        terminal,
    }
}
