//! AutoMedia: AI-controllable multi-platform publisher
//! - Persistent cookies (login once, use forever)
//! - Tab bar for platform switching
//! - Per-tab command channels for parallel AI control:
//!   Tab N: /tmp/wp-cmd-N.js → /tmp/wp-result-N.txt → /tmp/wp-screenshot-N.png
//!   Legacy: /tmp/wp-cmd.js → /tmp/wp-result.txt (routes to current tab)

#![allow(non_snake_case, unused_unsafe)]

mod commands;
#[allow(unsafe_op_in_unsafe_fn)]
mod delegates;
mod error;
mod eval;
mod keyboard;
mod polling;
mod state;
mod ui;

use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSAutoresizingMaskOptions, NSBackingStoreType,
    NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString, NSUUID, ns_string};
use objc2_web_kit::{
    WKUserScript, WKUserScriptInjectionTime, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

use crate::delegates::{BrowserActionTarget, PilotNavDelegate, PilotUIDelegate};
use crate::keyboard::install_browser_shortcuts;
use crate::polling::start_command_poll;
use crate::state::{
    APP_STATE, AppState, BOOKMARKS_BAR_HEIGHT, BrowserTab, BrowserTabKind, TAB_STRIP_HEIGHT, TABS,
    TOOLBAR_HEIGHT, cmd_file, load_browser_session, load_sessions,
    refresh_all_sidebar_button_titles, refresh_browser_ui, restore_dynamic_tabs, result_file,
    session_statuses, switch_tab,
};
use crate::ui::{create_browser_layout, create_webview};

fn main() {
    let Some(mtm) = MainThreadMarker::new() else {
        state::write_stderr_line(format_args!("[publish] must run on main thread"));
        std::process::abort();
    };
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);

    // Restore window frame from last session (fingerprint: window.innerWidth/Height must be stable)
    let (win_x, win_y, win_width, win_height) =
        state::load_window_frame().unwrap_or((100.0, 100.0, 1400.0, 900.0));
    let style = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Resizable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::FullSizeContentView;
    let win_frame = NSRect::new(
        NSPoint::new(win_x, win_y),
        NSSize::new(win_width, win_height),
    );
    let window = unsafe { // SAFETY: `mtm` guarantees main-thread AppKit access and the allocated NSWindow is immediately initialized with a valid frame/style tuple.
        NSWindow::initWithContentRect_styleMask_backing_defer(
            mtm.alloc(),
            win_frame,
            style,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    window.setTitle(ns_string!("AutoMedia"));
    // Traffic lights inline with tab strip — transparent title bar
    window.setTitlebarAppearsTransparent(true);
    // SAFETY: `window` is a live NSWindow and `setTitleVisibility:` is a valid selector taking the NSWindowTitleVisibility integer constant.
    let _: () = unsafe { objc2::msg_send![&*window, setTitleVisibility: 1i64] }; // SAFETY: see comment above. NSWindowTitleHidden
    // Center traffic lights in tab strip — Zed approach:
    // Direct setFrame on each button, using real titlebar height from contentLayoutRect.
    // Must be reapplied on resize (macOS resets positions).
    crate::ui::move_traffic_lights(&window);
    // Only center on first launch (no saved frame)
    if state::load_window_frame().is_none() {
        window.center();
    }

    let container = unsafe { // SAFETY: `mtm` guarantees main-thread AppKit access and `alloc()` returns an NSView ready for `initWithFrame:`.
        objc2_app_kit::NSView::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(win_width, win_height)),
        )
    };
    container.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    let browser_target = BrowserActionTarget::new(mtm);
    let loaded_sessions = load_sessions();
    let loaded_browser_session = load_browser_session();
    let initial_session_status = session_statuses(&loaded_sessions);
    let layout = create_browser_layout(
        mtm,
        win_width,
        win_height,
        &*browser_target as &objc2::runtime::AnyObject,
    );
    container.addSubview(&layout.tab_strip);
    container.addSubview(&layout.toolbar);
    container.addSubview(&layout.bookmarks_bar);
    container.addSubview(&layout.webview_host);

    // SAFETY: `mtm` guarantees main-thread WebKit construction for `WKWebViewConfiguration::new`.
    let config = unsafe { WKWebViewConfiguration::new(mtm) }; // SAFETY: see comment above.

    // Fixed UUID → same persistent cookie store regardless of app bundle location
    let Some(store_id) = NSUUID::initWithUUIDString(
        mtm.alloc(),
        &NSString::from_str("A1B2C3D4-E5F6-7890-ABCD-EF1234567890"),
    ) else {
        state::log_crash("ERROR", "main", "invalid UUID");
        std::process::abort();
    };
    // SAFETY: `store_id` is a valid NSUUID and `mtm` guarantees main-thread access to create the persistent website data store.
    let data_store = unsafe { WKWebsiteDataStore::dataStoreForIdentifier(&store_id, mtm) }; // SAFETY: see comment above.
    unsafe { // SAFETY: `config` and `data_store` are live WebKit objects and `setWebsiteDataStore:` is the supported configuration API.
        config.setWebsiteDataStore(&data_store);
    }

    // ── Fingerprint normalization: make WKWebView indistinguishable from Safari ──
    // Platforms (especially Douyin/Bytedance) fingerprint the browser to detect WKWebView.
    // Key differences: window.webkit exists, window.safari missing, navigator.standalone missing.
    // This script runs before any page JS to patch these signals.
    let fingerprint_js = NSString::from_str(
        r#"
(function() {
    'use strict';
    // ── Fingerprint normalization: make WKWebView indistinguishable from Safari ──
    // Runs atDocumentStart in ALL frames (main + iframes) before any page script.

    var patchedFns = new WeakSet();
    var nativeStrings = new WeakMap();
    var originalFunctionToString = Function.prototype.toString;
    var originalFunctionToLocaleString = Function.prototype.toLocaleString;

    function nativeStringFor(name) {
        return 'function ' + name + '() {\n    [native code]\n}';
    }

    function markPatched(fn, name) {
        patchedFns.add(fn);
        nativeStrings.set(fn, nativeStringFor(name || fn.name || ''));
        return fn;
    }

    Function.prototype.toString = markPatched(function toString() {
        if (patchedFns.has(this)) {
            return nativeStrings.get(this) || nativeStringFor(this.name || '');
        }
        return originalFunctionToString.call(this);
    }, 'toString');

    Function.prototype.toLocaleString = markPatched(function toLocaleString() {
        if (patchedFns.has(this)) {
            return nativeStrings.get(this) || nativeStringFor(this.name || '');
        }
        return originalFunctionToLocaleString.call(this);
    }, 'toLocaleString');

    function safariWebkitShape() {
        var webkit = {};
        try {
            Object.defineProperty(webkit, 'messageHandlers', {
                get: function() { return undefined; },
                configurable: true,
                enumerable: false
            });
        } catch(e) {}
        return webkit;
    }

    function patchWindow(w) {
        if (!w) return;
        try {
            Object.defineProperty(w, 'webkit', {
                value: safariWebkitShape(),
                writable: false,
                configurable: true,
                enumerable: true
            });
        } catch(e) {}
        if (!w.safari) {
            try {
                Object.defineProperty(w, 'safari', { value: window.safari, writable: false, configurable: false, enumerable: true });
            } catch(e) {}
        }
        if (w.navigator && w.navigator.standalone === undefined) {
            try {
                Object.defineProperty(w.navigator, 'standalone', { value: false, writable: false, configurable: false, enumerable: true });
            } catch(e) {}
        }
    }

    function patchIframe(iframe) {
        if (!iframe || iframe.__automediaFingerprintPatched) return;
        try {
            Object.defineProperty(iframe, '__automediaFingerprintPatched', {
                value: true,
                configurable: true
            });
        } catch(e) {
            iframe.__automediaFingerprintPatched = true;
        }
        var applyPatch = markPatched(function applyIframePatch() {
            try {
                patchWindow(iframe.contentWindow);
            } catch(e2) { /* cross-origin iframe, can't patch — that's OK */ }
        }, 'applyIframePatch');
        try {
            iframe.addEventListener('load', applyPatch);
        } catch(e) {}
        applyPatch();
    }

    function patchIframeTree(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
            patchIframe(node);
        }
        if (node.querySelectorAll) {
            var iframes = node.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                patchIframe(iframes[i]);
            }
        }
    }

    function watchIframeInsertions(root) {
        if (!root || !MutationObserver) return;
        var observer = new MutationObserver(markPatched(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var addedNodes = mutations[i].addedNodes;
                for (var j = 0; j < addedNodes.length; j++) {
                    patchIframeTree(addedNodes[j]);
                }
            }
        }, 'MutationObserver'));
        observer.observe(root, { childList: true, subtree: true });
    }

    // Helper: make a function look like native code (defeats toString detection)
    function nativize(fn, name) {
        return markPatched(fn, name);
    }

    // 1. Add Safari signal FIRST (patchWindow copies it to iframes, so it must exist)
    if (!window.safari) {
        try {
            var permFn = nativize(function(bundleId) { return 'default'; }, 'permission');
            var reqFn = nativize(function(url, bundleId, cb) { if(cb) cb('denied'); }, 'requestPermission');
            Object.defineProperty(window, 'safari', {
                value: Object.freeze({
                    pushNotification: Object.freeze({
                        permission: permFn,
                        requestPermission: reqFn
                    })
                }),
                writable: false, configurable: false, enumerable: true
            });
        } catch(e) {}
    }

    // 2. Keep Safari-shaped window.webkit + patch other signals
    patchWindow(window);

    // 3. navigator.standalone (Safari = false, WKWebView = undefined)
    if (navigator.standalone === undefined) {
        try {
            Object.defineProperty(navigator, 'standalone', {
                value: false, writable: false, configurable: false, enumerable: true
            });
        } catch(e) {}
    }

    // 4. Lock navigator.languages to a stable value
    try {
        Object.defineProperty(navigator, 'languages', {
            get: function() { return Object.freeze(['zh-CN', 'zh', 'en']); },
            configurable: false
        });
    } catch(e) {}

    // 5. Lock screen properties (prevent drift from display config changes)
    try {
        Object.defineProperty(screen, 'colorDepth', { get: function() { return 30; }, configurable: false });
        Object.defineProperty(screen, 'pixelDepth', { get: function() { return 30; }, configurable: false });
    } catch(e) {}

    // 6. Ensure navigator.webdriver is false
    try {
        Object.defineProperty(navigator, 'webdriver', {
            get: function() { return false; },
            configurable: false
        });
    } catch(e) {}

    // 7. Request persistent storage (tells WebKit to generate stable DeviceIdHashSalts)
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(function(){});
    }

    // 8. Protect against dynamic iframe detection:
    //    Override createElement and watch DOM mutations so innerHTML/appendChild inserted
    //    iframes also get patched. WKUserScript only injects into frames loaded via URL,
    //    not srcdoc/about:blank.
    var origCreate = document.createElement.bind(document);
    document.createElement = nativize(function(tag) {
        var el = origCreate(tag);
        if (String(tag).toLowerCase() === 'iframe') {
            patchIframe(el);
        }
        return el;
    }, 'createElement');

    patchIframeTree(document.documentElement || document);
    watchIframeInsertions(document.documentElement || document);
})();
"#,
    );
    let user_script = unsafe { // SAFETY: `mtm` guarantees main-thread WebKit object creation and the injected source string lives for the duration of initialization.
        WKUserScript::initWithSource_injectionTime_forMainFrameOnly(
            mtm.alloc(),
            &fingerprint_js,
            WKUserScriptInjectionTime::AtDocumentStart,
            false,
        )
    };
    // SAFETY: `config` is a live WKWebViewConfiguration and `userContentController` is a valid accessor returning its controller.
    let content_controller = unsafe { config.userContentController() }; // SAFETY: see comment above.
    unsafe { // SAFETY: `content_controller` owns the user scripts for `config`, and `user_script` is a valid WKUserScript instance.
        content_controller.addUserScript(&user_script);
    }

    let ui_delegate = PilotUIDelegate::new(mtm);
    let nav_delegate = PilotNavDelegate::new(mtm);
    let wv_frame = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(
            win_width,
            win_height - TAB_STRIP_HEIGHT - TOOLBAR_HEIGHT - BOOKMARKS_BAR_HEIGHT,
        ),
    );

    // Load saved tab URLs from last session (session recovery)
    let saved_urls = state::load_tab_urls();

    // Locked User-Agent — platforms fingerprint this, changing it = session invalidation
    let user_agent = ns_string!(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15"
    );

    let mut webviews: Vec<objc2::rc::Retained<WKWebView>> = Vec::new();
    let mut runtime_tabs: Vec<BrowserTab> = Vec::new();
    for (i, tab) in TABS.iter().enumerate() {
        // Use saved URL if available and non-empty, otherwise use default
        let url = saved_urls
            .get(i)
            .filter(|u| !u.is_empty() && u.starts_with("http"))
            .map(|u| u.as_str())
            .unwrap_or(tab.url);
        let wv = create_webview(mtm, wv_frame, url, &config, &ui_delegate, &nav_delegate);
        unsafe { // SAFETY: `wv` is a live WKWebView and `setCustomUserAgent:` accepts the retained NSString constant used for all tabs.
            wv.setCustomUserAgent(Some(user_agent));
        }
        wv.setHidden(true); // All workspace tabs start hidden — opened via bookmarks
        layout.webview_host.addSubview(&wv);
        runtime_tabs.push(BrowserTab {
            id: i,
            kind: BrowserTabKind::Workspace(i),
            title: tab.label.to_owned(),
            current_url: url.to_owned(),
            last_committed_url: url.to_owned(),
            can_go_back: false,
            can_go_forward: false,
            is_loading: true,
            visible: false,
            webview_ptr: &*wv as *const WKWebView,
        });
        webviews.push(wv);
    }

    unsafe { // SAFETY: `address_field` is a live NSTextField and `browser_target` implements the NSTextField delegate methods used by the address bar.
        layout
            .address_field
            .setDelegate(Some(objc2::runtime::ProtocolObject::from_ref(
                &*browser_target,
            )));
    }

    let _ = APP_STATE.set(AppState {
        window_ptr: &*window as *const _,
        current_tab: std::sync::atomic::AtomicUsize::new(0),
        next_tab_id: std::sync::atomic::AtomicUsize::new(TABS.len()),
        browser_tabs: std::sync::Mutex::new(runtime_tabs),
        session_status: std::sync::Mutex::new(initial_session_status),
        sessions: std::sync::Mutex::new(loaded_sessions),
        bookmarks_bar_ptr: &*layout.bookmarks_bar as *const _,
        tab_strip_ptr: &*layout.tab_strip as *const _,
        webview_host_ptr: &*layout.webview_host as *const _,
        address_field_ptr: &*layout.address_field as *const _,
        back_button_ptr: &*layout.back_button as *const _,
        forward_button_ptr: &*layout.forward_button as *const _,
        reload_button_ptr: &*layout.reload_button as *const _,
        browser_target_ptr: (&*browser_target as &objc2::runtime::AnyObject) as *const _,
        config_ptr: &*config as *const _,
        ui_delegate_ptr: &*ui_delegate as *const _,
        nav_delegate_ptr: &*nav_delegate as *const _,
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    });
    restore_dynamic_tabs(&loaded_browser_session.dynamic_tabs);
    if let Some(active_workspace) = loaded_browser_session.active_workspace {
        switch_tab(active_workspace.min(TABS.len().saturating_sub(1)));
    } else if let Some(dynamic_index) = loaded_browser_session.active_dynamic_index {
        let dynamic_tabs = state::all_tab_infos();
        if let Some(tab_id) = dynamic_tabs
            .iter()
            .filter(|tab| tab.kind == "dynamic")
            .nth(dynamic_index)
            .map(|tab| tab.id)
        {
            switch_tab(tab_id);
        }
    }
    refresh_all_sidebar_button_titles();
    refresh_browser_ui();
    install_browser_shortcuts();

    window.setContentView(Some(&container));
    window.makeKeyAndOrderFront(None);
    #[allow(deprecated)]
    unsafe { // SAFETY: the app is fully initialized and `activateIgnoringOtherApps:` is the intended AppKit call to bring it to the foreground.
        app.activateIgnoringOtherApps(true);
    }

    start_command_poll();

    state::write_stderr_line(format_args!(
        "[publish] automedia started (per-tab channels)"
    ));
    for (i, tab) in TABS.iter().enumerate() {
        state::write_stderr_line(format_args!(
            "[publish] tab {i} ({}): cmd -> {}  result -> {}",
            tab.label,
            cmd_file(i),
            result_file(i)
        ));
    }
    state::write_stderr_line(format_args!(
        "[publish] legacy: cmd -> {}  result -> {}",
        state::LEGACY_CMD,
        state::LEGACY_RESULT
    ));

    let _keep = (
        ui_delegate,
        nav_delegate,
        browser_target,
        layout.tab_strip,
        layout.toolbar,
        layout.bookmarks_bar,
        layout.webview_host,
        layout.address_field,
        layout.back_button,
        layout.forward_button,
        layout.reload_button,
        container,
        webviews,
    );
    app.run();
}
