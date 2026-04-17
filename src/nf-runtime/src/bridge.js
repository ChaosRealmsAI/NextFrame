// Bridge — thin wrapper around WKScriptMessageHandlerWithReply.
//
// Native side registers a message handler named `nfBridge` on the WKWebView's
// content controller. The browser side calls
// `window.webkit.messageHandlers.nfBridge.postMessage({...})`.
// When `postMessage` is registered as `WKScriptMessageHandlerWithReply`,
// it returns a Promise. Otherwise we fall back to a callback table keyed by
// a monotonic request id.
//
// No external runtime deps. Works in three environments:
//   1. Production (WKScriptMessageHandlerWithReply)  → promise roundtrip
//   2. Legacy WKScriptMessageHandler (postMessage w/o reply) → callback table
//   3. Dev browser (no webkit at all) → resolves to {ok:false, error:'no-bridge'}

const REPLY_TIMEOUT_MS = 10_000;

export function createBridge(options = {}) {
  const handlerName = options.handlerName ?? "nfBridge";
  const timeoutMs = options.timeoutMs ?? REPLY_TIMEOUT_MS;

  const listeners = new Set();
  const pending = new Map();
  let nextId = 1;

  const getNativeHandler = () => {
    const webkit = globalThis.webkit;
    if (!webkit) return null;
    const handlers = webkit.messageHandlers;
    if (!handlers) return null;
    const h = handlers[handlerName];
    if (!h || typeof h.postMessage !== "function") return null;
    return h;
  };

  const receive = (message) => {
    if (!message || typeof message !== "object") return;
    // Native replying to a prior request with a matching id.
    if (Object.prototype.hasOwnProperty.call(message, "__replyTo")) {
      const id = message.__replyTo;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(String(message.error)));
      else entry.resolve(message.payload);
      return;
    }
    // Native pushing an event.
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (_e) {
        // Listener errors never break the bridge.
      }
    }
  };

  // Register the receive hook on window so native can call it.
  globalThis.__nfBridgeReceive = receive;

  const sendMessage = (message) => {
    if (!message || typeof message !== "object" || !message.kind) {
      return Promise.reject(new Error("bridge.sendMessage: kind required"));
    }
    const handler = getNativeHandler();
    if (!handler) {
      return Promise.resolve({ ok: false, error: "no-bridge" });
    }

    // Attempt reply-style post first. WKScriptMessageHandlerWithReply returns
    // a thenable from postMessage.
    const id = nextId++;
    const payload = { id, kind: message.kind, payload: message.payload ?? null };
    let result;
    try {
      result = handler.postMessage(payload);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    if (result && typeof result.then === "function") {
      return result;
    }

    // Fallback: register a pending callback, native is expected to push
    // {__replyTo: id, payload|error} back via __nfBridgeReceive.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          // Legacy handler without reply — return ok:true with no payload so
          // non-critical messages (like frame_ready) don't reject.
          resolve({ ok: true, legacy: true });
        }
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  };

  const onMessage = (listener) => {
    if (typeof listener !== "function") {
      throw new TypeError("bridge.onMessage: function required");
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const isAvailable = () => getNativeHandler() !== null;

  return { sendMessage, onMessage, isAvailable, receive };
}

// Module-level singleton for the common case.
let defaultBridge = null;
export function getBridge() {
  if (!defaultBridge) defaultBridge = createBridge();
  return defaultBridge;
}

export function sendMessage(message) {
  return getBridge().sendMessage(message);
}

export function onMessage(listener) {
  return getBridge().onMessage(listener);
}
