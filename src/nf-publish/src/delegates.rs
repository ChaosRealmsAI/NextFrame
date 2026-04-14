//! webview delegates
use std::panic::AssertUnwindSafe;

use objc2::rc::Retained;
use objc2::{MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSButton, NSControl, NSControlTextEditingDelegate, NSTextFieldDelegate, NSTextView,
};
use objc2_foundation::{
    MainThreadMarker, NSArray, NSError, NSNotification, NSObject, NSObjectProtocol, NSString, NSURL,
};
use objc2_web_kit::{
    WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKOpenPanelParameters, WKUIDelegate, WKWebView,
};

use crate::state::{
    LEGACY_RESULT, LEGACY_UPLOAD, close_tab, go_back, go_forward, navigate_active_input,
    open_bookmark, reload_tab, result_file, switch_tab, tab_index_for_webview,
    update_tab_after_navigation_event, upload_file,
};

fn catch_objc(f: impl FnOnce()) -> Result<(), String> {
    // SAFETY: `objc2::exception::catch` is the intended wrapper around Objective-C message sends in these delegate constructors.
    let result = unsafe { objc2::exception::catch(AssertUnwindSafe(f)) }; // SAFETY: see comment above.
    result.map_err(|e| format!("ObjC exception: {e:?}"))
}

define_class!(
    #[unsafe(super(NSObject))] // SAFETY: see comment above.
    // SAFETY: `PilotUIDelegate` subclasses `NSObject`, which matches the Objective-C runtime contract for this class.
    #[thread_kind = MainThreadOnly]
    #[name = "PilotUIDelegate"]
    #[ivars = ()]
    pub(crate) struct PilotUIDelegate;
    unsafe impl NSObjectProtocol for PilotUIDelegate {} // SAFETY: this class is an `NSObject` subclass and upholds the `NSObjectProtocol` requirements on the main thread.
    unsafe impl WKUIDelegate for PilotUIDelegate { // SAFETY: see comment above.
        // SAFETY: the class is registered with the Objective-C runtime with the selectors WKWebView expects for `WKUIDelegate`.
        /// Handle target="_blank" links — open in new dynamic tab
        #[unsafe(method(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))] // SAFETY: this selector signature matches WebKit's documented `WKUIDelegate` entry point.
        unsafe fn webView_createWebViewWithConfiguration_forNavigationAction_windowFeatures( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            _wv: &WKWebView,
            _config: &objc2_web_kit::WKWebViewConfiguration,
            action: &WKNavigationAction,
            _features: &objc2::runtime::AnyObject,
        ) -> *mut WKWebView {
            // Open target="_blank" in a new tab
            if let Some(url) = action.request().URL()
                && let Some(url_str) = url.absoluteString()
            {
                let url_string = url_str.to_string();
                let _ = crate::state::create_dynamic_tab(Some(&url_string), true);
            }
            std::ptr::null_mut()
        }

        #[unsafe(method(webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:))] // SAFETY: this selector signature matches WebKit's documented file-picker delegate callback.
        unsafe fn webView_runOpenPanelWithParameters_initiatedByFrame_completionHandler( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            wv: &WKWebView,
            _p: &WKOpenPanelParameters,
            _f: &WKFrameInfo,
            ch: &block2::DynBlock<dyn Fn(*mut NSArray<NSURL>)>,
        ) {
            let tab = tab_index_for_webview(wv);

            if let Some(tab_idx) = tab {
                let up_path = upload_file(tab_idx);
                if let Ok(path) = std::fs::read_to_string(&up_path) {
                    let path = path.trim().to_owned();
                    let _ = std::fs::remove_file(&up_path);
                    let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
                    let array = NSArray::from_retained_slice(&[url]);
                    ch.call((&*array as *const _ as *mut _,));
                    let _ = std::fs::write(result_file(tab_idx), format!("ok: uploaded {path}"));
                    return;
                }
            }

            if let Ok(path) = std::fs::read_to_string(LEGACY_UPLOAD) {
                let path = path.trim().to_owned();
                let _ = std::fs::remove_file(LEGACY_UPLOAD);
                let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
                let array = NSArray::from_retained_slice(&[url]);
                ch.call((&*array as *const _ as *mut _,));
                let _ = std::fs::write(LEGACY_RESULT, format!("ok: uploaded {path}"));
                return;
            }

            ch.call((std::ptr::null_mut(),));
        }
    }
);

impl PilotUIDelegate {
    pub(crate) fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = mtm.alloc::<Self>().set_ivars(());
        let mut ret = None;
        if let Err(e) = catch_objc(|| {
            // SAFETY: `this` is a freshly allocated Objective-C object whose superclass initializer is `init`.
            ret = Some(unsafe { msg_send![super(this), init] }); // SAFETY: see comment above.
        }) {
            crate::state::log_crash("ERROR", "PilotUIDelegate::new", &e);
            std::process::abort();
        }
        let Some(ret) = ret else {
            crate::state::log_crash("ERROR", "PilotUIDelegate::new", "init returned no object");
            std::process::abort();
        };
        ret
    }
}

