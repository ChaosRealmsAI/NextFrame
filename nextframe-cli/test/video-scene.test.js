import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PNG } from "pngjs";

import { renderFramePNG } from "../src/targets/napi-canvas.js";
import { cachedFramePath, normalizeSourceFps, quantizeVideoTime } from "../src/scenes/_video-cache.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const FALLBACK_PIXEL = [0x1a, 0x15, 0x10, 0xff];

function runCli(args, opts = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });
}

function decodePng(buffer) {
  return PNG.sync.read(buffer);
}

function pixelAt(image, x, y) {
  const index = (image.width * y + x) * 4;
  return [...image.data.slice(index, index + 4)];
}

function makeWorkDir() {
  return mkdtempSync(join(tmpdir(), "nextframe-video-scene-"));
}

function makeSourceTimeline() {
  return {
    schema: "nextframe/v0.1",
    duration: 1,
    background: "#05070b",
    project: { width: 96, height: 54, aspectRatio: 16 / 9, fps: 6 },
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [{
          id: "bg",
          start: 0,
          dur: 1,
          scene: "auroraGradient",
          params: { hueA: 28, hueB: 168, hueC: 212, intensity: 1.2, grain: 0.02 },
        }],
      },
    ],
  };
}

function makeVideoClipTimeline(src) {
  return {
    schema: "nextframe/v0.1",
    duration: 1,
    background: "#000000",
    project: { width: 96, height: 54, aspectRatio: 16 / 9, fps: 6 },
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [{
          id: "video-1",
          start: 0,
          dur: 1,
          scene: "videoClip",
          params: { src, offset: 0, fps: 6 },
        }],
      },
    ],
  };
}

function expectedCachePaths(src, width, height, clipDuration, timelineFps, sourceFps) {
  const paths = [];
  const frameCount = Math.max(1, Math.ceil(clipDuration * timelineFps - 1e-9));
  const safeSourceFps = normalizeSourceFps(sourceFps);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const localT = frameIndex / timelineFps;
    const qt = quantizeVideoTime(localT, safeSourceFps);
    paths.push(cachedFramePath(src, qt, width, height));
  }
  return [...new Set(paths)];
}

function buildFixture() {
  const workDir = makeWorkDir();
  const sourceTimelinePath = join(workDir, "source.timeline.json");
  const sourceVideoPath = join(workDir, "source.mp4");
  const clipTimelinePath = join(workDir, "clip.timeline.json");
  writeFileSync(sourceTimelinePath, JSON.stringify(makeSourceTimeline(), null, 2));
  writeFileSync(clipTimelinePath, JSON.stringify(makeVideoClipTimeline(sourceVideoPath), null, 2));
  const cachePaths = expectedCachePaths(sourceVideoPath, 96, 54, 1, 6, 6);
  return { workDir, sourceTimelinePath, sourceVideoPath, clipTimelinePath, cachePaths };
}

function cleanupFixture(fixture) {
  for (const cachePath of fixture.cachePaths) {
    if (existsSync(cachePath)) unlinkSync(cachePath);
  }
  rmSync(fixture.workDir, { recursive: true, force: true });
}

test("video-scene-1: videoClip renders fallback when cache is missing", () => {
  const timeline = makeVideoClipTimeline("/tmp/nextframe-video-scene-missing.mp4");
  const rendered = renderFramePNG(timeline, 0.5);
  assert.equal(rendered.ok, true);
  const image = decodePng(rendered.value);
  assert.deepEqual(pixelAt(image, 2, 2), FALLBACK_PIXEL);
});

test("video-scene-2: bake-video extracts cached PNG frames from a rendered source video", () => {
  const fixture = buildFixture();
  try {
    const render = runCli(["render", fixture.sourceTimelinePath, fixture.sourceVideoPath, "--json"]);
    assert.equal(render.status, 0, render.stderr);
    assert.equal(JSON.parse(render.stdout).ok, true);

    const bake = runCli(["bake-video", fixture.clipTimelinePath, "--json"]);
    assert.equal(bake.status, 0, bake.stderr);
    const out = JSON.parse(bake.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.value.clipsScanned, 6);
    assert.equal(out.value.extracted, 6);
    assert.equal(out.value.skipped, 0);
    for (const cachePath of fixture.cachePaths) {
      assert.ok(existsSync(cachePath), `expected cache file ${cachePath}`);
    }
  } finally {
    cleanupFixture(fixture);
  }
});

test("video-scene-3: frame output switches from fallback to baked video after bake-video", () => {
  const fixture = buildFixture();
  const beforePath = join(fixture.workDir, "before.png");
  const afterPath = join(fixture.workDir, "after.png");
  try {
    const render = runCli(["render", fixture.sourceTimelinePath, fixture.sourceVideoPath, "--json"]);
    assert.equal(render.status, 0, render.stderr);

    const before = runCli(["frame", fixture.clipTimelinePath, "0.5", beforePath, "--json"]);
    assert.equal(before.status, 0, before.stderr);
    const beforePng = decodePng(readFileSync(beforePath));
    assert.deepEqual(pixelAt(beforePng, 2, 2), FALLBACK_PIXEL);

    const bake = runCli(["bake-video", fixture.clipTimelinePath, "--json"]);
    assert.equal(bake.status, 0, bake.stderr);

    const after = runCli(["frame", fixture.clipTimelinePath, "0.5", afterPath, "--json"]);
    assert.equal(after.status, 0, after.stderr);
    const afterBuffer = readFileSync(afterPath);
    const afterPng = decodePng(afterBuffer);
    assert.notDeepEqual(pixelAt(afterPng, 2, 2), FALLBACK_PIXEL);
    assert.notDeepEqual(afterBuffer, readFileSync(beforePath));
  } finally {
    cleanupFixture(fixture);
  }
});
