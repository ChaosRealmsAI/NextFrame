// Unit tests for nf-core engine modules.
// Run: node --test src/nf-core/engine/engine.test.js

import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// build-srt.js
// ---------------------------------------------------------------------------
import {
  normalizeSrtEntry,
  extractTimelineSrt,
  serializeSrtLiteral,
} from "./build-srt.js";

test("normalizeSrtEntry — returns normalized {s, e, t} from long-form keys", () => {
  const result = normalizeSrtEntry({ start: 1, end: 3, text: "hello" });
  assert.deepStrictEqual(result, { s: 1, e: 3, t: "hello" });
});

test("normalizeSrtEntry — returns normalized {s, e, t} from short-form keys", () => {
  const result = normalizeSrtEntry({ s: 0.5, e: 2.5, t: "world" });
  assert.deepStrictEqual(result, { s: 0.5, e: 2.5, t: "world" });
});

test("normalizeSrtEntry — applies time offset", () => {
  const result = normalizeSrtEntry({ s: 1, e: 3, t: "offset" }, 10);
  assert.deepStrictEqual(result, { s: 11, e: 13, t: "offset" });
});

test("normalizeSrtEntry — returns null for empty text", () => {
  assert.equal(normalizeSrtEntry({ s: 0, e: 1, t: "" }), null);
});

test("normalizeSrtEntry — returns null for non-object input", () => {
  assert.equal(normalizeSrtEntry(null), null);
  assert.equal(normalizeSrtEntry(42), null);
  assert.equal(normalizeSrtEntry(undefined), null);
});

test("extractTimelineSrt — collects cues from layer params.srt", () => {
  const timeline = {
    layers: [
      { start: 0, params: { srt: [{ s: 0, e: 1, t: "A" }] } },
      { start: 5, params: { srt: [{ s: 0, e: 2, t: "B" }] } },
    ],
  };
  const cues = extractTimelineSrt(timeline);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].t, "A");
  assert.equal(cues[0].s, 0);
  assert.equal(cues[1].t, "B");
  assert.equal(cues[1].s, 5);
});

test("extractTimelineSrt — sorts cues by start time", () => {
  const timeline = {
    layers: [
      { start: 10, params: { srt: [{ s: 0, e: 1, t: "late" }] } },
      { start: 0, params: { srt: [{ s: 0, e: 1, t: "early" }] } },
    ],
  };
  const cues = extractTimelineSrt(timeline);
  assert.equal(cues[0].t, "early");
  assert.equal(cues[1].t, "late");
});

test("extractTimelineSrt — returns empty array for missing timeline", () => {
  assert.deepStrictEqual(extractTimelineSrt(null), []);
  assert.deepStrictEqual(extractTimelineSrt({}), []);
});

test("serializeSrtLiteral — returns '[]' for empty input", () => {
  assert.equal(serializeSrtLiteral([]), "[]");
  assert.equal(serializeSrtLiteral(null), "[]");
});

test("serializeSrtLiteral — serializes entries into JS literal", () => {
  const out = serializeSrtLiteral([{ s: 0, e: 1, t: "hi" }]);
  assert.ok(out.includes("s: 0"));
  assert.ok(out.includes("e: 1"));
  assert.ok(out.includes('t: "hi"'));
});

// ---------------------------------------------------------------------------
// keyframes.js
// ---------------------------------------------------------------------------
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  bounce,
  steps,
  cubicBezier,
  resolveKeyframes,
  isKeyframed,
  interpolate,
} from "./keyframes.js";

test("linear — boundary values", () => {
  assert.equal(linear(0), 0);
  assert.equal(linear(1), 1);
  assert.equal(linear(0.5), 0.5);
});

test("easeIn — starts slow (value < t for mid-range)", () => {
  assert.ok(easeIn(0.5) < 0.5);
  assert.equal(easeIn(0), 0);
  assert.equal(easeIn(1), 1);
});

test("easeOut — ends slow (value > t for mid-range)", () => {
  assert.ok(easeOut(0.5) > 0.5);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
});

test("easeInOut — symmetric at midpoint", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
});

test("bounce — reaches 1 at end", () => {
  assert.equal(bounce(0), 0);
  const end = bounce(1);
  assert.ok(Math.abs(end - 1) < 1e-6);
});

test("steps — quantizes into discrete steps", () => {
  const fn = steps(4);
  assert.equal(fn(0), 0);
  assert.equal(fn(0.24), 0);
  assert.equal(fn(0.25), 0.25);
  assert.equal(fn(0.49), 0.25);
  assert.equal(fn(1), 1);
});

test("cubicBezier — ease-like curve boundaries", () => {
  const fn = cubicBezier(0.25, 0.1, 0.25, 1.0);
  assert.equal(fn(0), 0);
  assert.equal(fn(1), 1);
  assert.ok(fn(0.5) > 0.4 && fn(0.5) < 0.95);
});

test("isKeyframed — detects keyframe objects", () => {
  assert.equal(isKeyframed({ keys: [[0, 10], [1, 20]] }), true);
  assert.equal(isKeyframed({ keys: [[0, 5]] }), true);
  assert.equal(isKeyframed(42), false);
  assert.equal(isKeyframed(null), false);
  assert.equal(isKeyframed({ keys: [] }), false);
});

