// getStateAt purity tests — no DOM, no RAF, Node --test runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getStateAt, loadTrack } from "../src/runtime.js";
import { getRuntimeSource } from "../src/index.js";

const demo = {
  duration_ms: 5000,
  viewport: { w: 1920, h: 1080 },
  tracks: [
    {
      id: "bg",
      clips: [
        { id: "bg#0", begin_ms: 0, end_ms: 5000, params: { color: "#111" } },
      ],
    },
    {
      id: "title",
      clips: [
        { id: "t0", begin_ms: 500, end_ms: 2000, params: { text: "Hello" } },
        { id: "t1", begin_ms: 2500, end_ms: 4500, params: { text: "World" } },
      ],
    },
  ],
};

test("getStateAt: same input → same output (deterministic)", () => {
  const a = getStateAt(demo, 1000);
  const b = getStateAt(demo, 1000);
  assert.deepEqual(a, b);
});

test("getStateAt: activeClips match half-open [begin,end)", () => {
  // t=0: bg active, title inactive
  const s0 = getStateAt(demo, 0);
  assert.equal(s0.activeClips.length, 1);
  assert.equal(s0.activeClips[0].trackId, "bg");

  // t=500: both bg and title[0] start
  const s500 = getStateAt(demo, 500);
  assert.equal(s500.activeClips.length, 2);
  assert.ok(s500.activeClips.some((c) => c.clipId === "t0"));

  // t=2000: title[0] end (exclusive) → inactive, title[1] not yet
  const s2000 = getStateAt(demo, 2000);
  const titleClips = s2000.activeClips.filter((c) => c.trackId === "title");
  assert.equal(titleClips.length, 0);

  // t=4499: title[1] active (end_ms=4500 exclusive)
  const s4499 = getStateAt(demo, 4499);
  assert.ok(s4499.activeClips.some((c) => c.clipId === "t1"));

  // t=4500: title[1] inactive
  const s4500 = getStateAt(demo, 4500);
  assert.equal(s4500.activeClips.filter((c) => c.trackId === "title").length, 0);
});

test("getStateAt: localT = t - clip.begin_ms", () => {
  const s = getStateAt(demo, 1200);
  const t0 = s.activeClips.find((c) => c.clipId === "t0");
  assert.equal(t0.localT, 1200 - 500);
});

test("getStateAt: order independence (call history does not affect result)", () => {
  // Call with scrambled timestamps; each result must match a fresh call.
  const seq = [3000, 0, 4400, 1500, 500, 2500];
  const scrambled = seq.map((t) => getStateAt(demo, t));
  for (let i = 0; i < seq.length; i++) {
    const fresh = getStateAt(demo, seq[i]);
    assert.deepEqual(scrambled[i], fresh, `t=${seq[i]} must be history-independent`);
  }
});

test("getStateAt: returns viewport + duration_ms unchanged", () => {
  const s = getStateAt(demo, 100);
  assert.deepEqual(s.viewport, { w: 1920, h: 1080 });
  assert.equal(s.duration_ms, 5000);
  assert.equal(s.t, 100);
  assert.equal(s.t_ms, 100);
});

test("getStateAt: handles empty/missing resolved gracefully", () => {
  const s = getStateAt({}, 100);
  assert.equal(s.activeClips.length, 0);
  assert.equal(s.duration_ms, 0);
});

test("loadTrack: compiles CommonJS track source", () => {
  const src = `
    module.exports = {
      describe: () => ({ id: "t", name: "T", viewport: "any", params: {} }),
      sample: () => ({ duration: 1000, clips: [] }),
      render: (t, p, vp) => "<div>t=" + t + " w=" + vp.w + "</div>"
    };
  `;
  const track = loadTrack(src);
  assert.equal(typeof track.render, "function");
  assert.equal(track.render(42, {}, { w: 100, h: 50 }), "<div>t=42 w=100</div>");
});

test("loadTrack: rejects missing exports", () => {
  assert.throws(() => loadTrack(`module.exports = { describe: ()=>({}) };`), /missing/);
});

test("getRuntimeSource(): produces non-empty IIFE string that parses", () => {
  const src = getRuntimeSource();
  assert.ok(typeof src === "string");
  assert.ok(src.length > 1000, "source should be substantial");
  assert.ok(src.startsWith("(function(){"), "must start with IIFE wrapper");
  assert.ok(src.includes("window.NFRuntime"), "must expose NFRuntime on window");
  // Must parse as valid JS (Function ctor = parse-only test, doesn't execute).
  assert.doesNotThrow(() => new Function(src));
});
