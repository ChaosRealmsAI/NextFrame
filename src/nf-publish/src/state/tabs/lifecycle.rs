//! state tab lifecycle helpers
use objc2::rc::Retained;
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use objc2_web_kit::WKWebView;

use crate::error::error_with_fix;
use crate::state::{
    APP_STATE, BrowserTab, BrowserTabKind, SavedDynamicTab, TABS, cmd_file,
    current_url_for_webview, log_crash, new_tab_html, remove_view_from_superview, result_file,
    screenshot_file, title_for_webview, upload_file, webview_for_tab, webview_host_view,
};
use crate::ui::create_webview;

use super::super::persistence;
use super::refresh_browser_ui;

pub(crate) fn switch_tab(index: usize) {
    let Some(state) = APP_STATE.get() else { return };
    let prev = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    let (prev_ptr, next_ptr) = {
        let Ok(mut tabs) = state.browser_tabs.lock() else {
            return;
        };
        let prev_ptr = if prev == index {
            None
        } else {
            tabs.iter()
                .find(|tab| tab.id == prev)
                .map(|tab| tab.webview_ptr)
        };
        let Some(next_pos) = tabs.iter().position(|tab| tab.id == index) else {
            return;
        };
        tabs[next_pos].visible = true;
        let next_ptr = tabs[next_pos].webview_ptr;
        (prev_ptr, next_ptr)
    };

    let result = unsafe { // SAFETY: `catch` is the intended Objective-C boundary here, and the stored webview pointers come from retained WKWebView instances in app state.
        objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
            if let Some(prev_ptr) = prev_ptr {
                unsafe { // SAFETY: `prev_ptr` points to the previously visible retained WKWebView for this tab set.
                    (&*prev_ptr).setHidden(true);
                }
            }
            unsafe { // SAFETY: `next_ptr` points to the retained WKWebView selected as the new active tab.
                (&*next_ptr).setHidden(false);
            }
        }))
    };
    if let Err(err) /* Fix: propagate or log the formatted error below */ = result {
        log_crash("ERROR", "switch_tab", &format!("ObjC exception: {err:?}"));
        return;
    }

    state
        .current_tab
        .store(index, std::sync::atomic::Ordering::Relaxed);
    sync_tab_state_from_webview(index);
    refresh_browser_ui();
    persistence::save_browser_session();
}

fn sync_tab_state_locked(tab: &mut BrowserTab, webview: &WKWebView) {
    tab.current_url = current_url_for_webview(webview);
    if !tab.current_url.is_empty() {
        tab.last_committed_url = tab.current_url.clone();
    }
    tab.title = title_for_webview(webview);
    // SAFETY: `webview` is a live WKWebView and these are standard readonly state accessors.
    tab.is_loading = unsafe { webview.isLoading() }; // SAFETY: see comment above.
    // SAFETY: `webview` is a live WKWebView and these are standard readonly state accessors.
    tab.can_go_back = unsafe { webview.canGoBack() }; // SAFETY: see comment above.
    // SAFETY: `webview` is a live WKWebView and these are standard readonly state accessors.
    tab.can_go_forward = unsafe { webview.canGoForward() }; // SAFETY: see comment above.
}

pub(crate) fn sync_tab_state_from_webview(tab_id: usize) {
    let Some(state) = APP_STATE.get() else { return };
    let Ok(mut tabs) = state.browser_tabs.lock() else {
        return;
    };
    let Some(tab) = tabs.iter_mut().find(|tab| tab.id == tab_id) else {
        return;
    };
    let webview = unsafe { &*tab.webview_ptr }; // SAFETY: `tab.webview_ptr` comes from a retained WKWebView stored in app state and stays valid until tab teardown.
    sync_tab_state_locked(tab, webview);
    let active = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    persistence::save_browser_session_snapshot(&tabs, active);
    drop(tabs);
    refresh_browser_ui();
}

