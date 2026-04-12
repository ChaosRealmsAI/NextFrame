import test from "node:test";
import assert from "node:assert/strict";

import { TOOLS } from "../src/ai/tools.js";

function makeTimeline() {
  return {
    schema: "nextframe/v0.1",
    duration: 8,
    background: "#101010",
    project: { width: 320, height: 180, aspectRatio: 16 / 9, fps: 30 },
    chapters: [{ id: "intro", start: 0, end: 4 }],
    markers: [{ id: "m1", t: 5 }],
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [{ id: "bg", start: 0, dur: 8, scene: "auroraGradient", params: {} }],
      },
      {
        id: "v2",
        kind: "video",
        clips: [
          { id: "title", start: 1, dur: 2, scene: "textOverlay", params: { text: "HELLO" } },
          { id: "later", start: 4, dur: 1.5, scene: "vignette", params: {} },
        ],
      },
    ],
  };
}

test("ai-tools-1: list_scenes returns scene META records", () => {
  const result = TOOLS.list_scenes.handler();

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.value));
  assert.ok(result.value.length >= 21, `expected at least 21 scenes, got ${result.value.length}`);

  for (const scene of result.value) {
    assert.equal(typeof scene.id, "string");
    assert.equal(typeof scene.category, "string");
    assert.ok(Array.isArray(scene.params));
  }
});

test("ai-tools-2: get_scene_meta returns META or UNKNOWN_SCENE", () => {
  const found = TOOLS.get_scene_meta.handler({ id: "vignette" });
  const missing = TOOLS.get_scene_meta.handler({ id: "notReal" });

  assert.equal(found.ok, true);
  assert.equal(found.value.id, "vignette");
  assert.ok(Array.isArray(found.value.params));

  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "UNKNOWN_SCENE");
});

test("ai-tools-3: validate_timeline keeps validation errors nested in value", () => {
  const invalid = TOOLS.validate_timeline.handler({ timeline: null });
  const valid = TOOLS.validate_timeline.handler({ timeline: makeTimeline() });

  assert.equal(invalid.ok, true);
  assert.equal(invalid.value.ok, false);
  assert.ok(Array.isArray(invalid.value.errors));
  assert.ok(invalid.value.errors.length > 0);

  assert.equal(valid.ok, true);
  assert.equal(valid.value.ok, true);
  assert.ok(Array.isArray(valid.value.errors));
  assert.ok(Array.isArray(valid.value.warnings));
});

test("ai-tools-4: resolve_time resolves shorthand symbolic refs and reports bad refs", () => {
  const timeline = makeTimeline();
  const atMarker = TOOLS.resolve_time.handler({ timeline, expr: { at: "m1" } });
  const afterMarker = TOOLS.resolve_time.handler({ timeline, expr: { after: "m1", gap: 2 } });
  const missing = TOOLS.resolve_time.handler({ timeline, expr: { at: "missing-marker" } });

  assert.equal(atMarker.ok, true);
  assert.equal(atMarker.value, 5);

  assert.equal(afterMarker.ok, true);
  assert.equal(afterMarker.value, 7);

  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "TIME_REF_NOT_FOUND");
});

test("ai-tools-5: describe_frame returns semantic metadata at time t", () => {
  const result = TOOLS.describe_frame.handler({ timeline: makeTimeline(), t: 2.5 });

  assert.equal(result.ok, true);
  assert.equal(result.value.t, 2.5);
  assert.ok(Array.isArray(result.value.active_clips));
  assert.ok(result.value.active_clips.length >= 2);
  assert.deepEqual(
    result.value.active_clips.map((clip) => clip.clipId),
    ["bg", "title"],
  );
});

test("ai-tools-6: gantt_ascii returns an ASCII chart with track ids", () => {
  const result = TOOLS.gantt_ascii.handler({ timeline: makeTimeline(), width: 60 });

  assert.equal(result.ok, true);
  assert.equal(typeof result.value, "string");
  assert.match(result.value, /v1/);
  assert.match(result.value, /v2/);
  assert.match(result.value, /MARK/);
});

test("ai-tools-7: suggest_clip_at returns only clips active at time t", () => {
  const result = TOOLS.suggest_clip_at.handler({ timeline: makeTimeline(), t: 1.0 });

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.value));
  assert.deepEqual(result.value, [
    { track: "v1", id: "bg", scene: "auroraGradient" },
    { track: "v2", id: "title", scene: "textOverlay" },
  ]);
});

test("ai-tools-8: find_clips filters by track, time, and param", () => {
  const result = TOOLS.find_clips.handler({
    timeline: makeTimeline(),
    track: "v2",
    at: 2,
    param: "text",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, [
    {
      trackId: "v2",
      clipId: "title",
      scene: "textOverlay",
      start: 1,
      dur: 2,
      params: { text: "HELLO" },
    },
  ]);
});

test("ai-tools-9: get_clip returns original clip details plus resolved start", () => {
  const timeline = makeTimeline();
  timeline.tracks[1].clips[0].start = { after: "marker-m1", gap: 0.5 };

  const result = TOOLS.get_clip.handler({ timeline, clipId: "title" });

  assert.equal(result.ok, true);
  assert.equal(result.value.trackId, "v2");
  assert.deepEqual(result.value.clip.start, { after: "marker-m1", gap: 0.5 });
  assert.equal(result.value.resolvedStart, 5.5);
  assert.equal(result.value.meta.id, "textOverlay");
});

test("ai-tools-10: apply_patch rejects raw add-clip start and validates applied ops", () => {
  const rejected = TOOLS.apply_patch.handler({
    timeline: makeTimeline(),
    ops: [{ op: "add-clip", track: "v2", clip: { id: "bad", start: 3, dur: 1, scene: "vignette" } }],
  });
  const applied = TOOLS.apply_patch.handler({
    timeline: makeTimeline(),
    ops: [
      { op: "move-clip", clipId: "later", start: 5 },
      { op: "set-param", clipId: "title", key: "text", value: "UPDATED" },
    ],
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "RAW_SECONDS");

  assert.equal(applied.ok, true);
  assert.equal(applied.value.applied, 2);
  assert.equal(applied.value.validation.ok, true);
  assert.equal(applied.value.timeline.tracks[1].clips[0].params.text, "UPDATED");
  assert.equal(applied.value.timeline.tracks[1].clips[1].start, 5);
});

test("ai-tools-11: assert_at reports passed and failed checks at time t", () => {
  const result = TOOLS.assert_at.handler({
    timeline: makeTimeline(),
    t: 2.5,
    checks: [
      { type: "clip_visible", clipId: "bg" },
      { type: "scene_active", scene: "textOverlay" },
      { type: "clip_count", min: 2 },
      { type: "chapter", chapter: "intro" },
      { type: "clip_visible", clipId: "later" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.passed, 4);
  assert.equal(result.value.total, 5);
  assert.equal(result.value.failed.length, 1);
  assert.deepEqual(result.value.failed[0], {
    check: { type: "clip_visible", clipId: "later" },
    expected: true,
    actual: false,
  });
});

test("ai-tools-12: render_ascii returns ASCII art for a rendered frame", async () => {
  const result = await TOOLS.render_ascii.handler({ timeline: makeTimeline(), t: 2.5, width: 20 });

  assert.equal(result.ok, true);
  assert.equal(typeof result.value, "string");
  assert.equal(result.value.split("\n").length, 24);
});
