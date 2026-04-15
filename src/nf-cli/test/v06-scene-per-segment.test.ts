import test from "node:test";
import assert from "node:assert/strict";

import { dispatchExpand, dispatchValidate } from "../../nf-core/matches/index.js";
import { plan } from "../../nf-core/matches/scene-per-segment.js";

function makeTimeline() {
  return {
    version: "0.6",
    ratio: "16:9",
    tracks: [
      {
        id: "narration",
        kind: "audio",
        meta: {
          duration_ms: 4500,
          segments: [
            { id: "s1", text: "Intro headline", startMs: 0, endMs: 1000, words: [] },
            { id: "s2", text: "Second segment", startMs: 1000, endMs: 2500, words: [] },
            { id: "s3", text: "Third segment", startMs: 2500, endMs: 4500, words: [] },
          ],
        },
      },
      {
        id: "main",
        kind: "scene",
        clips: [],
      },
    ],
  };
}

function makeMatch(plan: unknown) {
  return {
    rule: "scene-per-segment",
    source: "narration",
    target: "main",
    plan,
  };
}

test("scene-per-segment validate rejects missing source track", () => {
  const timeline = makeTimeline();
  timeline.tracks = [timeline.tracks[1]];

  const result = dispatchValidate(makeMatch([]), timeline);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "MATCH_SOURCE_MISSING"));
});

test("scene-per-segment validate rejects plan that misses a segment id", () => {
  const timeline = makeTimeline();
  const match = makeMatch([
    { segmentId: "s1", scene: "headlineCenter", params: { text: "Intro headline" } },
    { segmentId: "s3", scene: "headlineCenter", params: { text: "Third segment" } },
  ]);

  const result = dispatchValidate(match, timeline);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "MATCH_SEGMENT_MISSING" && error.message.includes("'s2'")));
});

test("scene-per-segment validate accepts a correct plan", () => {
  const timeline = makeTimeline();
  const match = makeMatch([
    { segmentId: "s1", scene: "headlineCenter", params: { text: "Intro headline" } },
    { segmentId: "s2", scene: "headlineCenter", params: { text: "Second segment" } },
    { segmentId: "s3", scene: "headlineCenter", params: { text: "Third segment" } },
  ]);

  const result = dispatchValidate(match, timeline);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("scene-per-segment expand uses audio segment boundaries for clip start and duration", () => {
  const timeline = makeTimeline();
  const match = makeMatch([
    { segmentId: "s1", scene: "headlineCenter", params: { text: "Intro headline" } },
    { segmentId: "s2", scene: "headlineCenter", params: { text: "Second segment" } },
    { segmentId: "s3", scene: "headlineCenter", params: { text: "Third segment" } },
  ]);

  const expanded = dispatchExpand(match, timeline);
  const track = expanded.tracks?.[0];

  assert.ok(track);
  assert.deepEqual(track.clips, [
    { scene: "headlineCenter", start: 0, dur: 1, params: { text: "Intro headline" } },
    { scene: "headlineCenter", start: 1, dur: 1.5, params: { text: "Second segment" } },
    { scene: "headlineCenter", start: 2.5, dur: 2, params: { text: "Third segment" } },
  ]);
});

test("scene-per-segment expand merges consecutive @prev segments into one clip", () => {
  const timeline = makeTimeline();
  const match = makeMatch([
    { segmentId: "s1", scene: "headlineCenter", params: { text: "Intro headline" } },
    { segmentId: "s2", scene: "@prev" },
    { segmentId: "s3", scene: "@prev" },
  ]);

  const expanded = dispatchExpand(match, timeline);
  const track = expanded.tracks?.[0];

  assert.ok(track);
  assert.deepEqual(track.clips, [
    { scene: "headlineCenter", start: 0, dur: 4.5, params: { text: "Intro headline" } },
  ]);
});

test("scene-per-segment expand is deterministic", () => {
  const timeline = makeTimeline();
  const match = makeMatch([
    { segmentId: "s1", scene: "headlineCenter", params: { text: "Intro headline" } },
    { segmentId: "s2", scene: "headlineCenter", params: { text: "Second segment" } },
    { segmentId: "s3", scene: "headlineCenter", params: { text: "Third segment" } },
  ]);

  const first = dispatchExpand(match, timeline);
  const second = dispatchExpand(match, timeline);

  assert.deepStrictEqual(first, second);
});

test("scene-per-segment plan treats an explicit empty scene registry as authoritative", async () => {
  await assert.rejects(
    plan({
      ratio: "16:9",
      sceneRegistry: [],
      timeline: {
        ratio: "16:9",
        tracks: [makeTimeline().tracks[0]],
      },
      match: {
        source: "narration",
        target: "main",
      },
    }),
    /cannot plan without scenes/,
  );
});

test("scene-per-segment plan prefers code scenes for code-ish segments", async () => {
  const result = await plan({
    ratio: "16:9",
    sceneRegistry: [
      { id: "headlineCenter", ratio: "16:9", params: [{ name: "text", required: true }] },
      { id: "codeTerminal", ratio: "16:9", params: [{ name: "code", required: true }] },
    ],
    timeline: {
      ratio: "16:9",
      tracks: [
        {
          id: "narration",
          kind: "audio",
          meta: {
            duration_ms: 2000,
            segments: [
              { id: "s1", text: "Hello world", startMs: 0, endMs: 1000, words: [] },
              { id: "s2", text: "Run `npm test`", startMs: 1000, endMs: 2000, words: [] },
            ],
          },
        },
      ],
    },
    match: { source: "narration", target: "main" },
  });

  assert.equal(result[0].scene, "headlineCenter");
  assert.equal(result[1].scene, "codeTerminal");
  assert.deepEqual(result[1].params, { code: "Run `npm test`" });
});

test("scene-per-segment plan prefers number scenes for number-heavy segments", async () => {
  const result = await plan({
    ratio: "16:9",
    sceneRegistry: [
      { id: "headlineCenter", ratio: "16:9", params: [{ name: "text", required: true }] },
      {
        id: "statNumber",
        ratio: "16:9",
        params: [
          { name: "number", required: true },
          { name: "caption", required: false },
        ],
      },
    ],
    timeline: {
      ratio: "16:9",
      tracks: [
        {
          id: "narration",
          kind: "audio",
          meta: {
            duration_ms: 1000,
            segments: [
              { id: "s1", text: "42% faster", startMs: 0, endMs: 1000, words: [] },
            ],
          },
        },
      ],
    },
    match: { source: "narration", target: "main" },
  });

  assert.equal(result[0].scene, "statNumber");
  assert.equal(result[0].params?.number, "42%");
});
