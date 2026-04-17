import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpolateKeyframes,
  activeTracksAt,
  currentValues,
  deriveState,
} from "../src/state.js";

test("interpolateKeyframes: empty → {}", () => {
  assert.deepEqual(interpolateKeyframes([], 0.5), {});
  assert.deepEqual(interpolateKeyframes(undefined, 0.5), {});
});

test("interpolateKeyframes: single kf → its props (stripped of t)", () => {
  const out = interpolateKeyframes([{ t: 0, x: 10, y: 20 }], 5);
  assert.deepEqual(out, { x: 10, y: 20 });
});

test("interpolateKeyframes: clamp below first & above last", () => {
  const kfs = [{ t: 1, v: 10 }, { t: 3, v: 30 }];
  assert.deepEqual(interpolateKeyframes(kfs, 0), { v: 10 });
  assert.deepEqual(interpolateKeyframes(kfs, 5), { v: 30 });
});

test("interpolateKeyframes: linear lerp at midpoint", () => {
  const kfs = [{ t: 0, v: 0 }, { t: 10, v: 100 }];
  const out = interpolateKeyframes(kfs, 5);
  assert.equal(out.v, 50);
});

test("interpolateKeyframes: ease-in yields < linear mid value", () => {
  const kfs = [{ t: 0, v: 0 }, { t: 10, v: 100, easing: "ease-in" }];
  const out = interpolateKeyframes(kfs, 5);
  assert.ok(out.v < 50 && out.v >= 0, `expected <50 got ${out.v}`);
});

test("interpolateKeyframes: ease-out yields > linear mid value", () => {
  const kfs = [{ t: 0, v: 0 }, { t: 10, v: 100, easing: "ease-out" }];
  const out = interpolateKeyframes(kfs, 5);
  assert.ok(out.v > 50 && out.v <= 100, `expected >50 got ${out.v}`);
});

test("interpolateKeyframes: string picks latest past halfway", () => {
  const kfs = [{ t: 0, label: "A" }, { t: 10, label: "B" }];
  assert.equal(interpolateKeyframes(kfs, 4).label, "A");
  assert.equal(interpolateKeyframes(kfs, 6).label, "B");
});

test("interpolateKeyframes: nested object numeric leaves lerp", () => {
  const kfs = [
    { t: 0, pos: { x: 0, y: 0 } },
    { t: 10, pos: { x: 100, y: 50 } },
  ];
  const out = interpolateKeyframes(kfs, 5);
  assert.equal(out.pos.x, 50);
  assert.equal(out.pos.y, 25);
});

test("interpolateKeyframes: unsorted input is sorted internally", () => {
  const kfs = [{ t: 10, v: 100 }, { t: 0, v: 0 }];
  const out = interpolateKeyframes(kfs, 5);
  assert.equal(out.v, 50);
});

test("activeTracksAt: no in/out → always active", () => {
  const resolved = { tracks: [{ kind: "text", id: "a" }] };
  assert.equal(activeTracksAt(0, resolved).length, 1);
  assert.equal(activeTracksAt(99, resolved).length, 1);
});

test("activeTracksAt: respects in/out bounds", () => {
  const resolved = {
    tracks: [
      { kind: "text", id: "a", in: 1, out: 3 },
      { kind: "text", id: "b", in: 5, out: 7 },
    ],
  };
  const at2 = activeTracksAt(2, resolved);
  assert.equal(at2.length, 1);
  assert.equal(at2[0].id, "a");
  const at6 = activeTracksAt(6, resolved);
  assert.equal(at6.length, 1);
  assert.equal(at6[0].id, "b");
  assert.equal(activeTracksAt(4, resolved).length, 0);
});

test("activeTracksAt: overlapping both match", () => {
  const resolved = {
    tracks: [
      { kind: "text", id: "a", in: 0, out: 5 },
      { kind: "text", id: "b", in: 3, out: 7 },
    ],
  };
  assert.equal(activeTracksAt(4, resolved).length, 2);
});

test("currentValues: matches exact kf at its t", () => {
  const track = { kind: "text", keyframes: [{ t: 0, x: 10 }, { t: 10, x: 90 }] };
  assert.deepEqual(currentValues(track, 0), { x: 10 });
  assert.deepEqual(currentValues(track, 10), { x: 90 });
});

test("currentValues: respects track.in offset (relative time)", () => {
  const track = { in: 5, keyframes: [{ t: 0, x: 0 }, { t: 10, x: 100 }] };
  // At world t=5 → relT=0 → x=0
  assert.equal(currentValues(track, 5).x, 0);
  // At world t=10 → relT=5 → x=50
  assert.equal(currentValues(track, 10).x, 50);
});

test("deriveState: returns {t, viewport, tracks, selected, data}", () => {
  const resolved = {
    viewport: { w: 1000, h: 500, ratio: "2:1" },
    tracks: [{ kind: "text", id: "hello", keyframes: [{ t: 0, v: 10 }, { t: 10, v: 20 }] }],
  };
  const st = deriveState(5, resolved);
  assert.equal(st.t, 5);
  assert.equal(st.viewport.w, 1000);
  assert.equal(st.tracks.length, 1);
  assert.equal(st.tracks[0].values.v, 15);
  assert.equal(st.selected, null);
});

test("deriveState: default viewport when missing", () => {
  const st = deriveState(0, {});
  assert.equal(st.viewport.w, 1920);
  assert.equal(st.viewport.h, 1080);
});

test("deriveState: purity — same input → same output deep-equal", () => {
  const resolved = {
    viewport: { w: 100, h: 100, ratio: "1:1" },
    tracks: [{ kind: "text", id: "a", keyframes: [{ t: 0, x: 0 }, { t: 10, x: 100 }] }],
  };
  const a = deriveState(3.14, resolved);
  const b = deriveState(3.14, resolved);
  assert.deepEqual(a, b);
});
