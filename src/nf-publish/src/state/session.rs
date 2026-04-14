use super::{
    APP_STATE, SessionHistoryEntry, SessionState, TABS, current_url_for_webview, log_activity,
    persistence, tabs, timestamp_now, trim_history, url_host, webview_for_tab,
};

/// Converts persisted session status strings into bookmark-bar status dots.
/// `"alive"` becomes `Some(true)`, `"expired"` becomes `Some(false)`, and unknown stays `None`.
pub(crate) fn session_statuses(sessions: &[SessionState]) -> Vec<Option<bool>> {
    sessions
        .iter()
        .map(|session| match session.status.as_deref() {
            Some("alive") => Some(true),
            Some("expired") => Some(false),
            _ => None,
        })
        .collect()
}

/// Updates the stored session state for a workspace tab after a session health check.
/// Changes are persisted and may trigger automatic recovery navigation for alive sessions.
pub(crate) fn check_session(tab: usize, status: &str) {
    let Some(state) = APP_STATE.get() else { return };
    let is_alive = match status {
        "alive" => true,
        "expired" => false,
        _ => return,
    };
    let now = timestamp_now();
    let (changed, snapshot) = {
        let Ok(mut statuses) = state.session_status.lock() else {
            return;
        };
        let Ok(mut sessions) = state.sessions.lock() else {
            return;
        };
        if tab >= sessions.len() || tab >= statuses.len() {
            return;
        }
        let previous = statuses[tab];
        let session = &mut sessions[tab];
        session.label = TABS[tab].label.to_owned();
        session.status = Some(status.to_owned());
        session.last_check = Some(now.clone());
        if is_alive {
            session.last_alive = Some(now.clone());
        } else {
            session.last_expired = Some(now.clone());
        }
        let changed = previous != Some(is_alive);
        if changed {
            session.history.push(SessionHistoryEntry {
                event: status.to_owned(),
                ts: now.clone(),
            });
        }
        trim_history(&mut session.history);
        statuses[tab] = Some(is_alive);
        (changed, sessions.clone())
    };
    persistence::save_sessions_snapshot(&snapshot);
    tabs::refresh_sidebar_button_title(tab);
    if changed {
        let platform = TABS.get(tab).map(|value| value.label).unwrap_or("?");
        log_activity("session", platform, status);
    }

    if is_alive && tab < TABS.len() && let Some(wv) = webview_for_tab(tab) {
        let current_host = current_url_for_webview(wv);
        let current_host = url_host(&current_host);
        let expected_host = url_host(TABS[tab].url);
        if !current_host.is_empty() && current_host != expected_host {
            log_activity(
                "session",
                TABS[tab].label,
                &format!("auto_recovery: {current_host} -> {expected_host}"),
            );
            let _ = tabs::navigate_tab_to_url(tab, TABS[tab].url);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_statuses_extracts_alive_and_expired_states() {
        let sessions = vec![
            SessionState {
                label: "A".to_owned(),
                status: Some("alive".to_owned()),
                last_check: None,
                last_alive: None,
                last_expired: None,
                history: Vec::new(),
            },
            SessionState {
                label: "B".to_owned(),
                status: Some("expired".to_owned()),
                last_check: None,
                last_alive: None,
                last_expired: None,
                history: Vec::new(),
            },
            SessionState {
                label: "C".to_owned(),
                status: None,
                last_check: None,
                last_alive: None,
                last_expired: None,
                history: Vec::new(),
            },
            SessionState {
                label: "D".to_owned(),
                status: Some("unknown".to_owned()),
                last_check: None,
                last_alive: None,
                last_expired: None,
                history: Vec::new(),
            },
        ];

        assert_eq!(
            session_statuses(&sessions),
            vec![Some(true), Some(false), None, None]
        );
    }
}
