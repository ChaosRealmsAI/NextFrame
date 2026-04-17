// WKScriptMessageHandlerWithReply wrapper. Walking stub: posts to window.webkit if present.

export function sendMessage(kind, payload) {
  const handlers = globalThis.webkit?.messageHandlers;
  if (handlers && typeof handlers.nf?.postMessage === "function") {
    return handlers.nf.postMessage({ kind, payload });
  }
  return { ok: false, error: "no native bridge available" };
}
