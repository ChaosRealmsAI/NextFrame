import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";
import { existsSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { htmlSlide } from "../src/scenes/htmlSlide.js";
import { htmlSlideCachePath, resolveChromeExecutable } from "../src/scenes/_html-cache.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const CHROME = resolveChromeExecutable();

function runCli(args) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
}

function parsePng(path) {
  return PNG.sync.read(readFileSync(path));
}

function pixelAt(png, x, y) {
  const index = (png.width * y + x) * 4;
  return png.data.slice(index, index + 4);
}

function cleanup(paths) {
  for (const path of paths) {
    if (!path) {
      continue;
    }
    rmSync(path, { force: true });
  }
}

test("html-scene-1: htmlSlide draws fallback accent text when cache is missing", () => {
  const width = 320;
  const height = 180;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const html = "<div style='background:#000;color:#fff'>missing cache</div>";
  cleanup([htmlSlideCachePath(html, width, height)]);
  htmlSlide(0, { html }, ctx);

  const image = ctx.getImageData(0, 0, width, height);
  let accentPixels = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (r > 160 && g > 90 && b < 120) {
      accentPixels += 1;
    }
  }
  assert.ok(accentPixels > 50, `expected fallback text pixels, got ${accentPixels}`);
});

test("html-scene-2: bake-html writes a cache PNG for htmlSlide clips", { skip: !CHROME }, () => {
  const timelinePath = "/tmp/nextframe-html-bake.timeline.json";
  const html = "<div style='width:320px;height:180px;background:#0c2238;color:#f4d35e;display:flex;align-items:center;justify-content:center;font:700 28px sans-serif'>Baked HTML</div>";
  const cachePath = htmlSlideCachePath(html, 320, 180);
  cleanup([timelinePath, cachePath]);

  writeFileSync(timelinePath, JSON.stringify({
    schema: "nextframe/v0.1",
    duration: 2,
    project: { width: 320, height: 180, fps: 30 },
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "html1", start: 0, dur: 2, scene: "htmlSlide", params: { html } }] }],
  }, null, 2));

  const run = runCli(["bake-html", timelinePath, "--json"]);
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.value.baked, 1);
  assert.ok(existsSync(cachePath), `expected cache file at ${cachePath}`);

  cleanup([timelinePath, cachePath]);
});

test("html-scene-3: frame renders baked htmlSlide PNG content", { skip: !CHROME }, () => {
  const timelinePath = "/tmp/nextframe-html-frame.timeline.json";
  const framePath = "/tmp/nextframe-html-frame.png";
  const html = "<div style='width:320px;height:180px;background:#0c2238;color:#f4d35e;display:flex;align-items:center;justify-content:center;font:700 28px sans-serif'>HTML Scene</div>";
  const cachePath = htmlSlideCachePath(html, 320, 180);
  cleanup([timelinePath, framePath, cachePath]);

  writeFileSync(timelinePath, JSON.stringify({
    schema: "nextframe/v0.1",
    duration: 2,
    background: "#000000",
    project: { width: 320, height: 180, fps: 30 },
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "html1", start: 0, dur: 2, scene: "htmlSlide", params: { html } }] }],
  }, null, 2));

  const bake = runCli(["bake-html", timelinePath, "--json"]);
  assert.equal(bake.status, 0, bake.stderr);
  const frame = runCli(["frame", timelinePath, "1.0", framePath, "--json"]);
  assert.equal(frame.status, 0, frame.stderr);
  assert.ok(existsSync(framePath), "expected rendered frame");
  assert.ok(statSync(framePath).size > 1_000, "expected non-trivial PNG size");

  const png = parsePng(framePath);
  const [r, g, b] = pixelAt(png, 10, 10);
  assert.ok(Math.abs(r - 12) <= 8, `unexpected red channel ${r}`);
  assert.ok(Math.abs(g - 34) <= 8, `unexpected green channel ${g}`);
  assert.ok(Math.abs(b - 56) <= 8, `unexpected blue channel ${b}`);

  cleanup([timelinePath, framePath, cachePath]);
});