pub(crate) fn set_tab_loading_state(tab_id: usize, is_loading: bool) {
    let Some(state) = APP_STATE.get() else { return };
    let Ok(mut tabs) = state.browser_tabs.lock() else {
        return;
    };
    let Some(tab) = tabs.iter_mut().find(|tab| tab.id == tab_id) else {
        return;
    };
    tab.is_loading = is_loading;
    let active = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    persistence::save_browser_session_snapshot(&tabs, active);
    drop(tabs);
    refresh_browser_ui();
}

pub(crate) fn update_tab_after_navigation_event(tab_id: usize) {
    sync_tab_state_from_webview(tab_id);
    if tab_id < TABS.len() {
        persistence::save_tab_urls();
    }
}

pub(crate) fn create_dynamic_tab(
    initial_url: Option<&str>,
    activate: bool,
) -> Result<usize, String> {
    let is_new_tab = initial_url.is_none() || initial_url == Some("about:blank");
    let initial_url = initial_url.unwrap_or("about:blank");
    let state = APP_STATE.get().ok_or_else(|| {
        error_with_fix(
            "create the browser tab",
            "the app state is not initialized",
            "Retry after nf-publish finishes launching.",
        )
    })?;
    let host = webview_host_view().ok_or_else(|| {
        error_with_fix(
            "create the browser tab",
            "the webview host view is missing",
            "Retry after the main window finishes initializing.",
        )
    })?;
    let config = unsafe { &*state.config_ptr }; // SAFETY: `config_ptr` is initialized from the retained startup WKWebViewConfiguration and lives for the app lifetime.
    let ui_delegate = unsafe { &*state.ui_delegate_ptr }; // SAFETY: `ui_delegate_ptr` is initialized from the retained startup WKUIDelegate object and lives for the app lifetime.
    let nav_delegate = unsafe { &*state.nav_delegate_ptr }; // SAFETY: `nav_delegate_ptr` is initialized from the retained startup WKNavigationDelegate object and lives for the app lifetime.
    let frame = host.frame();
    let Some(mtm) = objc2_foundation::MainThreadMarker::new() else {
        return Err(/* Fix: user-facing error formatted below */ error_with_fix(
            "create the browser tab",
            "the main thread is not available",
            "Retry the command from the main UI thread.",
        ));
    };
    let webview = create_webview(
        mtm,
        NSRect::new(
            NSPoint::new(0.0, 0.0),
            NSSize::new(frame.size.width, frame.size.height),
        ),
        initial_url,
        config,
        ui_delegate,
        nav_delegate,
    );
    unsafe { // SAFETY: `webview` is a live WKWebView and `setCustomUserAgent:` accepts the shared NSString created from the stored user agent.
        webview.setCustomUserAgent(Some(&NSString::from_str(state.user_agent)));
    }
    if is_new_tab {
        let html = NSString::from_str(&new_tab_html());
        unsafe { // SAFETY: `webview` is a live WKWebView and `loadHTMLString:baseURL:` accepts this temporary NSString and a `None` base URL.
            webview.loadHTMLString_baseURL(&html, None);
        }
    }
    webview.setHidden(!activate);
    host.addSubview(&webview);

    let webview_ptr = Retained::into_raw(webview);
    let new_id = state
        .next_tab_id
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    {
        let Ok(mut tabs) = state.browser_tabs.lock() else {
            return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                "update the browser tab state",
                "the tab state lock is poisoned",
                "Retry the command. If it keeps failing, restart nf-publish.",
            ));
        };
        tabs.push(BrowserTab {
            id: new_id,
            kind: BrowserTabKind::Dynamic,
            title: "New Tab".to_owned(),
            current_url: initial_url.to_owned(),
            last_committed_url: initial_url.to_owned(),
            can_go_back: false,
            can_go_forward: false,
            is_loading: initial_url != "about:blank",
            visible: true,
            webview_ptr: webview_ptr as *const WKWebView,
        });
        let active = if activate {
            new_id
        } else {
            state.current_tab.load(std::sync::atomic::Ordering::Relaxed)
        };
        persistence::save_browser_session_snapshot(&tabs, active);
    }
    log_crash(
        "DEBUG",
        "new_tab",
        &format!("created tab {} for {}", new_id, initial_url),
    );

    if activate {
        switch_tab(new_id);
    } else {
        refresh_browser_ui();
    }
    Ok(new_id)
}

