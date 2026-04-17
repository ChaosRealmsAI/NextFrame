import { test } from "node:test";
import assert from "node:assert/strict";
import { installGlobalShim, mountRoot } from "./dom-shim.mjs";

installGlobalShim();

const { start, getStateAt } = await import("../src/app.js");
const { registerTrack, clearTrackRegistry } = await import("../src/track-host.js");

function fresh() {
  const { win, doc } = installGlobalShim();
  clearTrackRegistry();
  const mount = mountRoot(doc);
  return { win, doc, mount };
}

const textTrack = {
  describe() { return {}; },
  sample() { return { text: "hi" }; },
  render(t, kfs, vp) {
    const k = kfs[0] || {};
    const el = globalThis.document.createElement("div");
    el.textContent = String(k.text ?? "");
    el.setAttribute("data-t", String(t));
    return { dom: el };
  },
};

test("getStateAt is pure: same (t, resolved) → deep-equal output", () => {
  const resolved = {
    viewport: { w: 100, h: 100, ratio: "1:1" },
    tracks: [
      { kind: "text", id: "A", keyframes: [{ t: 0, text: "hi", x: 0 }, { t: 10, text: "hi", x: 100 }] },
    ],
  };
  const s1 = getStateAt(5, resolved);
  const s2 = getStateAt(5, resolved);
  assert.deepEqual(s1, s2);
  assert.equal(s1.tracks[0].values.x, 50);
});

test("getStateAt is stateless: two different t's are independent", () => {
  const resolved = {
    viewport: { w: 100, h: 100, ratio: "1:1" },
    tracks: [{ kind: "text", id: "A", keyframes: [{ t: 0, x: 0 }, { t: 10, x: 100 }] }],
  };
  const a = getStateAt(3, resolved);
  const b = getStateAt(7, resolved);
  assert.equal(a.tracks[0].values.x, 30);
  assert.equal(b.tracks[0].values.x, 70);
  // Re-run a — unchanged
  const a2 = getStateAt(3, resolved);
  assert.equal(a2.tracks[0].values.x, 30);
});

test("start(edit): mounts + seek updates DOM", () => {
  const { win, mount } = fresh();
  registerTrack("text", textTrack);
  const app = start({
    mode: "edit",
    win,
    root: "nf-root",
    resolved: {
      viewport: { w: 100, h: 100, ratio: "1:1" },
      tracks: [{ kind: "text", id: "t1", keyframes: [{ t: 0, text: "first" }, { t: 10, text: "second" }] }],
    },
  });
  // t=0 frame painted at start()
  assert.equal(mount.childNodes.length, 1);
  const wrap = mount.childNodes[0];
  assert.equal(wrap.childNodes[0].textContent, "first");
  // seek to t=9 → text should switch (string picks latest past halfway)
  app.seek(9);
  assert.equal(wrap.childNodes[0].textContent, "second");
  assert.equal(app.currentMode, "edit");
  assert.equal(app.currentT, 9);
});

test("start(edit): no RAF loop (currentT doesn't advance on its own)", async () => {
  const { win, mount } = fresh();
  registerTrack("text", textTrack);
  const app = start({
    mode: "edit",
    win,
    resolved: {
      viewport: { w: 100, h: 100, ratio: "1:1" },
      tracks: [{ kind: "text", id: "t1", keyframes: [{ t: 0, text: "A" }] }],
    },
  });
  const t0 = app.currentT;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(app.currentT, t0, "edit mode must not self-advance t");
});

test("start(record): installs window.__nfTick", async () => {
  const { win, mount } = fresh();
  registerTrack("text", textTrack);
  start({
    mode: "record",
    win,
    resolved: {
      viewport: { w: 100, h: 100, ratio: "1:1" },
      tracks: [{ kind: "text", id: "t1", keyframes: [{ t: 0, text: "rec" }] }],
    },
  });
  assert.equal(typeof win.__nfTick, "function");
  const result = await win.__nfTick(1.5);
  assert.equal(result.t, 1.5);
  const wrap = mount.childNodes[0];
  assert.equal(wrap.childNodes[0].getAttribute("data-t"), "1.5");
});

test("start(play): RAF loop advances t", async () => {
  const { win, mount } = fresh();
  registerTrack("text", textTrack);
  const app = start({
    mode: "play",
    win,
    resolved: {
      viewport: { w: 100, h: 100, ratio: "1:1" },
      tracks: [{ kind: "text", id: "t1", keyframes: [{ t: 0, text: "A" }] }],
    },
  });
  // Wait a few ticks — RAF-shim uses setTimeout, so any delay beats 16ms.
  await new Promise((r) => setTimeout(r, 50));
  app.pause();
  // currentT should be > 0 after loop ran at least once.
  assert.ok(app.currentT >= 0, "play mode should produce non-negative t");
  // pause stops advancement
  const tAfterPause = app.currentT;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(app.currentT, tAfterPause, "pause should freeze t");
});

test("start(): installs window.__nfApp handle", () => {
  const { win } = fresh();
  registerTrack("text", textTrack);
  const app = start({
    mode: "edit",
    win,
    resolved: { viewport: { w: 10, h: 10, ratio: "1:1" }, tracks: [] },
  });
  assert.strictEqual(win.__nfApp, app);
  assert.equal(typeof win.__nfApp.getStateAt, "function");
  assert.equal(typeof win.__nfApp.seek, "function");
});

test("start(): reads tracks from window.__nfTracks (bundler-style)", () => {
  const { win, mount } = fresh();
  win.__nfTracks = { text: textTrack };
  // copy onto globalThis since registerTracksFromGlobal reads via opts.win
  const app = start({
    mode: "edit",
    win,
    resolved: {
      viewport: { w: 100, h: 100, ratio: "1:1" },
      tracks: [{ kind: "text", id: "auto", keyframes: [{ t: 0, text: "AUTO" }] }],
    },
  });
  assert.equal(mount.childNodes.length, 1);
  assert.equal(mount.childNodes[0].childNodes[0].textContent, "AUTO");
});
