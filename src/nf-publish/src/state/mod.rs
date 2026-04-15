//! state module exports
use std::sync::atomic::AtomicUsize;
use std::sync::{Mutex, OnceLock};

use crate::delegates::{PilotNavDelegate, PilotUIDelegate};
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSButton, NSTextField, NSView};
use objc2_web_kit::{WKWebView, WKWebViewConfiguration};

mod events;
mod navigation;
mod persistence;
mod session;
mod tabs;

#[allow(unused_imports)]
pub(crate) use events::{log_activity, log_crash, read_activity_log, write_stderr_line};
pub(crate) use events::{timestamp_now, trim_history};
#[allow(unused_imports)]
pub(crate) use navigation::{
    active_tab_id, address_field, back_button, bookmarks_bar_view, browser_tabs_snapshot,
    browser_target, current_url_for_webview, dynamic_tab_icon, forward_button, make_request,
    normalize_user_url, reload_button, remove_view_from_superview, short_title, tab_strip_view,
    tab_title_from_state, title_for_webview, url_host, webview_host_view,
};
#[allow(unused_imports)]
pub(crate) use navigation::{current_webview, tab_index_for_webview, webview_for_tab};
#[cfg(test)]
pub(crate) use persistence::save_browser_session_snapshot;
#[allow(unused_imports)]
pub(crate) use persistence::{
    LoadedBrowserSession, SavedDynamicTab, SessionHistoryEntry, SessionState, load_browser_session,
    load_sessions, load_tab_urls, load_window_frame, save_browser_session, save_tab_urls,
    save_window_frame,
};
#[allow(unused_imports)]
pub(crate) use session::{SessionStatus, check_session, session_statuses};
#[allow(unused_imports)]
pub(crate) use tabs::{
    BrowserTabInfo, BrowserTabView, all_tab_ids, all_tab_infos, close_tab, create_dynamic_tab,
    go_back, go_forward, navigate_active_input, navigate_tab_to_url, open_bookmark,
    refresh_all_sidebar_button_titles, refresh_browser_ui, refresh_sidebar_button_title,
    reload_tab, restore_dynamic_tabs, set_tab_loading_state, switch_tab,
    sync_tab_state_from_webview, update_tab_after_navigation_event,
};

pub(crate) const LEGACY_CMD: &str = "/tmp/wp-cmd.js";
pub(crate) const LEGACY_RESULT: &str = "/tmp/wp-result.txt";
pub(crate) const LEGACY_SCREENSHOT: &str = "/tmp/wp-screenshot.png";
pub(crate) const LEGACY_UPLOAD: &str = "/tmp/wp-upload-path.txt";

pub(crate) const POLL_MS: u64 = 300;
pub(crate) const TAB_STRIP_HEIGHT: f64 = 38.0;
pub(crate) const TOOLBAR_HEIGHT: f64 = 44.0;
pub(crate) const BOOKMARKS_BAR_HEIGHT: f64 = 30.0;

pub(crate) const BOOKMARK_COLORS: &[(f64, f64, f64, &str)] = &[
    (0.10, 0.10, 0.10, "抖"),
    (1.00, 0.14, 0.26, "红"),
    (0.00, 0.63, 0.84, "B"),
    (0.03, 0.76, 0.38, "视"),
    (0.03, 0.76, 0.38, "公"),
    (1.00, 0.40, 0.00, "快"),
    (0.00, 0.40, 1.00, "知"),
    (0.83, 0.66, 0.26, "财"),
    (0.20, 0.44, 1.00, "飞"),
];

fn css_rgb_channel(value: f64) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn css_hex_color(r: f64, g: f64, b: f64) -> String {
    format!(
        "#{:02X}{:02X}{:02X}",
        css_rgb_channel(r),
        css_rgb_channel(g),
        css_rgb_channel(b)
    )
}

