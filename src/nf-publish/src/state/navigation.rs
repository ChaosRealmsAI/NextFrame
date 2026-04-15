//! state navigation state helpers
use objc2::msg_send;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSButton, NSTextField, NSView};
use objc2_foundation::NSString;
use objc2_web_kit::WKWebView;

use super::{APP_STATE, BOOKMARK_COLORS, BrowserTab, BrowserTabKind, TABS};

pub(crate) fn active_tab_id() -> Option<usize> {
    let state = APP_STATE.get()?;
    Some(state.current_tab.load(std::sync::atomic::Ordering::Relaxed))
}

pub(crate) fn browser_tabs_snapshot() -> Vec<BrowserTab> {
    let Some(state) = APP_STATE.get() else {
        return Vec::new();
    };
    let Ok(tabs) = state.browser_tabs.lock() else {
        return Vec::new();
    };
    tabs.clone()
}

fn webview_ptr_for_tab(tab_id: usize) -> Option<*const WKWebView> {
    let state = APP_STATE.get()?;
    let Ok(tabs) = state.browser_tabs.lock() else {
        return None;
    };
    tabs.iter()
        .find(|tab| tab.id == tab_id)
        .map(|tab| tab.webview_ptr)
}

pub(crate) fn current_webview() -> Option<&'static WKWebView> {
    let tab_id = active_tab_id()?;
    webview_for_tab(tab_id)
}

pub(crate) fn webview_for_tab(tab_id: usize) -> Option<&'static WKWebView> {
    let ptr = webview_ptr_for_tab(tab_id)?;
    Some(unsafe { &*ptr }) // SAFETY: `ptr` comes from a retained WKWebView stored in app state and remains valid until that tab is torn down.
}

pub(crate) fn tab_index_for_webview(wv: &WKWebView) -> Option<usize> {
    let state = APP_STATE.get()?;
    let ptr = wv as *const WKWebView;
    let Ok(tabs) = state.browser_tabs.lock() else {
        return None;
    };
    tabs.iter()
        .find(|tab| tab.webview_ptr == ptr)
        .map(|tab| tab.id)
}

pub(crate) fn bookmarks_bar_view() -> Option<&'static NSView> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.bookmarks_bar_ptr }) // SAFETY: `bookmarks_bar_ptr` is initialized from a retained startup NSView and lives for the app lifetime.
}

pub(crate) fn tab_strip_view() -> Option<&'static NSView> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.tab_strip_ptr }) // SAFETY: `tab_strip_ptr` is initialized from a retained startup NSView and lives for the app lifetime.
}

pub(crate) fn webview_host_view() -> Option<&'static NSView> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.webview_host_ptr }) // SAFETY: `webview_host_ptr` is initialized from a retained startup NSView and lives for the app lifetime.
}

pub(crate) fn address_field() -> Option<&'static NSTextField> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.address_field_ptr }) // SAFETY: `address_field_ptr` is initialized from a retained startup NSTextField and lives for the app lifetime.
}

pub(crate) fn back_button() -> Option<&'static NSButton> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.back_button_ptr }) // SAFETY: `back_button_ptr` is initialized from a retained startup NSButton and lives for the app lifetime.
}

pub(crate) fn forward_button() -> Option<&'static NSButton> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.forward_button_ptr }) // SAFETY: `forward_button_ptr` is initialized from a retained startup NSButton and lives for the app lifetime.
}

pub(crate) fn reload_button() -> Option<&'static NSButton> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.reload_button_ptr }) // SAFETY: `reload_button_ptr` is initialized from a retained startup NSButton and lives for the app lifetime.
}

pub(crate) fn browser_target() -> Option<&'static AnyObject> {
    let state = APP_STATE.get()?;
    Some(unsafe { &*state.browser_target_ptr }) // SAFETY: `browser_target_ptr` points to the retained Objective-C action target created during startup and kept alive for the app lifetime.
}

