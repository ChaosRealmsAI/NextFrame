import test from "node:test";
import assert from "node:assert/strict";

import { expand, validate } from "../../nf-core/matches/ducking.js";
import type { Match, Timeline, Track } from "../../nf-core/types.js";

function createTimeline(overrides: {
  tracks?: Track[];
} = {}): Timeline {
  return {
    duration: 5,
    ratio: "16:9",
    width: 1920,
    height: 1080,
    tracks: overrides.tracks ?? [
      {
        id: "narration",
        kind: "audio",
        meta: {
          duration_ms: 5000,
          segments: [
            { id: "s1", text: "one", startMs: 0, endMs: 400, words: [] },
            { id: "s2", text: "two", startMs: 1000, endMs: 1400, words: [] },
            { id: "s3", text: "three", startMs: 2200, endMs: 2600, words: [] },
          ],
        },
      },
      {
        id: "bgm",
        kind: "audio",
        volume: 1,
      },
    ],
    matches: [],
  };
}

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    rule: "ducking",
    source: "narration",
    target: "bgm",
    ...overrides,
  };
}

test("validate rejects missing source", () => {
  const result = validate(createMatch({ source: "missing" }), createTimeline());

  assert.equal(result.ok, false);
  assert.match(result.errors[0]?.code ?? "", /DUCKING_SOURCE_MISSING/);
});

test("validate rejects non-audio target", () => {
  const narrationTrack = createTimeline().tracks?.[0];
  assert.ok(narrationTrack);
  const timeline = createTimeline({
    tracks: [
      narrationTrack,
      {
        id: "main-scene",
        kind: "scene",
        clips: [],
      },
    ],
  });
  const result = validate(createMatch({ target: "main-scene" }), timeline);

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.code).join(","), /DUCKING_TARGET_NOT_AUDIO/);
});

test("validate rejects duckTo outside [0, 1]", () => {
  const result = validate(createMatch({ duckTo: 1.5 }), createTimeline());

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.code).join(","), /DUCKING_LEVEL_INVALID/);
});

test("validate rejects explicit null duckTo and fadeMs", () => {
  const result = validate(createMatch({ duckTo: null, fadeMs: null }), createTimeline());

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.code).join(","), /DUCKING_LEVEL_INVALID/);
  assert.match(result.errors.map((error) => error.code).join(","), /DUCKING_FADE_INVALID/);
});

test("expand on 3 segments produces 6 schedule points, sorted", () => {
  const result = expand(createMatch(), createTimeline());
  const track = result.tracks?.[0] as { duckingSchedule?: Array<{ tMs: number; volume: number }> } | undefined;
  const schedule = track?.duckingSchedule ?? [];

  assert.equal(schedule.length, 6);
  assert.deepEqual(schedule, [
    { tMs: 0, volume: 0.1 },
    { tMs: 450, volume: 1.0 },
    { tMs: 1000, volume: 0.1 },
    { tMs: 1450, volume: 1.0 },
    { tMs: 2200, volume: 0.1 },
    { tMs: 2650, volume: 1.0 },
  ]);
});

test("expand merges close segments when gap is less than 2 * fadeMs", () => {
  const timeline = createTimeline({
    tracks: [
      {
        id: "narration",
        kind: "audio",
        meta: {
          duration_ms: 5000,
          segments: [
            { id: "s1", text: "one", startMs: 0, endMs: 300, words: [] },
            { id: "s2", text: "two", startMs: 360, endMs: 700, words: [] },
            { id: "s3", text: "three", startMs: 1200, endMs: 1500, words: [] },
          ],
        },
      },
      {
        id: "bgm",
        kind: "audio",
      },
    ],
  });
  const result = expand(createMatch({ fadeMs: 50 }), timeline);
  const track = result.tracks?.[0] as { duckingSchedule?: Array<{ tMs: number; volume: number }> } | undefined;
  const schedule = track?.duckingSchedule ?? [];

  assert.deepEqual(schedule, [
    { tMs: 0, volume: 0.1 },
    { tMs: 750, volume: 1.0 },
    { tMs: 1200, volume: 0.1 },
    { tMs: 1550, volume: 1.0 },
  ]);
});

test("expand with fadeMs=0 keeps ducking active across touching segments", () => {
  const timeline = createTimeline({
    tracks: [
      {
        id: "narration",
        kind: "audio",
        meta: {
          duration_ms: 5000,
          segments: [
            { id: "s1", text: "one", startMs: 0, endMs: 100, words: [] },
            { id: "s2", text: "two", startMs: 100, endMs: 200, words: [] },
          ],
        },
      },
      {
        id: "bgm",
        kind: "audio",
      },
    ],
  });
  const result = expand(createMatch({ fadeMs: 0 }), timeline);
  const track = result.tracks?.[0] as { duckingSchedule?: Array<{ tMs: number; volume: number }> } | undefined;
  const schedule = track?.duckingSchedule ?? [];

  assert.deepEqual(schedule, [
    { tMs: 0, volume: 0.1 },
    { tMs: 100, volume: 1.0 },
    { tMs: 100, volume: 0.1 },
    { tMs: 200, volume: 1.0 },
  ]);
});

test("expand is deterministic across repeated calls", () => {
  const timeline = createTimeline();
  const match = createMatch({ duckTo: 0.2, fadeMs: 75 });

  const first = expand(match, timeline);
  const second = expand(match, timeline);

  assert.deepEqual(first, second);
});

test("expand does not silently default explicit null duckTo and fadeMs", () => {
  const result = expand(createMatch({ duckTo: null, fadeMs: null }), createTimeline());

  assert.deepEqual(result, { tracks: [] });
});
