mod lifecycle;
mod platform;

use objc2::msg_send;
use objc2_app_kit::{NSButton, NSColor};
use objc2_foundation::NSString;
use serde::Serialize;

use crate::state::{
    APP_STATE, BrowserTabKind, TABS, active_tab_id, address_field, back_button, bookmarks_bar_view,
    browser_tabs_snapshot, browser_target, forward_button, reload_button, tab_strip_view,
    tab_title_from_state,
};
use crate::ui::{rebuild_bookmarks_bar, rebuild_tab_strip};

pub(crate) use lifecycle::{
    close_tab, create_dynamic_tab, restore_dynamic_tabs, set_tab_loading_state, switch_tab,
    sync_tab_state_from_webview, update_tab_after_navigation_event,
};
pub(crate) use platform::{
    go_back, go_forward, navigate_active_input, navigate_tab_to_url, open_bookmark, reload_tab,
};

#[derive(Clone, Serialize)]
pub(crate) struct BrowserTabInfo {
    pub(crate) id: usize,
    pub(crate) kind: &'static str,
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) current: bool,
    pub(crate) loading: bool,
}

#[derive(Clone)]
pub(crate) struct BrowserTabView {
    pub(crate) id: usize,
    pub(crate) title: String,
    pub(crate) active: bool,
    pub(crate) loading: bool,
}

pub(crate) fn refresh_sidebar_button_title(_tab: usize) {
    refresh_bookmarks_bar();
}

pub(crate) fn refresh_all_sidebar_button_titles() {
    refresh_bookmarks_bar();
}

fn refresh_browser_controls() {
    fn set_nav_button_state(button: &NSButton, enabled: bool) {
        let tint = if enabled {
            NSColor::colorWithSRGBRed_green_blue_alpha(0.30, 0.30, 0.32, 1.0)
        } else {
            NSColor::colorWithSRGBRed_green_blue_alpha(0.72, 0.72, 0.74, 1.0)
        };
        button.setEnabled(enabled);
        // SAFETY: `button` is a live NSButton and `setContentTintColor:` is a valid selector taking the NSColor produced above.
        let _: () = unsafe { msg_send![button, setContentTintColor: &*tint] }; // SAFETY: see comment above.
    }

    let Some(state) = APP_STATE.get() else { return };
    let active = {
        let Ok(tabs) = state.browser_tabs.lock() else {
            return;
        };
        let active_id = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
        tabs.iter().find(|tab| tab.id == active_id).cloned()
    };
    let Some(active) = active else { return };

    if let Some(field) = address_field() {
        let url = if !active.current_url.is_empty() {
            active.current_url.clone()
        } else if !active.last_committed_url.is_empty() {
            active.last_committed_url.clone()
        } else {
            match active.kind {
                BrowserTabKind::Workspace(index) => TABS[index].url.to_owned(),
                BrowserTabKind::Dynamic => "about:blank".to_owned(),
            }
        };
        field.setStringValue(&NSString::from_str(&url));
    }
    if let Some(button) = back_button() {
        set_nav_button_state(button, active.can_go_back);
    }
    if let Some(button) = forward_button() {
        set_nav_button_state(button, active.can_go_forward);
    }
    if let Some(button) = reload_button() {
        button.setEnabled(true);
        button.setTitle(&NSString::from_str("↻"));
    }
}

fn refresh_bookmarks_bar() {
    let Some(bookmarks_bar) = bookmarks_bar_view() else {
        return;
    };
    let Some(target) = browser_target() else {
        return;
    };
    let Some(state) = APP_STATE.get() else { return };
    let statuses = state
        .session_status
        .lock()
        .ok()
        .map(|s| s.clone())
        .unwrap_or_default();
    rebuild_bookmarks_bar(bookmarks_bar, target, &statuses);
}

fn refresh_tab_strip() {
    let Some(tab_strip) = tab_strip_view() else {
        return;
    };
    let Some(target) = browser_target() else {
        return;
    };
    let Some(state) = APP_STATE.get() else { return };
    let active_id = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    let views = {
        let Ok(tabs) = state.browser_tabs.lock() else {
            return;
        };
        tabs.iter()
            .filter(|tab| tab.visible)
            .map(|tab| BrowserTabView {
                id: tab.id,
                title: tab_title_from_state(tab),
                active: tab.id == active_id,
                loading: tab.is_loading,
            })
            .collect::<Vec<_>>()
    };
    rebuild_tab_strip(tab_strip, target, &views);
}

pub(crate) fn refresh_browser_ui() {
    refresh_tab_strip();
    refresh_browser_controls();
    refresh_bookmarks_bar();
    if let Some(state) = APP_STATE.get() {
        // SAFETY: `window_ptr` is initialized once from the retained main NSWindow during startup and remains valid for the app lifetime.
        let window = unsafe { &*state.window_ptr }; // SAFETY: see comment above.
        crate::ui::move_traffic_lights(window);
    }
}

pub(crate) fn all_tab_ids() -> Vec<usize> {
    browser_tabs_snapshot()
        .into_iter()
        .map(|tab| tab.id)
        .collect()
}

pub(crate) fn all_tab_infos() -> Vec<BrowserTabInfo> {
    let active = active_tab_id().unwrap_or(0);
    browser_tabs_snapshot()
        .into_iter()
        .map(|tab| BrowserTabInfo {
            id: tab.id,
            kind: match tab.kind {
                BrowserTabKind::Workspace(_) => "workspace",
                BrowserTabKind::Dynamic => "dynamic",
            },
            title: tab.title.clone(),
            url: if tab.current_url.is_empty() {
                tab.last_committed_url.clone()
            } else {
                tab.current_url.clone()
            },
            current: tab.id == active,
            loading: tab.is_loading,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{BrowserTab, dynamic_tab_icon};

    fn test_tab(kind: BrowserTabKind, url: &str, title: &str) -> BrowserTab {
        BrowserTab {
            id: 42,
            kind,
            title: title.to_owned(),
            current_url: url.to_owned(),
            last_committed_url: url.to_owned(),
            can_go_back: false,
            can_go_forward: false,
            is_loading: false,
            visible: true,
            webview_ptr: std::ptr::null(),
        }
    }

    #[test]
    fn tab_title_from_state_formats_workspace_and_dynamic_tabs() {
        let workspace = test_tab(BrowserTabKind::Workspace(0), TABS[0].url, "ignored");
        let dynamic = test_tab(BrowserTabKind::Dynamic, "https://github.com/openai", "Docs");

        assert_eq!(tab_title_from_state(&workspace), "抖 抖音".to_owned());
        assert_eq!(tab_title_from_state(&dynamic), "🐙 Docs".to_owned());
    }

    #[test]
    fn dynamic_tab_icon_maps_known_domains() {
        let github = test_tab(
            BrowserTabKind::Dynamic,
            "https://github.com/openai",
            "GitHub",
        );
        let google = test_tab(
            BrowserTabKind::Dynamic,
            "https://google.com/search",
            "Google",
        );
        let unknown = test_tab(BrowserTabKind::Dynamic, "https://example.com", "Example");

        assert_eq!(dynamic_tab_icon(&github), "🐙");
        assert_eq!(dynamic_tab_icon(&google), "🔍");
        assert_eq!(dynamic_tab_icon(&unknown), "🌐");
    }
}
