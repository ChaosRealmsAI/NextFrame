import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { PNG } from "pngjs";

import { renderFramePNG } from "../src/targets/napi-canvas.js";
import { svgOverlay } from "../src/scenes/svgOverlay.js";
import { markdownSlide } from "../src/scenes/markdownSlide.js";
import { lottieAnim } from "../src/scenes/lottieAnim.js";
import { cachePathForScene } from "../src/scenes/_browser-scenes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

test("browser-scenes-1: each scene renders a fallback when cache is missing", () => {
  const width = 320;
  const height = 180;
  const cases = [
    {
      scene: "svgOverlay",
      render: svgOverlay,
      params: { svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#22c55e" /></svg>' },
    },
    {
      scene: "markdownSlide",
      render: markdownSlide,
      params: { md: "# Missing Cache\n\n- one\n- two", theme: "anthropic-warm" },
    },
    {
      scene: "lottieAnim",
      render: lottieAnim,
      params: { src: "/tmp/nextframe-browser-scenes-missing.json", frame: 7 },
    },
  ];

  for (const entry of cases) {
    removeIfExists(cachePathForScene(entry.scene, width, height, entry.params, 0));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    entry.render(0, entry.params, ctx);
    const png = PNG.sync.read(canvas.toBuffer("image/png"));
    const pixel = pixelAt(png, Math.floor(width / 2), Math.floor(height / 2));
    assert.equal(pixel[3], 255, `${entry.scene} fallback should be opaque`);
  }
});

test("browser-scenes-2: bake-browser bakes mixed browser scenes in one pass", () => {
  const timelinePath = "/tmp/nextframe-browser-mixed.timeline.json";
  const timeline = mixedBrowserTimeline();
  for (const path of expectedMixedCachePaths(timeline)) removeIfExists(path);
  writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

  const run = runCli(["bake-browser", timelinePath, "--json"]);
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.value.baked, 4);
  assert.equal(out.value.jobs.length, 4);
  for (const job of out.value.jobs) {
    assert.ok(existsSync(job.cachePath), `${job.scene} cache missing`);
  }

  unlinkSync(timelinePath);
});

test("browser-scenes-3: frame output changes after baking svgOverlay and markdownSlide", () => {
  const width = 320;
  const height = 180;
  const svgTimelinePath = "/tmp/nextframe-browser-svg.timeline.json";
  const mdTimelinePath = "/tmp/nextframe-browser-md.timeline.json";

  const svgParams = {
    svg: '<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" rx="24" fill="#0f172a"/><circle cx="160" cy="90" r="52" fill="#22c55e"/><text x="160" y="100" font-size="24" text-anchor="middle" fill="#f8fafc">SVG</text></svg>',
  };
  const mdParams = {
    md: "# Browser Slide\n\n## Notes\n\n- **Warm** palette\n- `inline code`\n\n> cached via Chrome",
    theme: "anthropic-warm",
  };

  removeIfExists(cachePathForScene("svgOverlay", width, height, svgParams, 0));
  removeIfExists(cachePathForScene("markdownSlide", width, height, mdParams, 0));

  const svgTimeline = oneSceneTimeline("svgOverlay", svgParams, width, height);
  const mdTimeline = oneSceneTimeline("markdownSlide", mdParams, width, height);
  writeFileSync(svgTimelinePath, JSON.stringify(svgTimeline, null, 2));
  writeFileSync(mdTimelinePath, JSON.stringify(mdTimeline, null, 2));

  const beforeSvg = renderFramePNG(svgTimeline, 0.5, { width, height });
  const beforeMd = renderFramePNG(mdTimeline, 0.5, { width, height });
  assert.equal(beforeSvg.ok, true);
  assert.equal(beforeMd.ok, true);

  const bakeSvg = runCli(["bake-browser", svgTimelinePath, "--json"]);
  const bakeMd = runCli(["bake-browser", mdTimelinePath, "--json"]);
  assert.equal(bakeSvg.status, 0, bakeSvg.stderr);
  assert.equal(bakeMd.status, 0, bakeMd.stderr);

  const afterSvg = renderFramePNG(svgTimeline, 0.5, { width, height });
  const afterMd = renderFramePNG(mdTimeline, 0.5, { width, height });
  assert.equal(afterSvg.ok, true);
  assert.equal(afterMd.ok, true);
  assert.notDeepEqual(afterSvg.value, beforeSvg.value, "svgOverlay should use baked pixels after bake-browser");
  assert.notDeepEqual(afterMd.value, beforeMd.value, "markdownSlide should use baked pixels after bake-browser");
  assert.equal(pixelAt(PNG.sync.read(afterSvg.value), 160, 90)[3], 255);
  assert.equal(pixelAt(PNG.sync.read(afterMd.value), 160, 90)[3], 255);

  unlinkSync(svgTimelinePath);
  unlinkSync(mdTimelinePath);
});

function mixedBrowserTimeline() {
  return {
    schema: "nextframe/v0.1",
    duration: 1,
    background: "#101010",
    project: { width: 320, height: 180, aspectRatio: 16 / 9, fps: 30 },
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [
          { id: "html", start: 0, dur: 1, scene: "htmlSlide", params: { html: '<div style="display:grid;place-items:center;width:100%;height:100%;background:#111827;color:#f9fafb;font:700 32px system-ui">HTML</div>' } },
          { id: "svg", start: 0, dur: 1, scene: "svgOverlay", params: { svg: '<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="#111827"/><path d="M20 150L120 40L210 100L300 30" stroke="#da7756" stroke-width="10" fill="none" stroke-linecap="round"/></svg>' } },
          { id: "md", start: 0, dur: 1, scene: "markdownSlide", params: { md: "# Mixed Bake\n\n- one\n- two\n\n> browser scenes", theme: "anthropic-warm" } },
          { id: "lottie", start: 0, dur: 1, scene: "lottieAnim", params: { src: "", frame: 12 } },
        ],
      },
    ],
  };
}

function expectedMixedCachePaths(timeline) {
  const width = timeline.project.width;
  const height = timeline.project.height;
  return [
    cachePathForScene("htmlSlide", width, height, { html: timeline.tracks[0].clips[0].params.html }),
    cachePathForScene("svgOverlay", width, height, timeline.tracks[0].clips[1].params),
    cachePathForScene("markdownSlide", width, height, timeline.tracks[0].clips[2].params),
    cachePathForScene("lottieAnim", width, height, { src: "", frame: 12 }, 0),
  ];
}

function oneSceneTimeline(scene, params, width, height) {
  return {
    schema: "nextframe/v0.1",
    duration: 1,
    background: "#101010",
    project: { width, height, aspectRatio: width / height, fps: 30 },
    tracks: [{ id: "v1", kind: "video", clips: [{ id: `${scene}-clip`, start: 0, dur: 1, scene, params }] }],
  };
}

function pixelAt(png, x, y) {
  const index = ((y * png.width) + x) * 4;
  return png.data.slice(index, index + 4);
}

function removeIfExists(path) {
  if (!path) return;
  if (existsSync(path)) rmSync(path, { force: true });
}

function runCli(args) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
}
