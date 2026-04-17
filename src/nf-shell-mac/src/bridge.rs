#![deny(unsafe_op_in_unsafe_fn)]

use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_foundation::{NSError, NSObjectProtocol, NSString};
use objc2_web_kit::{
    WKContentWorld, WKScriptMessage, WKScriptMessageHandlerWithReply, WKUserContentController,
    WKUserScript, WKUserScriptInjectionTime, WKWebView, WKWebViewConfiguration,
};

use crate::bindings::pump_main_run_loop;
use crate::{Bridge, BridgeMessage, BridgeReply, RuntimeMode};

const BRIDGE_NAME: &str = "nfBridge";

struct BridgeSharedState {
    ready: bool,
    current_mode: RuntimeMode,
    source_path: String,
    message_handler: Option<Box<dyn Fn(BridgeMessage) + Send>>,
}

impl BridgeSharedState {
    fn new(source_path: &Path, mode: RuntimeMode) -> Self {
        Self {
            ready: false,
            current_mode: mode,
            source_path: source_path.display().to_string(),
            message_handler: None,
        }
    }
}

struct BridgeIvars {
    shared: Arc<Mutex<BridgeSharedState>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = BridgeIvars]
    struct ScriptBridgeHandler;

    unsafe impl NSObjectProtocol for ScriptBridgeHandler {}

    unsafe impl WKScriptMessageHandlerWithReply for ScriptBridgeHandler {
        #[unsafe(method(userContentController:didReceiveScriptMessage:replyHandler:))]
        unsafe fn user_content_controller_did_receive_script_message_reply_handler(
            &self,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
            reply_handler: &block2::DynBlock<dyn Fn(*mut AnyObject, *mut NSString)>,
        ) {
            let reply = handle_incoming_message(&self.ivars().shared, message);
            let reply_text =
                NSString::from_str(&serde_json::to_string(&reply).unwrap_or_else(|_| {
                    String::from(r#"{"ok":false,"payload":{"error":"serialize-reply"}}"#)
                }));
            let reply_ptr = Retained::as_ptr(&reply_text).cast::<AnyObject>().cast_mut();
            reply_handler.call((reply_ptr, std::ptr::null_mut()));
        }
    }
);

pub struct WebViewBridge {
    web_view: Retained<WKWebView>,
    _handler: Retained<ScriptBridgeHandler>,
    shared: Arc<Mutex<BridgeSharedState>>,
}

impl WebViewBridge {
    pub fn install(
        mtm: MainThreadMarker,
        config: &WKWebViewConfiguration,
        web_view: Retained<WKWebView>,
        source_path: &Path,
        mode: RuntimeMode,
    ) -> Result<Self> {
        let controller = unsafe { config.userContentController() };
        let world = unsafe { WKContentWorld::pageWorld(mtm) };
        let user_script_source = build_bridge_script(source_path, mode)?;
        let user_script = unsafe {
            WKUserScript::initWithSource_injectionTime_forMainFrameOnly(
                WKUserScript::alloc(mtm),
                &NSString::from_str(&user_script_source),
                WKUserScriptInjectionTime::AtDocumentEnd,
                true,
            )
        };
        // SAFETY: Adding a user script before navigation is the intended API.
        unsafe {
            controller.addUserScript(&user_script);
        }

        let shared = Arc::new(Mutex::new(BridgeSharedState::new(source_path, mode)));
        let handler = mtm.alloc::<ScriptBridgeHandler>().set_ivars(BridgeIvars {
            shared: Arc::clone(&shared),
        });
        // SAFETY: `ScriptBridgeHandler` inherits `NSObject`; `init` is required.
        let handler: Retained<ScriptBridgeHandler> = unsafe { msg_send![super(handler), init] };
        let name = NSString::from_str(BRIDGE_NAME);
        // SAFETY: Handler, world, and name stay alive for the life of the web view.
        unsafe {
            controller.addScriptMessageHandlerWithReply_contentWorld_name(
                ProtocolObject::from_ref(&*handler),
                &world,
                &name,
            );
        }

        Ok(Self {
            web_view,
            _handler: handler,
            shared,
        })
    }

    pub fn web_view(&self) -> &WKWebView {
        &self.web_view
    }

    pub fn is_ready(&self) -> bool {
        self.shared.lock().map(|state| state.ready).unwrap_or(false)
    }

    pub fn set_mode(&self, mode: RuntimeMode) -> Result<()> {
        if let Ok(mut shared) = self.shared.lock() {
            shared.current_mode = mode;
        }
        let _ = self.send(BridgeMessage {
            kind: String::from("setMode"),
            payload: serde_json::json!({ "mode": mode }),
        })?;
        Ok(())
    }

    pub fn eval_script_json(&self, script: &str) -> Result<serde_json::Value> {
        let wrapped = wrap_eval_script(script)?;
        let text = self.evaluate_string(&wrapped)?;
        serde_json::from_str(&text).with_context(|| "parse JSON from evaluated script")
    }

