// control-surface tests — boot() handle API (v1.2 · ADR-035)
// Zero deps: hand-rolled DOM/window/RAF stubs (no jsdom, no npm install).
//
// Why separate from getStateAt.test.js: getStateAt is pure · this file exercises
// stateful boot() (playback state, RAF loop, listeners, clamping). Different
// failure modes · isolate blast radius.
import { test } from "node:test";
import assert from "node:assert/strict";

// -----------------------------------------------------------------------------
// Minimal DOM / window / RAF shim — installed per-test via installEnv()
// -----------------------------------------------------------------------------
function installEnv({ duration_ms = 10000, tracks = [] } = {}) {
  const resolved = { duration_ms, viewport: { w: 1920, h: 1080 }, tracks };
  const makeEl = () => ({
    textContent: "",
    innerHTML: "",
    className: "",
    style: { setProperty: () => {}, left: "", width: "" },
    outerHTML: "<div></div>",
    appendChild: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400 }),
  });

  globalThis.document = {
    getElementById: (id) => {
      if (id === "nf-resolved") return { textContent: JSON.stringify(resolved) };
      if (id === "nf-tracks") return { textContent: "{}" };
      return null;
    },
    querySelector: (sel) => {
      if (sel === "#nf-stage") return makeEl();
      return null;
    },
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    activeElement: null,
  };

  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  let perfT = 0;
  globalThis.performance = {
    now: () => perfT,
    __advance: (dt) => { perfT += dt; },
    __reset: () => { perfT = 0; },
  };

  const rafCbs = [];
  globalThis.requestAnimationFrame = (cb) => {
    rafCbs.push(cb);
    return rafCbs.length;
  };
  globalThis.__flushRaf = () => {
    const cbs = rafCbs.splice(0);
    const now = globalThis.performance.now();
    cbs.forEach((cb) => cb(now));
    return cbs.length;
  };
}

function uninstallEnv() {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.performance;
  delete globalThis.requestAnimationFrame;
  delete globalThis.__flushRaf;
}

// Re-import boot() fresh each test — cheap on v8.
async function freshBoot(opts) {
  const { boot } = await import("../src/runtime.js");
  return boot(opts || { autoplay: false });
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test("seek(5000): t_ms=5000, playing=false (default pause-on-seek)", async () => {
  installEnv({ duration_ms: 10000 });
  try {
    const h = await freshBoot({ autoplay: false });
    h.seek(5000);
    const s = h.getState();
    assert.equal(s.t_ms, 5000);
    assert.equal(s.playing, false);
  } finally { uninstallEnv(); }
});

test("play() / pause() idempotent — repeated calls don't crash, listeners not multi-emit", async () => {
  installEnv({ duration_ms: 10000 });
  try {
    const h = await freshBoot({ autoplay: false });
    let emits = 0;
    h.onTimeUpdate(() => { emits++; });

    // Repeated play — second play() is a no-op (already playing).
    h.play();
    h.play();
    h.play();
    assert.equal(h.getState().playing, true);

    // Repeated pause — second pause() is a no-op.
    h.pause();
    h.pause();
    h.pause();
    assert.equal(h.getState().playing, false);

    // RAF flush after stopping — tick() short-circuits on !playing, no listener fire.
    const before = emits;
    globalThis.__flushRaf();
    assert.equal(emits, before, "paused: RAF flush must not emit timeUpdate");
  } finally { uninstallEnv(); }
});

test("setLoop(true): getState().loop === true", async () => {
  installEnv({ duration_ms: 10000 });
  try {
    const h = await freshBoot({ autoplay: false });
    assert.equal(h.getState().loop, false);
    h.setLoop(true);
    assert.equal(h.getState().loop, true);
    h.setLoop(false);
    assert.equal(h.getState().loop, false);
  } finally { uninstallEnv(); }
});

test("onTimeUpdate: subscribe → RAF → cb called; unsubscribe → no more calls", async () => {
  installEnv({ duration_ms: 10000 });
  try {
    const h = await freshBoot({ autoplay: false });
    let calls = [];
    const unsub = h.onTimeUpdate((t) => { calls.push(t); });
    assert.equal(typeof unsub, "function", "onTimeUpdate must return a function");

    // Start play → RAF scheduled → flush → tick() → emitTime → cb.
    h.play();
    globalThis.performance.__advance(100);
    globalThis.__flushRaf();
    assert.ok(calls.length >= 1, "cb must fire at least once after RAF tick");
    const before = calls.length;

    // Unsubscribe → next tick doesn't land in this cb.
    unsub();
    globalThis.performance.__advance(100);
    globalThis.__flushRaf();
    assert.equal(calls.length, before, "unsubscribed cb must not fire again");
  } finally { uninstallEnv(); }
});

test("getState() shape — includes loop + duration_ms (v1.2 delta)", async () => {
  installEnv({ duration_ms: 7500 });
  try {
    const h = await freshBoot({ autoplay: false });
    const s = h.getState();
    assert.ok("loop" in s, "getState must include .loop");
    assert.ok("duration_ms" in s, "getState must include .duration_ms");
    assert.equal(s.duration_ms, 7500);
    assert.equal(typeof s.loop, "boolean");
    assert.equal(typeof s.t_ms, "number");
    assert.equal(typeof s.playing, "boolean");
  } finally { uninstallEnv(); }
});

test("seek clamping — negative → 0, beyond-duration → duration_ms", async () => {
  installEnv({ duration_ms: 8000 });
  try {
    const h = await freshBoot({ autoplay: false });

    h.seek(-100);
    assert.equal(h.getState().t_ms, 0, "negative seek clamps to 0");

    h.seek(99999);
    assert.equal(h.getState().t_ms, 8000, "over-duration seek clamps to duration_ms");

    h.seek(3000);
    assert.equal(h.getState().t_ms, 3000, "in-range seek lands exactly");
  } finally { uninstallEnv(); }
});