fn new_tab_html() -> String {
    let cards = TABS
        .iter()
        .zip(BOOKMARK_COLORS.iter())
        .map(|(tab, (r, g, b, icon))| {
            let color = css_hex_color(*r, *g, *b);
            format!(
                r#"<a class="shortcut" href="{url}">
    <span class="shortcut-circle" style="background:{color};">{icon}</span>
    <span class="shortcut-name">{label}</span>
</a>"#,
                url = tab.url,
                color = color,
                icon = icon,
                label = tab.label
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoMedia</title>
<style>
:root {{
    color-scheme: light;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
    --page-bg: #F9F8F6;
    --card-bg: rgba(255, 255, 255, 0.74);
    --card-border: rgba(180, 168, 153, 0.24);
    --text-main: #2F2A24;
    --text-subtle: #8C8174;
}}
* {{ box-sizing: border-box; }}
html, body {{ height: 100%; margin: 0; }}
body {{
    background:
        radial-gradient(circle at top, rgba(232, 221, 206, 0.52), transparent 36%),
        linear-gradient(180deg, #FBFAF8 0%, var(--page-bg) 100%);
    color: var(--text-main);
}}
.page {{
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
}}
.panel {{
    width: min(760px, 100%);
}}
.title {{
    margin: 0 0 24px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-subtle);
}}
.grid {{
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
}}
.shortcut {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 22px 18px 20px;
    border-radius: 22px;
    border: 1px solid var(--card-border);
    background: var(--card-bg);
    box-shadow: 0 10px 30px rgba(103, 84, 63, 0.08);
    text-decoration: none;
    color: inherit;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}}
.shortcut:hover {{
    transform: translateY(-1px);
    box-shadow: 0 14px 32px rgba(103, 84, 63, 0.12);
    border-color: rgba(153, 134, 113, 0.38);
}}
.shortcut-circle {{
    width: 56px;
    height: 56px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #FFF;
    font-size: 24px;
    font-weight: 700;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}}
.shortcut-name {{
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
}}
@media (max-width: 680px) {{
    .page {{ padding: 28px 18px; }}
    .grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
}}
@media (max-width: 420px) {{
    .grid {{ grid-template-columns: minmax(0, 1fr); }}
}}
</style>
</head>
<body>
<main class="page">
    <section class="panel">
        <h1 class="title">AutoMedia</h1>
        <div class="grid">
{cards}
        </div>
    </section>
</main>
</body>
</html>"#
    )
}

pub(crate) fn cmd_file(tab: usize) -> String {
    format!("/tmp/wp-cmd-{tab}.js")
}

pub(crate) fn result_file(tab: usize) -> String {
    format!("/tmp/wp-result-{tab}.txt")
}

pub(crate) fn screenshot_file(tab: usize) -> String {
    format!("/tmp/wp-screenshot-{tab}.png")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_tab_command_paths_are_tab_scoped() {
        assert_eq!(cmd_file(0), "/tmp/wp-cmd-0.js");
        assert_eq!(result_file(3), "/tmp/wp-result-3.txt");
        assert_eq!(screenshot_file(7), "/tmp/wp-screenshot-7.png");
    }

    #[test]
    fn smoke_new_tab_html_lists_workspace_shortcuts() {
        let html = new_tab_html();

        assert!(html.contains("AutoMedia"));
        assert!(html.contains(TABS[0].label));
        assert!(html.contains(TABS[0].url));
        assert!(html.contains("shortcut"));
    }
}

pub(crate) fn upload_file(tab: usize) -> String {
    format!("/tmp/wp-upload-path-{tab}.txt")
}

pub(crate) struct TabDef {
    pub(crate) label: &'static str,
    pub(crate) url: &'static str,
    pub(crate) check_session_js: &'static str,
    pub(crate) keep_alive_js: &'static str,
}

pub(crate) const TABS: &[TabDef] = &[
    TabDef {
        label: "抖音",
        url: "https://creator.douyin.com",
        check_session_js: r#"(function(){return fetch('/creator-micro/home',{credentials:'include',redirect:'manual'}).then(function(r){return r.status===200?'alive':'expired'}).catch(function(){var u=String(location.href||'');return u.includes('creator.douyin.com')&&!/login|passport/i.test(u)?'alive':'expired'});})()"#,
        keep_alive_js: r#"(function(){return fetch('/creator-micro/home',{credentials:'include'}).then(r=>r.ok?'kept':'fail').catch(()=>'fail');})()"#,
    },
    TabDef {
        label: "小红书",
        url: "https://creator.xiaohongshu.com",
        check_session_js: r#"(function(){return fetch('/api/galaxy/user/info',{credentials:'include'}).then(function(r){return r.status===200?'alive':'expired'}).catch(function(){var u=String(location.href||'');return u.includes('creator.xiaohongshu.com')&&!/login/i.test(u)?'alive':'expired'});})()"#,
        keep_alive_js: r#"(function(){return fetch('/api/galaxy/user/info',{credentials:'include'}).then(r=>r.ok?'kept':'fail').catch(()=>'fail');})()"#,
    },
    TabDef {
        label: "B站",
        url: "https://member.bilibili.com",
        check_session_js: r#"(function(){return fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include'}).then(function(r){return r.json()}).then(function(d){return d.code===0?'alive':'expired'}).catch(function(){var u=String(location.href||'');return u.includes('member.bilibili.com')&&!/login|passport/i.test(u)?'alive':'expired'});})()"#,
        keep_alive_js: r#"(function(){
            return fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include'})
            .then(r=>r.json()).then(d=>{
                if(d.code===0)return 'kept:'+d.data.uname;
                return 'expired:code='+d.code;
            }).then(s=>{
                return fetch('https://passport.bilibili.com/x/passport-login/web/cookie/info',{credentials:'include'})
                .then(r=>r.json()).then(d2=>{
                    var need=d2.data&&d2.data.refresh;
                    return s+(need?':NEED_REFRESH':'');
                }).catch(()=>s);
            }).catch(()=>'fail');
        })()"#,
    },
    TabDef {
        label: "视频号",
        url: "https://channels.weixin.qq.com",
        check_session_js: r#"(function(){return document.querySelector('[class*=qrcode]')===null?'alive':'expired';})()"#,
        keep_alive_js: "",
    },
    TabDef {
        label: "公众号",
        url: "https://mp.weixin.qq.com",
        check_session_js: r#"(function(){const u=new URL(String(location.href||''));return u.hostname==='mp.weixin.qq.com'&&!!u.searchParams.get('token')?'alive':'expired';})()"#,
        keep_alive_js: "",
    },
    TabDef {
        label: "快手",
        url: "https://cp.kuaishou.com",
        check_session_js: r#"(function(){return fetch('/article/manage/video',{credentials:'include',redirect:'manual'}).then(function(r){return r.status===200?'alive':'expired'}).catch(function(){var u=String(location.href||'');return u.includes('cp.kuaishou.com')&&!/login|passport/i.test(u)?'alive':'expired'});})()"#,
        keep_alive_js: r#"(function(){return fetch('/article/manage/video',{credentials:'include'}).then(r=>r.ok?'kept':'fail').catch(()=>'fail');})()"#,
    },
    TabDef {
        label: "知乎",
        url: "https://www.zhihu.com/creator",
        check_session_js: r#"(function(){return fetch('https://www.zhihu.com/api/v4/me',{credentials:'include'}).then(function(r){return r.ok?'alive':'expired'}).catch(function(){var u=String(location.href||'');return u.includes('zhihu.com/creator')&&!/signin/i.test(u)?'alive':'expired'});})()"#,
        keep_alive_js: r#"(function(){return fetch('https://www.zhihu.com/api/v4/me',{credentials:'include'}).then(r=>r.ok?'kept':'fail').catch(()=>'fail');})()"#,
    },
    TabDef {
        label: "生财",
        url: "https://scys.com/",
        check_session_js: r#"(function(){var u=String(location.href||'');return u.includes('scys.com')&&!/login|signin/i.test(u)?'alive':'expired';})()"#,
        keep_alive_js: "",
    },
    TabDef {
        label: "飞书",
        url: "https://my.feishu.cn/drive/home/",
        check_session_js: r#"(function(){var u=String(location.href||'');return u.includes('feishu.cn')&&!/login|passport/i.test(u)?'alive':'expired';})()"#,
        keep_alive_js: "",
    },
];

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum BrowserTabKind {
    Workspace(usize),
    Dynamic,
}

