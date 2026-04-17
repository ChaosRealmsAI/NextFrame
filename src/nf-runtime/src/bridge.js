// Bridge — thin wrapper around WKScriptMessageHandlerWithReply.
//
// Native side registers a message handler named `nfBridge` or `__nfBridge`
// on the WKWebView's content controller. The browser side calls
// `window.webkit.messageHandlers.<bridge>.postMessage(...)`.
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
  const handlerNames = normalizeHandlerNames(options.handlerName);
  const timeoutMs = options.timeoutMs ?? REPLY_TIMEOUT_MS;

  const listeners = new Set();
  const pending = new Map();
  let nextId = 1;

  const getNativeHandler = () => {
    const webkit = globalThis.webkit;
    if (!webkit) return null;
    const handlers = webkit.messageHandlers;
    if (!handlers) return null;
    for (const handlerName of handlerNames) {
      const handler = handlers[handlerName];
      if (handler && typeof handler.postMessage === "function") return handler;
    }
    return null;
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
    const payload = normalizeOutgoingMessage({ ...message, id, payload: message.payload ?? null });
    let result;
    try {
      result = handler.postMessage(JSON.stringify(payload));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    if (result && typeof result.then === "function") {
      return result.then(parseReplyValue);
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

function normalizeHandlerNames(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string" && input.length > 0) return [input];
  return ["__nfBridge", "nfBridge"];
}

function normalizeOutgoingMessage(message) {
  const payload = { ...message };
  if (!Object.prototype.hasOwnProperty.call(payload, "payload")) {
    payload.payload = null;
  }
  return payload;
}

function parseReplyValue(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
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