define_class!(
    #[unsafe(super(NSObject))] // SAFETY: see comment above.
    // SAFETY: `PilotNavDelegate` subclasses `NSObject`, which matches the Objective-C runtime contract for this class.
    #[thread_kind = MainThreadOnly]
    #[name = "PilotNavDelegate"]
    #[ivars = ()]
    pub(crate) struct PilotNavDelegate;
    unsafe impl NSObjectProtocol for PilotNavDelegate {} // SAFETY: this class is an `NSObject` subclass and upholds the `NSObjectProtocol` requirements on the main thread.
    unsafe impl WKNavigationDelegate for PilotNavDelegate { // SAFETY: see comment above.
        // SAFETY: the class is registered with the Objective-C runtime with the selectors WKWebView expects for `WKNavigationDelegate`.
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))] // SAFETY: this selector signature matches WebKit's documented policy-decision delegate callback.
        unsafe fn webView_decidePolicyForNavigationAction_decisionHandler( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            _wv: &WKWebView,
            _action: &WKNavigationAction,
            handler: &block2::DynBlock<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            handler.call((WKNavigationActionPolicy::Allow,));
        }

        #[unsafe(method(webView:didStartProvisionalNavigation:))] // SAFETY: this selector signature matches WebKit's provisional-navigation callback.
        unsafe fn webView_didStartProvisionalNavigation( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            wv: &WKWebView,
            _nav: Option<&WKNavigation>,
        ) {
            if let Some(tab_id) = tab_index_for_webview(wv) {
                crate::state::set_tab_loading_state(tab_id, true);
            }
        }

        #[unsafe(method(webView:didCommitNavigation:))] // SAFETY: this selector signature matches WebKit's commit-navigation callback.
        unsafe fn webView_didCommitNavigation(&self, wv: &WKWebView, _nav: Option<&WKNavigation>) { // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            if let Some(tab_id) = tab_index_for_webview(wv) {
                update_tab_after_navigation_event(tab_id);
            }
        }

        #[unsafe(method(webView:didFinishNavigation:))] // SAFETY: this selector signature matches WebKit's finish-navigation callback.
        unsafe fn webView_didFinishNavigation(&self, wv: &WKWebView, _nav: Option<&WKNavigation>) { // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            if let Some(tab_id) = tab_index_for_webview(wv) {
                crate::state::set_tab_loading_state(tab_id, false);
                update_tab_after_navigation_event(tab_id);
            }
        }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))] // SAFETY: this selector signature matches WebKit's provisional-failure callback.
        unsafe fn webView_didFailProvisionalNavigation_withError( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            wv: &WKWebView,
            _nav: Option<&WKNavigation>,
            error: &NSError,
        ) {
            if let Some(tab_id) = tab_index_for_webview(wv) {
                crate::state::set_tab_loading_state(tab_id, false);
                update_tab_after_navigation_event(tab_id);
                crate::state::log_crash(
                    "WARN",
                    "navigation",
                    &format!("tab {tab_id} provisional failure: {:?}", error),
                );
            }
        }

        #[unsafe(method(webView:didFailNavigation:withError:))] // SAFETY: this selector signature matches WebKit's navigation-failure callback.
        unsafe fn webView_didFailNavigation_withError( // SAFETY: see comment above.
            // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            wv: &WKWebView,
            _nav: Option<&WKNavigation>,
            error: &NSError,
        ) {
            if let Some(tab_id) = tab_index_for_webview(wv) {
                crate::state::set_tab_loading_state(tab_id, false);
                update_tab_after_navigation_event(tab_id);
                crate::state::log_crash(
                    "WARN",
                    "navigation",
                    &format!("tab {tab_id} failure: {:?}", error),
                );
            }
        }
    }
);

impl PilotNavDelegate {
    pub(crate) fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = mtm.alloc::<Self>().set_ivars(());
        let mut ret = None;
        if let Err(e) = catch_objc(|| {
            // SAFETY: `this` is a freshly allocated Objective-C object whose superclass initializer is `init`.
            ret = Some(unsafe { msg_send![super(this), init] }); // SAFETY: see comment above.
        }) {
            crate::state::log_crash("ERROR", "PilotNavDelegate::new", &e);
            std::process::abort();
        }
        let Some(ret) = ret else {
            crate::state::log_crash("ERROR", "PilotNavDelegate::new", "init returned no object");
            std::process::abort();
        };
        ret
    }
}