    pub fn sync_diagnose(&self) -> Result<serde_json::Value> {
        Ok(self
            .send(BridgeMessage {
                kind: String::from("diagnose"),
                payload: serde_json::json!({}),
            })?
            .payload)
    }

    fn evaluate_string(&self, script: &str) -> Result<String> {
        let script = NSString::from_str(script);
        let done = Rc::new(Cell::new(false));
        let value = Rc::new(RefCell::new(None::<String>));
        let error_text = Rc::new(RefCell::new(None::<String>));
        let done_ref = Rc::clone(&done);
        let value_ref = Rc::clone(&value);
        let error_ref = Rc::clone(&error_text);
        let completion =
            block2::RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                if let Some(error) = unsafe { error.as_ref() } {
                    *error_ref.borrow_mut() = Some(error.localizedDescription().to_string());
                } else if let Some(result) = unsafe { result.as_ref() } {
                    if let Some(text) = result.downcast_ref::<NSString>() {
                        *value_ref.borrow_mut() = Some(text.to_string());
                    } else {
                        *value_ref.borrow_mut() = Some(String::from("null"));
                    }
                } else {
                    *value_ref.borrow_mut() = Some(String::from("null"));
                }
                done_ref.set(true);
            });

        // SAFETY: Script and completion block remain alive until the completion runs.
        unsafe {
            self.web_view
                .evaluateJavaScript_completionHandler(&script, Some(&completion));
        }

        let deadline = Instant::now() + Duration::from_secs(5);
        while !done.get() && Instant::now() < deadline {
            pump_main_run_loop(Duration::from_millis(4));
        }

        if let Some(error) = error_text.borrow_mut().take() {
            bail!("evaluateJavaScript failed: {error}");
        }
        if !done.get() {
            bail!("timed out waiting for evaluateJavaScript");
        }

        let output = value
            .borrow_mut()
            .take()
            .unwrap_or_else(|| String::from("null"));
        Ok(output)
    }
}

impl Bridge for WebViewBridge {
    fn send(&self, msg: BridgeMessage) -> Result<BridgeReply> {
        let payload = serde_json::to_string(&msg).context("serialize bridge message")?;
        let script = format!(
            "(() => {{ \
                if (typeof window.__nfHandleNativeMessage !== 'function') {{ \
                    return JSON.stringify({{\"ok\":false,\"payload\":{{\"error\":\"no-native-handler\"}}}}); \
                }} \
                const reply = window.__nfHandleNativeMessage({payload}); \
                return JSON.stringify(reply ?? {{\"ok\":true,\"payload\":null}}); \
            }})()"
        );
        let text = self.evaluate_string(&script)?;
        serde_json::from_str(&text).context("parse bridge reply")
    }

    fn on_message(&self, handler: Box<dyn Fn(BridgeMessage) + Send>) {
        if let Ok(mut shared) = self.shared.lock() {
            shared.message_handler = Some(handler);
        }
    }
}

fn handle_incoming_message(
    shared: &Arc<Mutex<BridgeSharedState>>,
    message: &WKScriptMessage,
) -> BridgeReply {
    let Some(body) = body_as_string(message) else {
        return BridgeReply {
            ok: false,
            payload: serde_json::json!({ "error": "bridge-body-not-string" }),
        };
    };

    let parsed = serde_json::from_str::<BridgeMessage>(&body);
    let Ok(msg) = parsed else {
        return BridgeReply {
            ok: false,
            payload: serde_json::json!({ "error": "bridge-body-invalid-json" }),
        };
    };

    if let Ok(mut state) = shared.lock() {
        if msg.kind == "domReady" {
            state.ready = true;
        }
        if let Some(handler) = &state.message_handler {
            handler(msg.clone());
        }
        BridgeReply {
            ok: true,
            payload: serde_json::json!({
                "mode": state.current_mode,
                "sourcePath": state.source_path,
                "echo": msg.kind,
            }),
        }
    } else {
        BridgeReply {
            ok: false,
            payload: serde_json::json!({ "error": "bridge-lock-failed" }),
        }
    }
}

fn body_as_string(message: &WKScriptMessage) -> Option<String> {
    let body = unsafe { message.body() };
    body.downcast_ref::<NSString>().map(NSString::to_string)
}