pub(crate) fn short_title(title: &str) -> String {
    let compact = title.replace('\n', " ").trim().to_owned();
    if compact.is_empty() {
        return "New Tab".to_owned();
    }
    let chars: Vec<char> = compact.chars().collect();
    if chars.len() <= 18 {
        compact
    } else {
        format!("{}…", chars[..18].iter().collect::<String>())
    }
}

pub(crate) fn dynamic_tab_icon(tab: &BrowserTab) -> &'static str {
    let url = if !tab.current_url.trim().is_empty() {
        &tab.current_url
    } else {
        &tab.last_committed_url
    };
    let host = url_host(url).to_ascii_lowercase();

    if host.contains("douyin") {
        "🎵"
    } else if host.contains("xiaohongshu") {
        "📕"
    } else if host.contains("bilibili") {
        "📺"
    } else if host.contains("weixin") || host.contains("qq.com") {
        "💬"
    } else if host.contains("kuaishou") {
        "🎬"
    } else if host.contains("zhihu") {
        "💡"
    } else if host.contains("scys") {
        "💰"
    } else if host.contains("feishu") || host.contains("lark") {
        "📄"
    } else if host.contains("github") {
        "🐙"
    } else if host.contains("google") {
        "🔍"
    } else {
        "🌐"
    }
}

pub(crate) fn tab_title_from_state(tab: &BrowserTab) -> String {
    match tab.kind {
        BrowserTabKind::Workspace(index) => {
            let icon = BOOKMARK_COLORS.get(index).map(|c| c.3).unwrap_or("●");
            format!("{} {}", icon, TABS[index].label)
        }
        BrowserTabKind::Dynamic => format!("{} {}", dynamic_tab_icon(tab), short_title(&tab.title)),
    }
}

pub(crate) fn url_host(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or("")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_owned()
}

pub(crate) fn normalize_user_url(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("about:") || trimmed.contains("://") {
        return Some(trimmed.to_owned());
    }
    if trimmed.contains(' ') {
        return None;
    }
    Some(format!("https://{trimmed}"))
}

pub(crate) fn title_for_webview(webview: &WKWebView) -> String {
    // SAFETY: `webview` is a live WKWebView and `title` is a valid getter that returns an autoreleased NSString if present.
    unsafe { webview.title() } // SAFETY: `webview` is a live WKWebView and `title` is a valid getter that returns an autoreleased NSString if present.
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "New Tab".to_owned())
}

pub(crate) fn current_url_for_webview(webview: &WKWebView) -> String {
    // SAFETY: `webview` is a live WKWebView and `URL` is a valid getter that returns an autoreleased NSURL if present.
    unsafe { webview.URL() } // SAFETY: `webview` is a live WKWebView and `URL` is a valid getter that returns an autoreleased NSURL if present.
        .and_then(|url| url.absoluteString())
        .map(|value| value.to_string())
        .unwrap_or_default()
}

pub(crate) fn make_request(
    url: &str,
) -> Result<objc2::rc::Retained<objc2_foundation::NSURLRequest>, String> {
    let nsurl = objc2_foundation::NSURL::URLWithString(&NSString::from_str(url))
        .ok_or_else(|| format!("invalid URL: {url}"))?;
    Ok(objc2_foundation::NSURLRequest::requestWithURL(&nsurl))
}

pub(crate) fn remove_view_from_superview(view: &AnyObject) {
    let _ = unsafe { // SAFETY: `view` is an Objective-C view object and both `catch` and `removeFromSuperview` are valid at this AppKit boundary.
        // SAFETY: `view` is an Objective-C view object and both `catch` and `removeFromSuperview` are valid at this AppKit boundary.
        objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
            // SAFETY: `view` is a live NSView/NSResponder object and `removeFromSuperview` is a valid selector on it.
            let _: () = unsafe { msg_send![view, removeFromSuperview] }; // SAFETY: `view` is a live NSView/NSResponder object and `removeFromSuperview` is a valid selector on it.
        }))
    };
}
