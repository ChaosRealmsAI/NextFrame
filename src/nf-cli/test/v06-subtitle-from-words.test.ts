import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Match, Timeline } from "../../nf-core/types.js";
import { buildHTML } from "../../nf-core/engine/build.js";
import { expand, validate } from "../../nf-core/matches/subtitle-from-words.js";

function makeTimeline(): Timeline {
  return {
    version: "0.6",
    schema: "nextframe/v0.6",
    width: 1280,
    height: 720,
    fps: 30,
    duration: 1.4,
    ratio: "16:9",
    background: "#000000",
    tracks: [
      {
        id: "narration",
        kind: "audio",
        src: "audio/demo.mp3",
        meta: {
          duration_ms: 1400,
          segments: [
            {
              id: "s1",
              text: "Hello world",
              startMs: 0,
              endMs: 900,
              words: [
                { w: "Hello", s: 0, e: 400 },
                { w: "world", s: 400, e: 900 },
              ],
            },
            {
              id: "s2",
              text: "Again now",
              startMs: 900,
              endMs: 1400,
              words: [
                { w: "Again", s: 900, e: 1150 },
                { w: "now", s: 1150, e: 1400 },
              ],
            },
          ],
        },
      },
      {
        id: "main",
        kind: "scene",
        clips: [],
      },
      {
        id: "subs",
        kind: "subtitle",
        clips: [],
      },
    ],
    matches: [
      {
        rule: "subtitle-from-words",
        source: "narration",
        target: "subs",
        level: "word",
      },
    ],
  };
}

function getMatch(timeline: Timeline): Match {
  const match = timeline.matches?.[0];
  assert.ok(match, "expected a subtitle-from-words match");
  return match;
}

test("subtitle-from-words validate rejects non-audio source", () => {
  const timeline = makeTimeline();
  const match = getMatch(timeline);
  match.source = "main";

  const result = validate(match, timeline);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "INVALID_SOURCE_TRACK"));
});

test("subtitle-from-words validate rejects non-subtitle target", () => {
  const timeline = makeTimeline();
  const match = getMatch(timeline);
  match.target = "main";

  const result = validate(match, timeline);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "INVALID_TARGET_TRACK"));
});

test("subtitle-from-words expand word level emits one clip per word", () => {
  const timeline = makeTimeline();
  const match = getMatch(timeline);

  const expanded = expand(match, timeline);
  const subtitleTrack = expanded.tracks?.[0];
  assert.ok(subtitleTrack);
  assert.equal(subtitleTrack.clips?.length, 4);
});

test("subtitle-from-words expand preserves word start and duration in seconds", () => {
  const timeline = makeTimeline();
  const match = getMatch(timeline);

  const expanded = expand(match, timeline);
  const clips = expanded.tracks?.[0]?.clips || [];
  assert.equal(clips[0]?.start, 0);
  assert.equal(clips[0]?.dur, 0.4);
  assert.equal(clips[2]?.start, 0.9);
  assert.equal(clips[2]?.dur, 0.25);
});

test("subtitle-from-words expand sentence level emits one clip per segment", () => {
  const timeline = makeTimeline();
  const match = getMatch(timeline);
  match.level = "sentence";

  const expanded = expand(match, timeline);
  const clips = expanded.tracks?.[0]?.clips || [];
  assert.equal(clips.length, 2);
  assert.equal(clips[0]?.text, "Hello world");
  assert.equal(clips[1]?.text, "Again now");
});

test("buildHTML injects subtitle shell and narration runtime bootstrap", () => {
  const timeline = makeTimeline();
  const sceneTrack = timeline.tracks?.find((track) => track.id === "main");
  assert.ok(sceneTrack && sceneTrack.kind === "scene");
  if (sceneTrack && Array.isArray(sceneTrack.clips)) {
    sceneTrack.clips.push({
      id: "hero",
      scene: "headlineCenter",
      start: 0,
      dur: 1.4,
      params: {
        text: "Hello world",
        subtitle: "Again now",
      },
    });
  }
  const dir = mkdtempSync(join(tmpdir(), "nf-v06-subtitle-"));
  const outputPath = join(dir, "timeline.html");

  try {
    const result = buildHTML(timeline, outputPath);
    assert.equal(result.ok, true);

    const html = readFileSync(outputPath, "utf8");
    assert.match(html, /<div id="nf-subtitle"/);
    assert.match(html, /__narrationRuntime\.init\(\{ tracks, matches, audioEl \}\);/);
    assert.match(html, /"layers": \[/);
    assert.match(html, /"scene": "headlineCenter"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
