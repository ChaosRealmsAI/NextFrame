// Record mode — externally driven by Rust.
//
// No internal RAF loop. No performance.now() / Date.now() timing.
// Rust calls `window.__nfTick(t)` for each frame. The returned promise
// resolves after a double-RAF barrier, mirroring the P-E1 POC timing
// discipline: first RAF lets style/layout commit, second RAF ensures the
// CATransaction from the previous frame flushes before the frame is
// considered "ready".
//
// On resolve, we post `{kind:'frame_ready', payload:{t}}` to the bridge so
// the Rust-side recorder knows when to pull the IOSurface.

const FRAME_READY_KIND = "frame_ready";

export function createRecord({ host, bridge, options = {} }) {
  const rafFn = options.raf || globalThis.requestAnimationFrame;
  if (typeof rafFn !== "function") {
    throw new Error("record mode: requestAnimationFrame not available");
  }

  let frameCount = 0;
  let lastTickT = 0;

  const doubleRaf = () =>
    new Promise((resolve) => {
      rafFn(() => {
        rafFn(() => resolve());
      });
    });

  const tick = async (t) => {
    lastTickT = Number(t) || 0;
    host.setT(lastTickT);
    host.render();
    await doubleRaf();
    frameCount++;
    const framePayload = { t: lastTickT, frame: frameCount };
    if (bridge) {
      try {
        await bridge.sendMessage({ kind: FRAME_READY_KIND, payload: framePayload });
      } catch (_err) {
        // frame_ready failure must not crash the tick — the recorder may
        // resend or probe via another channel.
      }
    }
    return framePayload;
  };

  // Install the external entry point. Rust calls this via evaluateJavaScript
  // (macOS: WKWebView.evaluateJavaScript("window.__nfTick(<t>)"); Linux: the
  // equivalent WebKitGTK call).
  const previousTick = globalThis.__nfTick;
  globalThis.__nfTick = tick;

  const dispose = () => {
    if (globalThis.__nfTick === tick) {
      globalThis.__nfTick = previousTick;
    }
  };

  return {
    mode: "record",
    tick,
    dispose,
    getT: () => host.getT(),
    diagnose: () => ({ mode: "record", frames: frameCount, lastT: lastTickT, ...host.diagnose() }),
  };
}

// Back-compat shim for walking-stub callers.
export function startRecord(arg) {
  if (arg && arg.host) return createRecord(arg);
  return {
    mode: "record",
    tick() {
      const t = globalThis.__nfTick ?? 0;
      return { t: typeof t === "function" ? 0 : t };
    },
  };
}
