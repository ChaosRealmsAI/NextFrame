// liteResolve unit tests — runtime-internal resolve pass (v1.19.1).
// No DOM; raw SourceRaw → Resolved shape compatible with getStateAt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { liteResolve, getStateAt } from "../src/runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const demoPath = join(here, "../../../demo/v1.8-video-sample.json");

test("liteResolve: bare numeric duration", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "5s",
    tracks: [
      {
        id: "bg",
        kind: "bg",
        src: "dummy.js",
        clips: [{ id: "c0", begin: "0", end: "5s", params: {} }],
      },
    ],
  };
  const r = liteResolve(src);
  assert.equal(r.duration_ms, 5000);
  assert.equal(r.tracks.length, 1);
  assert.equal(r.tracks[0].clips.length, 1);
  assert.equal(r.tracks[0].clips[0].begin_ms, 0);
  assert.equal(r.tracks[0].clips[0].end_ms, 5000);
});

test("liteResolve: anchor ref + arithmetic (demo.begin + 212s)", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "demo.end",
    anchors: {
      demo: { begin: "0", end: "demo.begin + 212s" },
    },
    tracks: [
      {
        id: "t",
        kind: "scene",
        src: "dummy.js",
        clips: [{ id: "c", begin: "demo.begin", end: "demo.end", params: {} }],
      },
    ],
  };
  const r = liteResolve(src);
  assert.equal(r.duration_ms, 212000);
  assert.equal(r.anchors.demo.begin_ms, 0);
  assert.equal(r.anchors.demo.end_ms, 212000);
  assert.equal(r.tracks[0].clips[0].begin_ms, 0);
  assert.equal(r.tracks[0].clips[0].end_ms, 212000);
});

test("liteResolve: topo sort (A depends on B resolves B first)", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "later.end",
    anchors: {
      later: { begin: "first.end + 1s", end: "later.begin + 2s" },
      first: { begin: "0", end: "first.begin + 3s" },
    },
    tracks: [
      {
        id: "t",
        kind: "scene",
        src: "d.js",
        clips: [{ begin: "0", end: "later.end", params: {} }],
      },
    ],
  };
  const r = liteResolve(src);
  assert.equal(r.anchors.first.begin_ms, 0);
  assert.equal(r.anchors.first.end_ms, 3000);
  assert.equal(r.anchors.later.begin_ms, 4000); // 3s + 1s
  assert.equal(r.anchors.later.end_ms, 6000); // 4000 + 2s
  assert.equal(r.duration_ms, 6000);
});

test("liteResolve: point anchor with .at", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "10s",
    anchors: { marker: { at: "3s" } },
    tracks: [
      {
        id: "t",
        kind: "scene",
        src: "d.js",
        clips: [{ begin: "marker.at", end: "marker.at + 2s", params: {} }],
      },
    ],
  };
  const r = liteResolve(src);
  assert.equal(r.anchors.marker.at_ms, 3000);
  assert.equal(r.tracks[0].clips[0].begin_ms, 3000);
  assert.equal(r.tracks[0].clips[0].end_ms, 5000);
});

test("liteResolve: units ms / s / m all work", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "1m",
    tracks: [
      {
        id: "t",
        kind: "scene",
        src: "d.js",
        clips: [{ begin: "500ms", end: "1m", params: {} }],
      },
    ],
  };
  const r = liteResolve(src);
  assert.equal(r.duration_ms, 60000);
  assert.equal(r.tracks[0].clips[0].begin_ms, 500);
  assert.equal(r.tracks[0].clips[0].end_ms, 60000);
});

test("liteResolve: real v1.8 demo (video-sample.json)", () => {
  const src = JSON.parse(readFileSync(demoPath, "utf8"));
  const r = liteResolve(src);
  assert.equal(r.duration_ms, 212000);
  assert.equal(r.viewport.w, 1920);
  assert.equal(r.viewport.h, 1080);
  assert.equal(r.tracks.length, 3);
  // All three clips span full duration.
  for (const t of r.tracks) {
    assert.equal(t.clips.length, 1);
    assert.equal(t.clips[0].begin_ms, 0);
    assert.equal(t.clips[0].end_ms, 212000);
  }
  // meta passthrough
  assert.equal(r.meta.version, "v1.8");
});

test("liteResolve + getStateAt: integration (activeClips at t=1000)", () => {
  const src = JSON.parse(readFileSync(demoPath, "utf8"));
  const r = liteResolve(src);
  const s = getStateAt(r, 1000);
  assert.equal(s.activeClips.length, 3);
  assert.equal(s.duration_ms, 212000);
});

test("liteResolve: throws on cycle", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "a.end",
    anchors: {
      a: { begin: "b.end", end: "a.begin + 1s" },
      b: { begin: "a.end", end: "b.begin + 1s" },
    },
    tracks: [{ id: "t", kind: "s", src: "d.js", clips: [{ begin: "0", end: "1s", params: {} }] }],
  };
  assert.throws(() => liteResolve(src), /cycle/);
});

test("liteResolve: throws on bad expr", () => {
  const src = {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    duration: "5 apples",
    tracks: [{ id: "t", kind: "s", src: "d.js", clips: [{ begin: "0", end: "1s", params: {} }] }],
  };
  assert.throws(() => liteResolve(src));
});

test("liteResolve: throws on non-string duration", () => {
  assert.throws(() => liteResolve({ viewport: { w: 1, h: 1, ratio: "1:1" }, duration: 5, tracks: [] }));
});

test("liteResolve: resolved.tracks carry kind + src (for runtime kind-fallback)", () => {
  // runtime.js uses resolved.tracks[].kind to fall back when trackSources is
  // keyed by kind (shell-mac dedup convention). Verify liteResolve preserves
  // track.kind + track.src in the output shape.
  const src = JSON.parse(readFileSync(demoPath, "utf8"));
  const r = liteResolve(src);
  assert.equal(r.tracks[0].kind, "bg");
  assert.equal(r.tracks[1].kind, "scene");
  assert.equal(r.tracks[2].kind, "video");
  assert.equal(r.tracks[0].id, "bg-gradient");
  assert.equal(r.tracks[2].id, "video-pip");
});