#[derive(Clone)]
pub(crate) struct BrowserTab {
    pub(crate) id: usize,
    pub(crate) kind: BrowserTabKind,
    pub(crate) title: String,
    pub(crate) current_url: String,
    pub(crate) last_committed_url: String,
    pub(crate) can_go_back: bool,
    pub(crate) can_go_forward: bool,
    pub(crate) is_loading: bool,
    pub(crate) visible: bool,
    pub(crate) webview_ptr: *const WKWebView,
}

pub(crate) struct AppState {
    pub(crate) window_ptr: *const objc2_app_kit::NSWindow,
    pub(crate) current_tab: AtomicUsize,
    pub(crate) next_tab_id: AtomicUsize,
    pub(crate) browser_tabs: Mutex<Vec<BrowserTab>>,
    pub(crate) session_status: Mutex<Vec<Option<bool>>>,
    pub(crate) sessions: Mutex<Vec<SessionState>>,
    pub(crate) bookmarks_bar_ptr: *const NSView,
    pub(crate) tab_strip_ptr: *const NSView,
    pub(crate) webview_host_ptr: *const NSView,
    pub(crate) address_field_ptr: *const NSTextField,
    pub(crate) back_button_ptr: *const NSButton,
    pub(crate) forward_button_ptr: *const NSButton,
    pub(crate) reload_button_ptr: *const NSButton,
    pub(crate) browser_target_ptr: *const AnyObject,
    pub(crate) config_ptr: *const WKWebViewConfiguration,
    pub(crate) ui_delegate_ptr: *const PilotUIDelegate,
    pub(crate) nav_delegate_ptr: *const PilotNavDelegate,
    pub(crate) user_agent: &'static str,
}

unsafe impl Send for AppState {} // SAFETY: `AppState` only stores raw pointers to main-thread Cocoa objects and access is externally serialized through the app's main-thread usage.
unsafe impl Sync for AppState {} // SAFETY: shared access goes through interior mutability/atomics, and the raw Cocoa pointers are only dereferenced on the main thread.

pub(crate) static APP_STATE: OnceLock<AppState> = OnceLock::new();