test("interpolate — returns first value before first key", () => {
  const kf = { keys: [[1, 100], [3, 300]] };
  assert.equal(interpolate(kf, 0), 100);
});

test("interpolate — returns last value after last key", () => {
  const kf = { keys: [[1, 100], [3, 300]] };
  assert.equal(interpolate(kf, 5), 300);
});

test("interpolate — linear midpoint between two numeric keys", () => {
  const kf = { keys: [[0, 0], [2, 100]], ease: "linear" };
  assert.equal(interpolate(kf, 1), 50);
});

test("interpolate — single key always returns that value", () => {
  const kf = { keys: [[0, 42]] };
  assert.equal(interpolate(kf, 0), 42);
  assert.equal(interpolate(kf, 99), 42);
});

test("interpolate — snaps string values at 50%", () => {
  const kf = { keys: [[0, "red"], [2, "blue"]], ease: "linear" };
  assert.equal(interpolate(kf, 0.5), "red");
  assert.equal(interpolate(kf, 1.5), "blue");
});

test("resolveKeyframes — passes static params through", () => {
  const result = resolveKeyframes({ x: 10, label: "hi" }, 0);
  assert.deepStrictEqual(result, { x: 10, label: "hi" });
});

test("resolveKeyframes — resolves keyframed params", () => {
  const params = {
    x: { keys: [[0, 0], [4, 100]], ease: "linear" },
    label: "static",
  };
  const result = resolveKeyframes(params, 2);
  assert.equal(result.x, 50);
  assert.equal(result.label, "static");
});

// ---------------------------------------------------------------------------
// ops.js
// ---------------------------------------------------------------------------
import {
  addLayer,
  removeLayer,
  moveLayer,
  resizeLayer,
  setLayerProp,
  setLayerProps,
  listLayers,
} from "./ops.js";

function makeTimeline() {
  return {
    layers: [
      { id: "bg-1", scene: "solidBg", start: 0, dur: 10, params: { color: "#000" } },
      { id: "title-1", scene: "heading", start: 0, dur: 5, params: { text: "Hello" } },
    ],
  };
}

test("addLayer — appends a layer with defaults", () => {
  const tl = makeTimeline();
  const r = addLayer(tl, { scene: "fadeIn", dur: 3 });
  assert.equal(r.ok, true);
  assert.equal(tl.layers.length, 3);
  assert.equal(r.value.scene, "fadeIn");
  assert.equal(r.value.dur, 3);
});

test("addLayer — fails without scene", () => {
  const tl = makeTimeline();
  const r = addLayer(tl, {});
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "MISSING_SCENE");
});

test("removeLayer — removes existing layer", () => {
  const tl = makeTimeline();
  const r = removeLayer(tl, "bg-1");
  assert.equal(r.ok, true);
  assert.equal(r.value.id, "bg-1");
  assert.equal(tl.layers.length, 1);
});

test("removeLayer — fails for unknown id", () => {
  const tl = makeTimeline();
  const r = removeLayer(tl, "nope");
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NOT_FOUND");
});

test("moveLayer — updates start time", () => {
  const tl = makeTimeline();
  const r = moveLayer(tl, "title-1", 7);
  assert.equal(r.ok, true);
  assert.equal(tl.layers[1].start, 7);
});

test("moveLayer — rejects negative time", () => {
  const tl = makeTimeline();
  const r = moveLayer(tl, "title-1", -1);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "BAD_TIME");
});

test("resizeLayer — updates duration", () => {
  const tl = makeTimeline();
  const r = resizeLayer(tl, "bg-1", 20);
  assert.equal(r.ok, true);
  assert.equal(tl.layers[0].dur, 20);
});

test("resizeLayer — rejects zero duration", () => {
  const tl = makeTimeline();
  const r = resizeLayer(tl, "bg-1", 0);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "BAD_DUR");
});

test("setLayerProp — merges into params", () => {
  const tl = makeTimeline();
  setLayerProp(tl, "bg-1", "params", { opacity: 0.5 });
  assert.equal(tl.layers[0].params.color, "#000");
  assert.equal(tl.layers[0].params.opacity, 0.5);
});

test("setLayerProps — sets multiple props at once", () => {
  const tl = makeTimeline();
  const r = setLayerProps(tl, "bg-1", { dur: 15, scene: "gradient" });
  assert.equal(r.ok, true);
  assert.equal(tl.layers[0].dur, 15);
  assert.equal(tl.layers[0].scene, "gradient");
});

test("setLayerProps — rejects non-object props", () => {
  const tl = makeTimeline();
  const r = setLayerProps(tl, "bg-1", "bad");
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "BAD_PROPS");
});

test("listLayers — returns summary with computed end", () => {
  const tl = makeTimeline();
  const r = listLayers(tl);
  assert.equal(r.ok, true);
  assert.equal(r.value.length, 2);
  assert.equal(r.value[0].end, 10);
  assert.equal(r.value[1].end, 5);
});
