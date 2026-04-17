// nf-core-app — engine heart. Entry module for play / edit / record.
//
// Contract (ADR-025, Axiom 3 + 4):
//   - `getStateAt(t, resolved)` is the sole pure-function source of truth.
//   - `start({mode, resolved, root})` wires play (RAF) / edit (frozen) /
//     record (external tick). ONE WebView, three modes.
//   - record mode exposes `window.__nfTick(t)` for Rust-driven frame steps.

import { deriveState } from "./state.js";
import { renderTracks, registerTracksFromGlobal } from "./track-host.js";

// getStateAt — the pure function. Given (t, resolved) → full state envelope.
// Same inputs → same outputs. No side effects. No clock peeking.
export function getStateAt(t, resolved) {
  return deriveState(t, resolved);
}

// Resolve a mount element. Accepts Element | string id | null (default #nf-root).
function resolveMount(root, doc) {
  if (root && typeof root === "object" && root.appendChild) return root;
  const id = typeof root === "string" ? root : "nf-root";
  return doc.getElementById ? doc.getElementById(id) : null;
}

// Step: pure-ish — render state at t onto mount. No side effects beyond DOM.
function step(ctx, t) {
  const state = getStateAt(t, ctx.resolved);
  const result = renderTracks(state, ctx.mount);
  ctx.lastT = t;
  ctx.lastSnapshot = result.snapshot;
  ctx.lastAudio = result.audio;
  return state;
}

// Double-RAF + microtask "frame committed" promise. In record mode this
// is how Rust knows the paint pass finished before snapshotting pixels.
function nextFrameCommitted(win) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const raf = win && typeof win.requestAnimationFrame === "function"
      ? win.requestAnimationFrame.bind(win)
      : (cb) => setTimeout(() => cb(0), 16);
    raf(() => raf(() => {
      // Queue microtask so any style/layout writes in the 2nd RAF flush.
      Promise.resolve().then(finish);
    }));
    setTimeout(finish, 32);
  });
}

// start({mode, resolved, root, win?}) — returns an app handle.
//
// Modes:
//   play   → RAF loop using (timestamp - startTs) / 1000 as t (seconds).
//   edit   → seeks on demand. t starts at 0, frozen.
//   record → Rust drives `__nfTick(t)` externally. No internal RAF.
export function start(opts = {}) {
  const mode = opts.mode || "play";
  const resolved = opts.resolved || { viewport: { w: 1920, h: 1080, ratio: "16:9" }, tracks: [] };
  const win = opts.win || globalThis;
  const doc = win && win.document ? win.document : null;
  if (!doc) throw new Error("nf-core-app.start: no document available");
  const mount = resolveMount(opts.root, doc);
  if (!mount) throw new Error("nf-core-app.start: mount element not found");
  // Clean slate: purge any stale content from previous sessions.
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  // Wire up tracks from bundler's global map. We DO NOT clear the registry
  // because callers (tests / user code) may have registered tracks already
  // before calling start(). Only bundler-injected tracks are auto-registered.
  registerTracksFromGlobal(win);
  const ctx = {
    mode,
    resolved,
    mount,
    win,
    lastT: 0,
    lastSnapshot: [],
    lastAudio: [],
    rafId: null,
    running: false,
    startTs: 0,
  };

  const seek = (t) => step(ctx, Number(t) || 0);
  const pause = () => {
    ctx.running = false;
    if (ctx.rafId !== null && win.cancelAnimationFrame) {
      win.cancelAnimationFrame(ctx.rafId);
    }
    ctx.rafId = null;
  };
  const resume = () => {
    if (ctx.mode !== "play") return;
    if (ctx.running) return;
    ctx.running = true;
    ctx.startTs = 0;
    const loop = (ts) => {
      if (!ctx.running) return;
      if (!ctx.startTs) ctx.startTs = ts;
      const t = (ts - ctx.startTs) / 1000;
      step(ctx, t);
      ctx.rafId = win.requestAnimationFrame(loop);
    };
    if (typeof win.requestAnimationFrame === "function") {
      ctx.rafId = win.requestAnimationFrame(loop);
    }
  };

  // Initial paint at t=0 for all modes — gives editor & recorder a valid
  // frame before any seek / tick call.
  step(ctx, 0);

  if (mode === "play") {
    resume();
  } else if (mode === "record") {
    // Rust drives frames via __nfTick.
    win.__nfTick = async (seqOrT, maybeT) => {
      const t = Number(maybeT === undefined ? seqOrT : maybeT) || 0;
      step(ctx, t);
      await nextFrameCommitted(win);
      return { t: ctx.lastT, audio: ctx.lastAudio };
    };
  }

  const app = {
    getStateAt: (t) => getStateAt(t, ctx.resolved),
    seek,
    pause,
    resume,
    get currentMode() { return ctx.mode; },
    get currentT() { return ctx.lastT; },
    get snapshot() { return ctx.lastSnapshot; },
    get audio() { return ctx.lastAudio; },
  };
  win.__nfApp = app;
  return app;
}

// Re-export state helpers so consumers can `import { ... } from 'nf-core-app'`.
export { deriveState, interpolateKeyframes, activeTracksAt, currentValues } from "./state.js";
export { renderTracks, registerTrack, registerTracksFromGlobal, clearTrackRegistry, getTrackRegistry } from "./track-host.js";
