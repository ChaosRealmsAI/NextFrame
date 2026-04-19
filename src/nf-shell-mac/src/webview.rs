//! WKWebView host · bundle.html 加载 + `callAsyncJavaScript` + bridge handler。
//!
//! 本文件聚焦 WKWebView 构造 + define_class 的 ScriptMessageHandler / NavigationDelegate
//! 桥接类 · 纯 ObjC 侧的事件流（navigation finish / script message）通过
//! `std::sync::mpsc` 打给 Rust 侧。
//!
//! 禁 evaluateJavaScript · 只 callAsyncJavaScript（FM-ASYNC）。
//!
//! 对齐 POC-01-callasync-ipc 蓝本 · 10/10 frameReady 一致性已实测。

use std::sync::mpsc::Sender;

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_foundation::{ns_string, NSObjectProtocol};
use objc2_web_kit::{
    WKNavigation, WKNavigationDelegate, WKScriptMessage, WKScriptMessageHandler,
    WKUserContentController, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

/// bridge 名 · JS 侧 `window.webkit.messageHandlers.nfBridge` 固定。
pub const IPC_NAME: &str = "nfBridge";

/// WebView 事件 · ObjC → Rust 侧 mpsc 打通。
#[derive(Clone, Debug)]
pub enum WebViewEvent {
    /// `WKNavigationDelegate::webView:didFinishNavigation:` 触发。
    NavigationFinished,
    /// `WKScriptMessageHandler::userContentController:didReceiveScriptMessage:` 触发。
    /// body 已序列化到 `serde_json::Value`（bridge 消息 payload）。
    BridgeMessage(serde_json::Value),
}

/// Script message handler ivars · 持一个 Sender 把消息投回 Rust。
pub struct ScriptHandlerIvars {
    pub tx: Sender<WebViewEvent>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = ScriptHandlerIvars]
    pub struct ScriptHandler;

    unsafe impl NSObjectProtocol for ScriptHandler {}

    unsafe impl WKScriptMessageHandler for ScriptHandler {
        #[allow(non_snake_case)]
        #[unsafe(method(userContentController:didReceiveScriptMessage:))]
        fn userContentController_didReceiveScriptMessage(
            &self,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
        ) {
            // SAFETY: WKScriptMessage.body 返 id · 必 unsafe。main thread 持有。
            let body = unsafe { message.body() };
            let value = crate::headless::mac::objc_to_json(&body)
                .unwrap_or(serde_json::Value::Null);
            let _ = self.ivars().tx.send(WebViewEvent::BridgeMessage(value));
        }
    }
);

/// Navigation delegate ivars · 持一个 Sender 把 `didFinishNavigation` 打回 Rust。
pub struct NavigationDelegateIvars {
    pub tx: Sender<WebViewEvent>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = NavigationDelegateIvars]
    pub struct NavigationDelegate;

    unsafe impl NSObjectProtocol for NavigationDelegate {}

    unsafe impl WKNavigationDelegate for NavigationDelegate {
        #[allow(non_snake_case)]
        #[unsafe(method(webView:didFinishNavigation:))]
        fn webView_didFinishNavigation(
            &self,
            _web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
        ) {
            let _ = self.ivars().tx.send(WebViewEvent::NavigationFinished);
        }
    }
);

/// 创建 WKWebView 同时接入 script handler + navigation delegate。
///
/// 返回 (webview, script_handler, navigation_delegate) · 调用方必须持住后两者（handler 被
/// controller 弱引用 · 一 drop 就挂）。
///
/// - `frame`: WKWebView 的初始 frame（viewport 对应）
/// - `tx`: 事件回传通道 · 同一个 Sender 给 script + navigation
pub fn create_webview(
    mtm: MainThreadMarker,
    frame: objc2_foundation::NSRect,
    tx: Sender<WebViewEvent>,
) -> (
    Retained<WKWebView>,
    Retained<ScriptHandler>,
    Retained<NavigationDelegate>,
) {
    // SAFETY: 所有 ObjC 调用都在 main thread · WKWebViewConfiguration / WKWebsiteDataStore
    // 构造需 main thread · MainThreadMarker 已拿到。
    #[allow(unsafe_op_in_unsafe_fn)]
    let (config, controller) = unsafe {
        let config = WKWebViewConfiguration::new(mtm);
        let store = WKWebsiteDataStore::nonPersistentDataStore(mtm);
        config.setWebsiteDataStore(&store);
        let controller = config.userContentController();
        (config, controller)
    };

    let script_handler: Retained<ScriptHandler> = {
        let handler = mtm
            .alloc::<ScriptHandler>()
            .set_ivars(ScriptHandlerIvars { tx: tx.clone() });
        // SAFETY: define_class 产生的类必须用 msg_send![super(...), init] 初始化。
        let handler: Retained<ScriptHandler> = unsafe { msg_send![super(handler), init] };
        // SAFETY: addScriptMessageHandler_name 需 main thread · controller 弱引用 handler ·
        // 我们持住 Retained<ScriptHandler> 防早挂。
        unsafe {
            controller.addScriptMessageHandler_name(
                ProtocolObject::from_ref(&*handler),
                ns_string!(IPC_NAME),
            );
        }
        handler
    };

    let navigation_delegate: Retained<NavigationDelegate> = {
        let delegate = mtm
            .alloc::<NavigationDelegate>()
            .set_ivars(NavigationDelegateIvars { tx });
        // SAFETY: define_class 产生的类必须用 msg_send![super(...), init] 初始化。
        unsafe { msg_send![super(delegate), init] }
    };

    // SAFETY: initWithFrame_configuration 需 main thread · WKWebView::alloc 同样需 mtm。
    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), frame, &config)
    };
    web_view.setFrame(frame);
    // FM-COMPOSITOR-COMMIT-ASYNC (BUG-20260419-v1.14-compositor-commit):
    // setWantsLayer(true) 是走 CALayer-backed 同步渲染路径的前提 · 不开则
    // WKWebView 走 NSView legacy draw · CARendererSampler.sample 拿不到
    // WebContent 子进程的 layer commit · 结果相邻帧同一 IOSurface 纹理。
    // tests/carenderer_sample.rs 里有 `web_view.setWantsLayer(true)` · 生产
    // 路径之前漏了(comment 声称"create_webview 里已开"但实际代码未调) ·
    // v1.14.3 补上。
    web_view.setWantsLayer(true);
    // SAFETY: setNavigationDelegate 主线程调用 · delegate 由 Retained 保活。
    unsafe {
        web_view.setNavigationDelegate(Some(ProtocolObject::from_ref(&*navigation_delegate)));
    }

    // 防止 drop：script handler 已被 controller 弱引用 · caller 必须持住。
    // 未使用变量消噪（config / controller 已嵌入 web_view）。
    let _ = (config, controller, &script_handler);

    (web_view, script_handler, navigation_delegate)
}

/// 一次性 pump 主 run loop（默认 8ms）· 用在 blocking wait 循环里让 ObjC callback 有机会跑。
pub fn pump_main_run_loop(duration: std::time::Duration) {
    // SAFETY: NSRunLoop::currentRunLoop + runMode_beforeDate 只能主线程 · caller 保证。
    unsafe {
        let run_loop = objc2_foundation::NSRunLoop::currentRunLoop();
        let date = objc2_foundation::NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
        let _ = run_loop.runMode_beforeDate(objc2_foundation::NSDefaultRunLoopMode, &date);
    }
}
