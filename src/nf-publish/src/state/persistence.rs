//! state persistence
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use super::{
    APP_STATE, BrowserTab, BrowserTabKind, TABS, browser_tabs_snapshot, trim_history, url_host,
};

#[derive(Serialize, Deserialize, Default)]
struct SessionsFile {
    #[serde(default)]
    tabs: Vec<SessionState>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub(crate) struct SessionHistoryEntry {
    pub(crate) event: String,
    pub(crate) ts: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct SessionState {
    pub(crate) label: String,
    pub(crate) status: Option<String>,
    pub(crate) last_check: Option<String>,
    pub(crate) last_alive: Option<String>,
    pub(crate) last_expired: Option<String>,
    #[serde(default)]
    pub(crate) history: Vec<SessionHistoryEntry>,
}

impl SessionState {
    fn new(label: &str) -> Self {
        Self {
            label: label.to_owned(),
            status: None,
            last_check: None,
            last_alive: None,
            last_expired: None,
            history: Vec::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub(crate) struct SavedDynamicTab {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) title: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct BrowserSessionFile {
    #[serde(default)]
    dynamic_tabs: Vec<SavedDynamicTab>,
    active_kind: Option<String>,
    active_index: Option<usize>,
}

pub(crate) struct LoadedBrowserSession {
    pub(crate) dynamic_tabs: Vec<SavedDynamicTab>,
    pub(crate) active_workspace: Option<usize>,
    pub(crate) active_dynamic_index: Option<usize>,
}

/// Returns the application support directory used for persisted browser state.
/// The directory is created on demand before the path is returned.
pub(crate) fn state_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_owned());
    let dir = PathBuf::from(home).join("Library/Application Support/com.opc.automedia");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn tab_state_file() -> PathBuf {
    state_dir().join("tabs-state.json")
}

/// Returns the JSON file path that stores the last saved window frame.
/// This lives under the app state directory.
pub(crate) fn window_state_file() -> PathBuf {
    state_dir().join("window-frame.json")
}

/// Returns the JSON file path that stores workspace session health history.
/// Session checks read from and write to this snapshot.
pub(crate) fn sessions_state_file() -> PathBuf {
    state_dir().join("sessions.json")
}

fn browser_tabs_state_file() -> PathBuf {
    state_dir().join("browser-tabs.json")
}

fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp_path = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
    ));
    std::fs::write(&tmp_path, contents)?;
    std::fs::rename(&tmp_path, path)
}

fn browser_session_snapshot_from_tabs(
    tabs: &[BrowserTab],
    active_tab: usize,
) -> BrowserSessionFile {
    let dynamic_tabs: Vec<SavedDynamicTab> = tabs
        .iter()
        .filter(|tab| tab.kind == BrowserTabKind::Dynamic)
        .map(|tab| SavedDynamicTab {
            url: if tab.last_committed_url.is_empty() {
                tab.current_url.clone()
            } else {
                tab.last_committed_url.clone()
            },
            title: tab.title.clone(),
        })
        .collect();

    let active_tab_ref = tabs.iter().find(|tab| tab.id == active_tab);
    let (active_kind, active_index) = match active_tab_ref.map(|tab| tab.kind) {
        Some(BrowserTabKind::Workspace(index)) => (Some("workspace".to_owned()), Some(index)),
        Some(BrowserTabKind::Dynamic) => {
            let idx = tabs
                .iter()
                .filter(|tab| tab.kind == BrowserTabKind::Dynamic)
                .position(|tab| tab.id == active_tab);
            (Some("dynamic".to_owned()), idx)
        }
        None => (Some("workspace".to_owned()), Some(0)),
    };

    BrowserSessionFile {
        dynamic_tabs,
        active_kind,
        active_index,
    }
}

/// Persists a browser-session snapshot from the provided runtime tabs and active tab id.
/// Only dynamic tabs and the active-tab selection are serialized.
pub(crate) fn save_browser_session_snapshot(tabs: &[BrowserTab], active_tab: usize) {
    let file = browser_session_snapshot_from_tabs(tabs, active_tab);
    if let Ok(json) = serde_json::to_vec_pretty(&file) {
        let _ = atomic_write(&browser_tabs_state_file(), &json);
    }
}

/// Persists the current in-memory browser session from global app state.
/// Missing app state or poisoned locks are treated as no-ops.
pub(crate) fn save_browser_session() {
    let Some(state) = APP_STATE.get() else { return };
    let Ok(tabs) = state.browser_tabs.lock() else {
        return;
    };
    let active = state.current_tab.load(Ordering::Relaxed);
    save_browser_session_snapshot(&tabs, active);
}

/// Loads the last saved browser session snapshot from disk.
/// Invalid or missing files fall back to an empty session with workspace tab zero active.
pub(crate) fn load_browser_session() -> LoadedBrowserSession {
    let loaded = std::fs::read_to_string(browser_tabs_state_file())
        .ok()
        .and_then(|contents| serde_json::from_str::<BrowserSessionFile>(&contents).ok())
        .unwrap_or_default();
    let (active_workspace, active_dynamic_index) = match loaded.active_kind.as_deref() {
        Some("workspace") => (loaded.active_index, None),
        Some("dynamic") => (None, loaded.active_index),
        _ => (Some(0), None),
    };
    LoadedBrowserSession {
        dynamic_tabs: loaded.dynamic_tabs,
        active_workspace,
        active_dynamic_index,
    }
}

fn normalize_sessions(mut loaded: Vec<SessionState>) -> Vec<SessionState> {
    let mut normalized = Vec::with_capacity(TABS.len());
    for tab in TABS {
        if let Some(idx) = loaded.iter().position(|session| session.label == tab.label) {
            let mut session = loaded.remove(idx);
            session.label = tab.label.to_owned();
            trim_history(&mut session.history);
            normalized.push(session);
        } else {
            normalized.push(SessionState::new(tab.label));
        }
    }
    normalized
}

/// Loads persisted session health state and normalizes it to the current workspace list.
/// Missing entries are synthesized so every workspace tab has a session record.
pub(crate) fn load_sessions() -> Vec<SessionState> {
    let loaded = std::fs::read_to_string(sessions_state_file())
        .ok()
        .and_then(|s| serde_json::from_str::<SessionsFile>(&s).ok())
        .map(|file| file.tabs)
        .unwrap_or_default();
    normalize_sessions(loaded)
}

/// Persists the provided session health snapshot after trimming stored history entries.
/// The file is written atomically to avoid partial updates.
pub(crate) fn save_sessions_snapshot(sessions: &[SessionState]) {
    let mut tabs = sessions.to_vec();
    for session in &mut tabs {
        trim_history(&mut session.history);
    }
    if let Ok(json) = serde_json::to_vec_pretty(&SessionsFile { tabs }) {
        let _ = atomic_write(&sessions_state_file(), &json);
    }
}

/// Saves the current workspace tab URLs for next launch.
/// URLs that drift outside their workspace host fall back to the last valid or default URL.
pub(crate) fn save_tab_urls() {
    let tabs = browser_tabs_snapshot();
    let old_urls = load_tab_urls();
    let mut urls: Vec<String> = Vec::new();
    for i in 0..TABS.len() {
        let current_url = tabs
            .iter()
            .find(|tab| tab.id == i)
            .map(|tab| tab.current_url.clone())
            .unwrap_or_default();
        let expected_host = url_host(TABS[i].url);
        let current_host = url_host(&current_url);
        let url = if !current_url.is_empty() && current_host == expected_host {
            current_url
        } else if i < old_urls.len() && !old_urls[i].is_empty() {
            old_urls[i].clone()
        } else {
            TABS[i].url.to_owned()
        };
        urls.push(url);
    }
    if let Ok(json) = serde_json::to_string(&urls) {
        let _ = atomic_write(&tab_state_file(), json.as_bytes());
    }
}

/// Loads the saved workspace tab URLs from disk.
/// Invalid or missing data returns an empty list.
pub(crate) fn load_tab_urls() -> Vec<String> {
    std::fs::read_to_string(tab_state_file())
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

/// Saves the current window frame coordinates and size as JSON.
/// The frame is written atomically to the app state directory.
pub(crate) fn save_window_frame(x: f64, y: f64, w: f64, h: f64) {
    let json = format!(r#"{{"x":{x},"y":{y},"w":{w},"h":{h}}}"#);
    let _ = atomic_write(&window_state_file(), json.as_bytes());
}

/// Loads the saved window frame coordinates and size from disk.
/// Returns `None` when the file is missing or malformed.
pub(crate) fn load_window_frame() -> Option<(f64, f64, f64, f64)> {
    let s = std::fs::read_to_string(window_state_file()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&s).ok()?;
    Some((
        v["x"].as_f64()?,
        v["y"].as_f64()?,
        v["w"].as_f64()?,
        v["h"].as_f64()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::super::{normalize_user_url, short_title, url_host};

    #[test]
    fn normalize_user_url_handles_expected_inputs() {
        assert_eq!(
            normalize_user_url("https://example.com"),
            Some("https://example.com".to_owned())
        );
        assert_eq!(
            normalize_user_url("example.com"),
            Some("https://example.com".to_owned())
        );
        assert_eq!(
            normalize_user_url("about:blank"),
            Some("about:blank".to_owned())
        );
        assert_eq!(normalize_user_url(""), None);
        assert_eq!(normalize_user_url("has spaces"), None);
    }

    #[test]
    fn url_host_extracts_hostname_without_port() {
        assert_eq!(
            url_host("https://creator.douyin.com/path"),
            "creator.douyin.com".to_owned()
        );
        assert_eq!(
            url_host("https://example.com:8080/path"),
            "example.com".to_owned()
        );
        assert_eq!(url_host(""), "".to_owned());
    }

    #[test]
    fn short_title_truncates_and_defaults() {
        assert_eq!(short_title("Short"), "Short".to_owned());
        assert_eq!(
            short_title("This is a very long title that exceeds eighteen characters"),
            "This is a very lon…".to_owned()
        );
        assert_eq!(short_title(""), "New Tab".to_owned());
    }
}
