//! Crate-level smoke tests for nf-publish.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::commands::{parse_command_token, parse_selector_and_timeout};
use crate::state::{
    BrowserTab, BrowserTabKind, TABS, load_browser_session, load_sessions,
    save_browser_session_snapshot, session_statuses,
};
use objc2_web_kit::WKWebView;

static HOME_ENV_LOCK: Mutex<()> = Mutex::new(());

struct TempHome {
    _lock: MutexGuard<'static, ()>,
    path: PathBuf,
    previous_home: Option<OsString>,
}

impl TempHome {
    fn new(prefix: &str) -> Self {
        let lock = HOME_ENV_LOCK
            .lock()
            .expect("HOME env test lock should not be poisoned");
        let path = unique_temp_dir(prefix);
        fs::create_dir_all(&path).expect("temp HOME directory should be created");
        let previous_home = std::env::var_os("HOME");
        // SAFETY: tests serialize HOME mutations with `HOME_ENV_LOCK`, so no concurrent readers
        // or writers in this crate observe an inconsistent environment during the override.
        unsafe {
            std::env::set_var("HOME", &path);
        }
        Self {
            _lock: lock,
            path,
            previous_home,
        }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempHome {
    fn drop(&mut self) {
        match &self.previous_home {
            Some(value) => {
                // SAFETY: tests serialize HOME mutations with `HOME_ENV_LOCK`.
                unsafe {
                    // SAFETY: tests serialize HOME mutations with `HOME_ENV_LOCK`.
                    std::env::set_var("HOME", value);
                }
            }
            None => {
                // SAFETY: tests serialize HOME mutations with `HOME_ENV_LOCK`.
                unsafe {
                    // SAFETY: tests serialize HOME mutations with `HOME_ENV_LOCK`.
                    std::env::remove_var("HOME");
                }
            }
        }
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after UNIX_EPOCH")
        .as_nanos();
    std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()))
}

fn fake_browser_tab(
    id: usize,
    kind: BrowserTabKind,
    current_url: &str,
    last_committed_url: &str,
    title: &str,
) -> BrowserTab {
    BrowserTab {
        id,
        kind,
        title: title.to_owned(),
        current_url: current_url.to_owned(),
        last_committed_url: last_committed_url.to_owned(),
        can_go_back: false,
        can_go_forward: false,
        is_loading: false,
        visible: true,
        webview_ptr: std::ptr::null::<WKWebView>(),
    }
}

#[test]
fn state_initialization_loads_default_workspace_sessions_when_missing() {
    let temp_home = TempHome::new("nf-publish-state-init");

    let sessions = load_sessions();

    assert_eq!(
        sessions.len(),
        TABS.len(),
        "expected one session slot per workspace tab"
    );
    assert_eq!(
        sessions
            .iter()
            .map(|session| session.label.as_str())
            .collect::<Vec<_>>(),
        TABS.iter().map(|tab| tab.label).collect::<Vec<_>>(),
        "default session labels should follow the workspace tabs"
    );
    assert_eq!(
        session_statuses(&sessions),
        vec![None; TABS.len()],
        "missing session state should initialize all tabs as unknown"
    );

    let session_file = temp_home
        .path()
        .join("Library/Application Support/com.opc.automedia/sessions.json");
    assert!(
        !session_file.exists(),
        "load_sessions should not create a state file when only reading defaults"
    );
}

#[test]
fn tab_creation_snapshot_round_trips_dynamic_tab_metadata() {
    let _temp_home = TempHome::new("nf-publish-tab-snapshot");
    let tabs = vec![
        fake_browser_tab(
            0,
            BrowserTabKind::Workspace(0),
            TABS[0].url,
            TABS[0].url,
            TABS[0].label,
        ),
        fake_browser_tab(
            41,
            BrowserTabKind::Dynamic,
            "https://example.com/draft",
            "",
            "Draft Preview",
        ),
    ];

    save_browser_session_snapshot(&tabs, 41);
    let loaded = load_browser_session();

    assert_eq!(
        loaded.dynamic_tabs.len(),
        1,
        "expected one dynamic tab to be persisted"
    );
    assert_eq!(loaded.dynamic_tabs[0].url, "https://example.com/draft");
    assert_eq!(loaded.dynamic_tabs[0].title, "Draft Preview");
    assert_eq!(
        loaded.active_dynamic_index,
        Some(0),
        "active dynamic tab index should round-trip"
    );
    assert_eq!(
        loaded.active_workspace, None,
        "active workspace should be empty when a dynamic tab was active"
    );
}

#[test]
fn command_parsing_handles_quoted_tokens_and_optional_timeouts() {
    assert_eq!(
        parse_command_token(r#""text:Save draft" remaining args"#),
        Ok(("text:Save draft".to_owned(), "remaining args"))
    );
    assert_eq!(
        parse_selector_and_timeout(r#""button.primary" 2500"#, 5000),
        Ok(("button.primary".to_owned(), 2500))
    );
    assert_eq!(
        parse_selector_and_timeout("button.primary", 5000),
        Ok(("button.primary".to_owned(), 5000))
    );
}
