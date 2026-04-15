//! JS↔Rust IPC via WKScriptMessageHandler.
//!
//! JS calls `bridgeCall(method, params)` which posts a JSON message to the
//! "nfBridge" handler. Rust parses it, dispatches to nf_bridge::dispatch,
//! and sends the response back via evaluateJavaScript.

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DeclaredClass, MainThreadMarker, MainThreadOnly};
use objc2_foundation::{NSObjectProtocol, NSString};
use objc2_web_kit::{
    WKScriptMessage, WKScriptMessageHandler, WKUserContentController, WKUserScript,
    WKUserScriptInjectionTime, WKWebView, WKWebViewConfiguration,
};

pub const IPC_HANDLER_NAME: &str = "nfBridge";

/// JS injected at document start to provide `bridgeCall(method, params)`.
const IPC_BRIDGE_SCRIPT: &str = r#"
(() => {
  window.__ipc = window.__ipc || {};
  let seq = 0;

  window.bridgeCall = function(method, params) {
    return new Promise((resolve, reject) => {
      const id = 'ipc-' + Date.now() + '-' + (++seq);
      window.__ipc[id] = { resolve, reject };

      const msg = JSON.stringify({ id, method, params: params || {} });
      window.webkit.messageHandlers.nfBridge.postMessage(msg);
    });
  };

  window.__ipcResolve = function(responseJson) {
    try {
      const resp = JSON.parse(responseJson);
      const pending = window.__ipc[resp.id];
      if (!pending) return;
      delete window.__ipc[resp.id];
      if (resp.ok) {
        pending.resolve({ ok: true, value: resp.result });
      } else {
        pending.resolve({
          ok: false,
          error: {
            code: 'IPC_ERROR',
            message: resp.error || 'unknown error',
          },
        });
      }
    } catch (e) {
      console.error('[ipc] resolve error:', e);
    }
  };
})();
"#;

pub struct BridgeHandlerIvars {
    webview: std::cell::Cell<*const WKWebView>,
}

define_class!(
    #[unsafe(super(NSObject))] // SAFETY: `BridgeHandler` is declared as an NSObject subclass for objc2 class registration.
    #[thread_kind = MainThreadOnly]
    #[ivars = BridgeHandlerIvars]
    pub struct BridgeHandler;

    unsafe impl NSObjectProtocol for BridgeHandler {} // SAFETY: BridgeHandler is an NSObject subclass that satisfies NSObjectProtocol expectations.

    unsafe impl WKScriptMessageHandler for BridgeHandler { // SAFETY: BridgeHandler is registered with WebKit as a main-thread script message handler.
        #[unsafe(method(userContentController:didReceiveScriptMessage:))] // SAFETY: Selector matches WKScriptMessageHandler's Objective-C callback signature.
        fn did_receive(
            this: &BridgeHandler,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
        ) {
            let body = unsafe { message.body() }; // SAFETY: message.body() returns a live NSString from WebKit.
            let Ok(body_str) = body.downcast::<NSString>() else {
                return;
            };
            let json_str = body_str.to_string();

            // Parse request
            let req: nf_bridge::Request = match serde_json::from_str(&json_str) {
                Ok(r) => r,
                Err(e) => {
                    tracing::error!("[ipc] parse error: {e}");
                    return;
                }
            };

            let req_id = req.id.clone();
            let method = req.method.clone();

            // Dispatch to nf-bridge
            let response = nf_bridge::dispatch(req);

            // Serialize response
            let resp_json = match serde_json::to_string(&response) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!("[ipc] serialize error: {e}");
                    return;
                }
            };

            tracing::info!("[ipc] {} → ok={}", method, response.ok);

            // Send response back to JS via evaluateJavaScript
            let wv_ptr = this.ivars().webview.get();
            let Some(wv) = (unsafe { wv_ptr.as_ref() }) else { // SAFETY: wv_ptr is stored from a live WKWebView and only read while the handler is retained.
                return;
            };

            // Escape for JS string literal
            let escaped = resp_json
                .replace('\\', "\\\\")
                .replace('\'', "\\'")
                .replace('\n', "\\n")
                .replace('\r', "\\r");

            let js = format!("window.__ipcResolve('{escaped}')");
            let ns_js = NSString::from_str(&js);

            unsafe { // SAFETY: evaluateJavaScript is called on the live WKWebView from WebKit's required main thread.
                wv.evaluateJavaScript_completionHandler(&ns_js, None);
            }

            let _ = req_id; // used in log above via response.id
        }
    }
);

/// Install IPC bridge: inject JS + register message handler.
/// Returns the handler (must be kept alive).
pub fn install(
    mtm: MainThreadMarker,
    config: &WKWebViewConfiguration,
    webview_ptr: *const WKWebView,
) -> Retained<BridgeHandler> {
    let controller = unsafe { config.userContentController() }; // SAFETY: config is a live WKWebViewConfiguration on the main thread.

    // Inject bridge JS at document start
    let source = NSString::from_str(IPC_BRIDGE_SCRIPT);
    let script = unsafe { // SAFETY: source is valid NSString content and this designated initializer must run on the main thread.
        WKUserScript::initWithSource_injectionTime_forMainFrameOnly(
            WKUserScript::alloc(mtm),
            &source,
            WKUserScriptInjectionTime::AtDocumentStart,
            true,
        )
    };
    unsafe { // SAFETY: controller and script are live WebKit objects, and addUserScript only registers the injected script.
        controller.addUserScript(&script);
    }

    // Create handler
    let handler = mtm.alloc::<BridgeHandler>().set_ivars(BridgeHandlerIvars {
        webview: std::cell::Cell::new(webview_ptr),
    });
    let handler: Retained<BridgeHandler> = unsafe { msg_send![super(handler), init] }; // SAFETY: init is sent to a freshly allocated BridgeHandler before any external aliasing.

    // Register handler
    let name = NSString::from_str(IPC_HANDLER_NAME);
    unsafe { // SAFETY: handler implements WKScriptMessageHandler and controller retains it for future callbacks.
        controller.addScriptMessageHandler_name(ProtocolObject::from_ref(&*handler), &name);
    }

    tracing::info!("[ipc] bridge installed: handler={IPC_HANDLER_NAME}");
    handler
}

/// Set the webview pointer after WKWebView is created.
/// Must be called before any JS bridgeCall fires.
pub fn set_webview(handler: &BridgeHandler, wv: &WKWebView) {
    handler.ivars().webview.set(wv as *const WKWebView);
    tracing::info!("[ipc] webview pointer set");
}
