import { test } from "node:test";
import assert from "node:assert/strict";
import { installGlobalShim, mountRoot } from "./dom-shim.mjs";

// Install shim BEFORE importing modules that use globalThis.document.
installGlobalShim();

const { renderTracks, registerTrack, clearTrackRegistry } = await import("../src/track-host.js");
const { deriveState } = await import("../src/state.js");

function freshDoc() {
  const { win, doc } = installGlobalShim();
  clearTrackRegistry();
  return { win, doc, mount: mountRoot(doc) };
}

// Simple test Track: renders a <div> with its text value.
const textTrack = {
  describe() { return {}; },
  sample() { return { text: "hi" }; },
  render(t, kfs, vp) {
    const k = kfs[0] || {};
    const el = globalThis.document.createElement("div");
    el.setAttribute("data-t", String(t));
    el.textContent = String(k.text ?? "");
    el.style.color = k.color || "#000";
    return { dom: el };
  },
};

// A Track that emits a persist element (fake <video>).
const videoTrack = {
  describe() { return {}; },
  sample() { return { src: "x.mp4" }; },
  render(t, kfs, vp) {
    const k = kfs[0] || {};
    const el = globalThis.document.createElement("video");
    el.setAttribute("data-nf-persist", "1");
    el.setAttribute("src", String(k.src || ""));
    el.setAttribute("data-t", String(t));
    return { dom: el, audio: { ref: el, volume: 1 } };
  },
};

test("renderTracks: single track mounts a wrapper + child", () => {
  const { doc, mount } = freshDoc();
  registerTrack("text", textTrack);
  const state = deriveState(0, {
    tracks: [{ kind: "text", id: "hello", keyframes: [{ t: 0, text: "hello" }] }],
  });
  const result = renderTracks(state, mount);
  assert.equal(mount.childNodes.length, 1);
  const wrap = mount.childNodes[0];
  assert.equal(wrap.getAttribute("data-track-id"), "hello");
  assert.equal(wrap.childNodes.length, 1);
  assert.equal(wrap.childNodes[0].textContent, "hello");
  assert.equal(result.snapshot[0].mounted, true);
});

test("renderTracks: 2 tracks → 2 wrappers", () => {
  const { doc, mount } = freshDoc();
  registerTrack("text", textTrack);
  const state = deriveState(0, {
    tracks: [
      { kind: "text", id: "A", keyframes: [{ t: 0, text: "A-txt" }] },
      { kind: "text", id: "B", keyframes: [{ t: 0, text: "B-txt" }] },
    ],
  });
  renderTracks(state, mount);
  assert.equal(mount.childNodes.length, 2);
  const ids = mount.childNodes.map((c) => c.getAttribute("data-track-id")).sort();
  assert.deepEqual(ids, ["A", "B"]);
});

test("renderTracks: persist element survives re-render (SAME reference)", () => {
  const { doc, mount } = freshDoc();
  registerTrack("video", videoTrack);
  const state0 = deriveState(0, {
    tracks: [{ kind: "video", id: "v", keyframes: [{ t: 0, src: "a.mp4" }, { t: 10, src: "a.mp4" }] }],
  });
  renderTracks(state0, mount);
  const wrap = mount.childNodes[0];
  const videoEl1 = wrap.childNodes[0];
  assert.equal(videoEl1.tagName, "VIDEO");
  assert.equal(videoEl1.getAttribute("src"), "a.mp4");
  // Re-render at different t
  const state1 = deriveState(5, {
    tracks: [{ kind: "video", id: "v", keyframes: [{ t: 0, src: "a.mp4" }, { t: 10, src: "a.mp4" }] }],
  });
  renderTracks(state1, mount);
  const videoEl2 = wrap.childNodes[0];
  // Critical guarantee: same Element reference
  assert.strictEqual(videoEl1, videoEl2, "persist element must not be replaced");
  // Attributes synced (data-t updated)
  assert.equal(videoEl2.getAttribute("data-t"), "5");
});

test("renderTracks: non-persist element IS replaced (fresh ref each render)", () => {
  const { doc, mount } = freshDoc();
  registerTrack("text", textTrack);
  const state0 = deriveState(0, {
    tracks: [{ kind: "text", id: "hello", keyframes: [{ t: 0, text: "A" }] }],
  });
  renderTracks(state0, mount);
  const wrap = mount.childNodes[0];
  const div1 = wrap.childNodes[0];
  const state1 = deriveState(1, {
    tracks: [{ kind: "text", id: "hello", keyframes: [{ t: 0, text: "B" }] }],
  });
  renderTracks(state1, mount);
  const div2 = wrap.childNodes[0];
  assert.notStrictEqual(div1, div2, "non-persist element should be replaced");
  assert.equal(div2.textContent, "B");
});

test("renderTracks: unknown track kind → snapshot reports no-track", () => {
  const { doc, mount } = freshDoc();
  const state = deriveState(0, {
    tracks: [{ kind: "missing", id: "x", keyframes: [] }],
  });
  const res = renderTracks(state, mount);
  assert.equal(res.snapshot[0].mounted, false);
  assert.equal(res.snapshot[0].reason, "no-track");
});

test("renderTracks: stale wrapper removed when track goes inactive", () => {
  const { doc, mount } = freshDoc();
  registerTrack("text", textTrack);
  // t=0 → both active (A: in=0 out=5, B: in=0 out=10)
  const resolved = {
    tracks: [
      { kind: "text", id: "A", in: 0, out: 5, keyframes: [{ t: 0, text: "A" }] },
      { kind: "text", id: "B", in: 0, out: 10, keyframes: [{ t: 0, text: "B" }] },
    ],
  };
  renderTracks(deriveState(2, resolved), mount);
  assert.equal(mount.childNodes.length, 2);
  // t=7 → only B active; A's wrapper should be removed.
  renderTracks(deriveState(7, resolved), mount);
  assert.equal(mount.childNodes.length, 1);
  assert.equal(mount.childNodes[0].getAttribute("data-track-id"), "B");
});

test("renderTracks: audio refs aggregated", () => {
  const { doc, mount } = freshDoc();
  registerTrack("video", videoTrack);
  const state = deriveState(0, {
    tracks: [{ kind: "video", id: "v1", keyframes: [{ t: 0, src: "x.mp4" }] }],
  });
  const res = renderTracks(state, mount);
  assert.equal(res.audio.length, 1);
  assert.equal(res.audio[0].volume, 1);
  assert.equal(res.audio[0].id, "v1");
});