fn build_bridge_script(source_path: &Path, mode: RuntimeMode) -> Result<String> {
    let source_path = serde_json::to_string(&source_path.display().to_string())?;
    let mode = serde_json::to_string(&mode)?;
    Ok(format!(
        r##"
(() => {{
  const BRIDGE = "{bridge_name}";
  const SOURCE_PATH = {source_path};
  const INITIAL_MODE = {mode};
  const state = window.__nfShellState || (window.__nfShellState = {{
    mode: INITIAL_MODE,
    sourcePath: SOURCE_PATH
  }});

  function post(kind, payload = {{}}) {{
    const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[BRIDGE];
    if (!handler || typeof handler.postMessage !== "function") {{
      return Promise.resolve({{ ok: false, payload: {{ error: "no-bridge" }} }});
    }}
    const raw = handler.postMessage(JSON.stringify({{ kind, payload }}));
    if (raw && typeof raw.then === "function") {{
      return raw.then((reply) => typeof reply === "string" ? JSON.parse(reply) : reply);
    }}
    return Promise.resolve({{ ok: true, payload: {{ legacy: true }} }});
  }}

  function renderResolved() {{
    const resolved = window.__nfResolved || {{ viewport: {{ w: 1920, h: 1080 }}, tracks: [] }};
    document.documentElement.style.margin = "0";
    document.documentElement.style.width = "100%";
    document.documentElement.style.height = "100%";
    document.documentElement.style.background = "#090b0e";
    document.body.style.margin = "0";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.background = "#090b0e";
    document.body.style.overflow = "hidden";
    document.body.style.fontFamily = "-apple-system, BlinkMacSystemFont, sans-serif";

    let root = document.getElementById("nf-root");
    if (!root) {{
      root = document.createElement("div");
      root.id = "nf-root";
      document.body.appendChild(root);
    }}

    root.innerHTML = "";
    root.style.position = "relative";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.background = "linear-gradient(180deg, #0a0c11 0%, #050607 100%)";

    const stage = document.createElement("div");
    stage.dataset.nfStage = "true";
    stage.style.position = "relative";
    stage.style.width = "100%";
    stage.style.height = "100%";
    stage.style.maxWidth = "100%";
    stage.style.maxHeight = "100%";
    stage.style.background = "radial-gradient(circle at top, rgba(68, 108, 192, 0.18), transparent 40%), #06080b";
    root.appendChild(stage);

    for (const track of resolved.tracks || []) {{
      if (track.kind !== "text") continue;
      for (const keyframe of track.keyframes || []) {{
        const el = document.createElement("div");
        el.textContent = keyframe.content || "";
        el.style.position = "absolute";
        el.style.left = `${{(Number(keyframe.x) || 0.5) * 100}}%`;
        el.style.top = `${{(Number(keyframe.y) || 0.5) * 100}}%`;
        el.style.transform = "translate(-50%, -50%)";
        el.style.color = keyframe.color || "#ff6b57";
        el.style.fontSize = `${{Number(keyframe.fontSize) || 64}}px`;
        el.style.fontWeight = "700";
        el.style.letterSpacing = "-0.03em";
        el.style.textShadow = "0 10px 30px rgba(0, 0, 0, 0.45)";
        stage.appendChild(el);
      }}
    }}
  }}

  window.__nfApp = {{
    currentMode() {{
      return state.mode;
    }},
    bridge(message) {{
      return post(message.kind, message.payload || {{}});
    }},
    reload() {{
      renderResolved();
      return window.__nfDiagnose();
    }}
  }};

  window.__nfHandleNativeMessage = (message) => {{
    switch (message.kind) {{
      case "setMode":
        state.mode = message.payload && message.payload.mode ? message.payload.mode : state.mode;
        return {{ ok: true, payload: {{ mode: state.mode }} }};
      case "reload":
        renderResolved();
        return {{ ok: true, payload: window.__nfDiagnose() }};
      case "diagnose":
        return {{ ok: true, payload: window.__nfDiagnose() }};
      case "ping":
        return {{ ok: true, payload: {{ pong: true }} }};
      default:
        return {{ ok: true, payload: {{ echo: message.kind }} }};
    }}
  }};

  window.__nfDiagnose = () => {{
    const stage = document.querySelector("[data-nf-stage='true']");
    const rect = stage ? stage.getBoundingClientRect() : null;
    return {{
      mode: state.mode,
      sourcePath: state.sourcePath,
      readyState: document.readyState,
      trackCount: Array.isArray(window.__nfResolved && window.__nfResolved.tracks) ? window.__nfResolved.tracks.length : 0,
      stage: rect ? {{ width: rect.width, height: rect.height }} : null
    }};
  }};

  const boot = () => {{
    renderResolved();
    post("domReady", window.__nfDiagnose()).catch(() => null);
  }};

  if (document.readyState === "loading") {{
    document.addEventListener("DOMContentLoaded", boot, {{ once: true }});
  }} else {{
    boot();
  }}
}})();
"##,
        bridge_name = BRIDGE_NAME,
    ))
}

fn wrap_eval_script(user_script: &str) -> Result<String> {
    let body = if user_script.contains("return") || user_script.contains(';') {
        user_script.to_string()
    } else {
        format!("return ({user_script});")
    };
    Ok(format!(
        "(() => {{ const __nfValue = (() => {{ {body} }})(); return JSON.stringify(__nfValue ?? null); }})()"
    ))
}
