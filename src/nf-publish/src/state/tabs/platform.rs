use super::super::persistence;
use super::{create_dynamic_tab, set_tab_loading_state};
use crate::state::{
    APP_STATE, BrowserTabKind, TABS, active_tab_id, make_request, normalize_user_url, url_host,
    webview_for_tab,
};

pub(crate) fn open_bookmark(bookmark_index: usize) {
    let url = TABS
        .get(bookmark_index)
        .map(|t| t.url)
        .unwrap_or("about:blank");
    let _ = create_dynamic_tab(Some(url), true);
}

fn workspace_allows_url(workspace: usize, url: &str) -> bool {
    let expected = url_host(TABS[workspace].url);
    let actual = url_host(url);
    !expected.is_empty() && expected == actual
}

pub(crate) fn navigate_tab_to_url(tab_id: usize, url: &str) -> Result<(), String> {
    let normalized = normalize_user_url(url).ok_or_else(|| format!("invalid input: {url}"))?;
    let state = APP_STATE
        .get()
        .ok_or_else(|| "app state not initialized".to_owned())?;
    let kind = {
        let Ok(tabs) = state.browser_tabs.lock() else {
            return Err("failed to lock tabs".to_owned());
        };
        tabs.iter().find(|tab| tab.id == tab_id).map(|tab| tab.kind)
    }
    .ok_or_else(|| format!("tab {tab_id} not found"))?;

    if let BrowserTabKind::Workspace(index) = kind
        && !workspace_allows_url(index, &normalized)
    {
        return Err(format!(
            "workspace tab {index} only allows {}",
            TABS[index].url
        ));
    }

    let request = make_request(&normalized)?;
    let webview = webview_for_tab(tab_id).ok_or_else(|| format!("tab {tab_id} missing webview"))?;
    // SAFETY: `webview` is a live WKWebView and `request` is a valid NSURLRequest created from a normalized URL.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.loadRequest(&request);
    }
    set_tab_loading_state(tab_id, true);
    update_tab_url_hint(tab_id, &normalized);
    if tab_id < TABS.len() {
        persistence::save_tab_urls();
    } else {
        persistence::save_browser_session();
    }
    Ok(())
}

fn update_tab_url_hint(tab_id: usize, url: &str) {
    let Some(state) = APP_STATE.get() else { return };
    let Ok(mut tabs) = state.browser_tabs.lock() else {
        return;
    };
    if let Some(tab) = tabs.iter_mut().find(|tab| tab.id == tab_id) {
        tab.current_url = url.to_owned();
        if !url.is_empty() {
            tab.last_committed_url = url.to_owned();
        }
        if tab.kind == BrowserTabKind::Dynamic && (tab.title.is_empty() || tab.title == "New Tab") {
            tab.title = url.to_owned();
        }
    }
    let active = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    persistence::save_browser_session_snapshot(&tabs, active);
}

pub(crate) fn navigate_active_input(input: &str) -> Result<usize, String> {
    let normalized = normalize_user_url(input).ok_or_else(|| format!("invalid input: {input}"))?;
    let state = APP_STATE
        .get()
        .ok_or_else(|| "app state not initialized".to_owned())?;
    let active = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
    let kind = {
        let Ok(tabs) = state.browser_tabs.lock() else {
            return Err("failed to lock tabs".to_owned());
        };
        tabs.iter().find(|tab| tab.id == active).map(|tab| tab.kind)
    }
    .ok_or_else(|| "active tab not found".to_owned())?;

    match kind {
        BrowserTabKind::Workspace(index) if !workspace_allows_url(index, &normalized) => {
            let new_id = create_dynamic_tab(Some(&normalized), true)?;
            Ok(new_id)
        }
        _ => {
            navigate_tab_to_url(active, &normalized)?;
            Ok(active)
        }
    }
}

pub(crate) fn go_back(target: Option<usize>) -> Result<(), String> {
    let tab_id = target
        .or_else(active_tab_id)
        .ok_or_else(|| "no active tab".to_owned())?;
    let webview = webview_for_tab(tab_id).ok_or_else(|| format!("tab {tab_id} missing webview"))?;
    // SAFETY: `webview` is a live WKWebView and `goBack` is a valid navigation selector on WKWebView.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.goBack();
    }
    set_tab_loading_state(tab_id, true);
    Ok(())
}

pub(crate) fn go_forward(target: Option<usize>) -> Result<(), String> {
    let tab_id = target
        .or_else(active_tab_id)
        .ok_or_else(|| "no active tab".to_owned())?;
    let webview = webview_for_tab(tab_id).ok_or_else(|| format!("tab {tab_id} missing webview"))?;
    // SAFETY: `webview` is a live WKWebView and `goForward` is a valid navigation selector on WKWebView.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.goForward();
    }
    set_tab_loading_state(tab_id, true);
    Ok(())
}

pub(crate) fn reload_tab(target: Option<usize>) -> Result<(), String> {
    let tab_id = target
        .or_else(active_tab_id)
        .ok_or_else(|| "no active tab".to_owned())?;
    let webview = webview_for_tab(tab_id).ok_or_else(|| format!("tab {tab_id} missing webview"))?;
    // SAFETY: `webview` is a live WKWebView and `reload` is a valid navigation selector on WKWebView.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.reload();
    }
    set_tab_loading_state(tab_id, true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_allows_url_requires_matching_host() {
        assert_eq!(
            workspace_allows_url(0, "https://creator.douyin.com/path"),
            true
        );
        assert_eq!(
            workspace_allows_url(0, "https://creator.douyin.com:8443/path"),
            true
        );
        assert_eq!(workspace_allows_url(0, "https://example.com/path"), false);
    }
}