pub(crate) fn close_tab(tab_id: usize) -> Result<(), String> {
    if tab_id < TABS.len() {
        let state = APP_STATE.get().ok_or_else(|| {
            error_with_fix(
                "close the browser tab",
                "the app state is not initialized",
                "Retry after nf-publish finishes launching.",
            )
        })?;
        let current = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
        {
            let Ok(mut tabs) = state.browser_tabs.lock() else {
                return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                    "update the browser tab state",
                    "the tab state lock is poisoned",
                    "Retry the command. If it keeps failing, restart nf-publish.",
                ));
            };
            if let Some(tab) = tabs.iter_mut().find(|tab| tab.id == tab_id) {
                tab.visible = false;
            }
            if current == tab_id {
                let next = tabs
                    .iter()
                    .find(|tab| tab.visible && tab.id != tab_id)
                    .map(|tab| tab.id);
                if let Some(next_id) = next {
                    drop(tabs);
                    switch_tab(next_id);
                } else {
                    drop(tabs);
                    if let Some(wv) = webview_for_tab(tab_id) {
                        wv.setHidden(true);
                    }
                    refresh_browser_ui();
                }
            } else {
                drop(tabs);
                refresh_browser_ui();
            }
        }
        return Ok(());
    }

    let state = APP_STATE.get().ok_or_else(|| {
        error_with_fix(
            "close the browser tab",
            "the app state is not initialized",
            "Retry after nf-publish finishes launching.",
        )
    })?;
    let current = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    let (removed_ptr, next_active, snapshot) = {
        let Ok(mut tabs) = state.browser_tabs.lock() else {
            return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                "update the browser tab state",
                "the tab state lock is poisoned",
                "Retry the command. If it keeps failing, restart nf-publish.",
            ));
        };
        let Some(position) = tabs.iter().position(|tab| tab.id == tab_id) else {
            return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                "close the browser tab",
                format!("tab {tab_id} was not found"),
                "List tabs again and retry with a valid tab id.",
            ));
        };
        let removed = tabs.remove(position);
        let next_active = if current == tab_id {
            tabs.get(position.saturating_sub(1))
                .or_else(|| tabs.get(position))
                .map(|tab| tab.id)
                .unwrap_or(0)
        } else {
            current
        };
        let snapshot = tabs.clone();
        (removed.webview_ptr, next_active, snapshot)
    };

    let webview = unsafe { &*removed_ptr }; // SAFETY: `removed_ptr` was taken from a retained WKWebView removed from the tab list but still alive until we drop the retained owner.
    remove_view_from_superview(webview);
    let _ = std::fs::remove_file(cmd_file(tab_id));
    let _ = std::fs::remove_file(result_file(tab_id));
    let _ = std::fs::remove_file(screenshot_file(tab_id));
    let _ = std::fs::remove_file(upload_file(tab_id));

    persistence::save_browser_session_snapshot(&snapshot, next_active);
    if current == tab_id {
        switch_tab(next_active);
    } else {
        state
            .current_tab
            .store(next_active, std::sync::atomic::Ordering::Relaxed);
        refresh_browser_ui();
    }
    Ok(())
}

pub(crate) fn restore_dynamic_tabs(dynamic_tabs: &[SavedDynamicTab]) {
    for tab in dynamic_tabs {
        let url = if tab.url.trim().is_empty() {
            "about:blank"
        } else {
            tab.url.as_str()
        };
        if let Ok(id) = create_dynamic_tab(Some(url), false) {
            let Some(state) = APP_STATE.get() else { return };
            let Ok(mut tabs) = state.browser_tabs.lock() else {
                return;
            };
            if let Some(runtime_tab) = tabs.iter_mut().find(|runtime_tab| runtime_tab.id == id)
                && !tab.title.trim().is_empty()
            {
                runtime_tab.title = tab.title.clone();
            }
        }
    }
}
