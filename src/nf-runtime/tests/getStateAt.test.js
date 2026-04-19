// getStateAt purity tests — no DOM, no RAF, Node --test runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getStateAt, liteResolve, loadTrack } from "../src/runtime.js";
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

const transitionDemo = {
  duration_ms: 5000,
  viewport: { w: 1920, h: 1080 },
  meta: {
    transitions: [
      { between: ["a", "b"], type: "fade", duration_ms: 1000 },
      { between: ["b", "c"], type: "dissolve", duration_ms: 500 },
    ],
  },
  tracks: [
    {
      id: "scene",
      clips: [
        { id: "a", begin_ms: 0, end_ms: 3000, params: { text: "A" } },
        { id: "b", begin_ms: 2000, end_ms: 4000, params: { text: "B" } },
        { id: "c", begin_ms: 3500, end_ms: 5000, params: { text: "C" } },
      ],
    },
  ],
};

const keyframeDemo = {
  duration_ms: 3000,
  viewport: { w: 1920, h: 1080 },
  tracks: [
    {
      id: "scene",
      clips: [
        {
          id: "kf-clip",
          begin_ms: 0,
          end_ms: 3000,
          params: {
            opacity: 0,
            opacity_keyframes: [
              { t: 0, v: 0 },
              { t: 1000, v: 1 },
              { t: 2000, v: 0 },
            ],
          },
        },
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

test("liteResolve: accepts numeric editor-mutated duration and clip bounds", () => {
  const resolved = liteResolve({
    viewport: { w: 1920, h: 1080 },
    duration: 5000,
    tracks: [
      {
        id: "scene",
        kind: "scene",
        clips: [
          { id: "n0", begin: 0, end: 2000, params: { title: "A" } },
          { id: "n1", begin: 2000, end: 5000, params: { title: "B" } },
        ],
      },
    ],
  });
  assert.equal(resolved.duration_ms, 5000);
  assert.equal(resolved.tracks[0].clips[1].begin_ms, 2000);
  assert.equal(resolved.tracks[0].clips[1].end_ms, 5000);
});

test("getStateAt: fade transition linearly blends overlapping clips", () => {
  const s = getStateAt(transitionDemo, 2300);
  const a = s.activeClips.find((clip) => clip.clipId === "a");
  const b = s.activeClips.find((clip) => clip.clipId === "b");
  assert.ok(a && b, "fade window should keep both clips active");
  assert.equal(s.activeTransitions.length, 1);
  assert.equal(s.activeTransitions[0].type, "fade");
  assert.ok(a.opacity > 0.6 && a.opacity < 0.8, `expected fade-out opacity around 0.7, got ${a.opacity}`);
  assert.ok(b.opacity > 0.2 && b.opacity < 0.4, `expected fade-in opacity around 0.3, got ${b.opacity}`);
});

test("getStateAt: dissolve transition is stable inside and outside overlap window", () => {
  assert.doesNotThrow(() => {
    getStateAt(transitionDemo, 3400);
    getStateAt(transitionDemo, 3600);
    getStateAt(transitionDemo, 4300);
  });
  const s = getStateAt(transitionDemo, 3600);
  const b = s.activeClips.find((clip) => clip.clipId === "b");
  const c = s.activeClips.find((clip) => clip.clipId === "c");
  assert.ok(b && c, "dissolve window should keep both clips active");
  assert.equal(s.activeTransitions.length, 1);
  assert.equal(s.activeTransitions[0].type, "dissolve");
  assert.ok(b.opacity > 0 && b.opacity < 1);
  assert.ok(c.opacity > 0 && c.opacity < 1);
});

test("getStateAt: keyframe lerp reaches 0.5 halfway to a 1s opacity keyframe", () => {
  const s = getStateAt(keyframeDemo, 500);
  const clip = s.activeClips.find((active) => active.clipId === "kf-clip");
  assert.ok(clip, "keyframed clip should be active at 500ms");
  assert.ok(
    Math.abs(clip.params.opacity - 0.5) <= 0.02,
    `expected opacity ≈ 0.5, got ${clip.params.opacity}`,
  );
  assert.equal("opacity_keyframes" in clip.params, false);
});

test("getStateAt: three-point keyframes peak at 1.0 around the midpoint", () => {
  const s = getStateAt(keyframeDemo, 1000);
  const clip = s.activeClips.find((active) => active.clipId === "kf-clip");
  assert.ok(clip, "keyframed clip should be active at midpoint");
  assert.ok(
    Math.abs(clip.params.opacity - 1.0) <= 0.02,
    `expected opacity ≈ 1.0, got ${clip.params.opacity}`,
  );
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