define_class!(
    #[unsafe(super(NSObject))] // SAFETY: `BrowserActionTarget` subclasses `NSObject`, which matches the Objective-C runtime contract for this class.
    #[thread_kind = MainThreadOnly]
    #[name = "BrowserActionTarget"]
    #[ivars = ()]
    pub(crate) struct BrowserActionTarget;
    unsafe impl NSObjectProtocol for BrowserActionTarget {} // SAFETY: this class is an `NSObject` subclass and upholds the `NSObjectProtocol` requirements on the main thread.
    unsafe impl NSTextFieldDelegate for BrowserActionTarget {} // SAFETY: the class is registered as the NSTextField delegate and only receives AppKit callbacks on the main thread.
    unsafe impl NSControlTextEditingDelegate for BrowserActionTarget { // SAFETY: the class implements the editing delegate selector with the exact Objective-C signature AppKit expects.
        #[unsafe(method(control:textView:doCommandBySelector:))] // SAFETY: this selector signature matches AppKit's documented text-command delegate callback.
        unsafe fn control_textView_doCommandBySelector( // SAFETY: Objective-C calls this with the registered selector/signature on the main thread.
            &self,
            _control: &NSControl,
            text_view: &NSTextView,
            command_selector: objc2::runtime::Sel,
        ) -> bool {
            if command_selector == objc2::sel!(insertNewline:) {
                let input = text_view.string().to_string();
                if let Err(err) = navigate_active_input(&input) {
                    crate::state::log_crash("WARN", "address_bar", &err);
                }
                return true.into();
            }
            false
        }
    }
    impl BrowserActionTarget {
        #[unsafe(method(sidebarTabClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from bookmark buttons.
        fn sidebar_tab_clicked(&self, sender: &NSButton) {
            open_bookmark(sender.tag() as usize);
        }

        #[unsafe(method(runtimeTabClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from runtime tab buttons.
        fn runtime_tab_clicked(&self, sender: &NSButton) {
            switch_tab(sender.tag() as usize);
        }

        #[unsafe(method(closeTabClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from close-tab buttons.
        fn close_tab_clicked(&self, sender: &NSButton) {
            if let Err(err) = close_tab(sender.tag() as usize) {
                crate::state::log_crash("WARN", "close_tab", &err);
            }
        }

        #[unsafe(method(newTabClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from the new-tab button.
        fn new_tab_clicked(&self, _sender: &NSButton) {
            if let Err(err) = crate::state::create_dynamic_tab(Some("about:blank"), true) {
                crate::state::log_crash("WARN", "new_tab", &err);
            }
        }

        #[unsafe(method(toolbarBackClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from the toolbar back button.
        fn toolbar_back_clicked(&self, _sender: &NSButton) {
            if let Err(err) = go_back(None) {
                crate::state::log_crash("WARN", "toolbar_back", &err);
            }
        }

        #[unsafe(method(toolbarForwardClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from the toolbar forward button.
        fn toolbar_forward_clicked(&self, _sender: &NSButton) {
            if let Err(err) = go_forward(None) {
                crate::state::log_crash("WARN", "toolbar_forward", &err);
            }
        }

        #[unsafe(method(toolbarReloadClicked:))] // SAFETY: this selector is registered for AppKit target-action dispatch from the toolbar reload button.
        fn toolbar_reload_clicked(&self, _sender: &NSButton) {
            if let Err(err) = reload_tab(None) {
                crate::state::log_crash("WARN", "toolbar_reload", &err);
            }
        }

        #[unsafe(method(addressBarSubmitted:))] // SAFETY: this selector is registered for AppKit target-action dispatch from the address field.
        fn address_bar_submitted(&self, sender: &NSControl) {
            let input = sender.stringValue().to_string();
            if let Err(err) = navigate_active_input(&input) {
                crate::state::log_crash("WARN", "address_bar", &err);
            }
        }

        #[unsafe(method(controlTextDidEndEditing:))] // SAFETY: this selector matches AppKit's optional end-editing notification callback.
        fn control_text_did_end_editing(&self, _notification: &NSNotification) {}
    }
);

impl BrowserActionTarget {
    pub(crate) fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = mtm.alloc::<Self>().set_ivars(());
        let mut ret = None;
        if let Err(e) = catch_objc(|| {
            // SAFETY: `this` is a freshly allocated Objective-C object whose superclass initializer is `init`.
            ret = Some(unsafe { msg_send![super(this), init] }); // SAFETY: see comment above.
        }) {
            crate::state::log_crash("ERROR", "BrowserActionTarget::new", &e);
            std::process::abort();
        }
        let Some(ret) = ret else {
            crate::state::log_crash(
                "ERROR",
                "BrowserActionTarget::new",
                "init returned no object",
            );
            std::process::abort();
        };
        ret
    }
}
