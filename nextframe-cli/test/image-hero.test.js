import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
}

function writePNG(path) {
  const canvas = createCanvas(8, 6);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#101820";
  ctx.fillRect(0, 0, 8, 6);
  ctx.fillStyle = "#ffb000";
  ctx.fillRect(1, 1, 6, 4);
  writeFileSync(path, canvas.toBuffer("image/png"));
}

test("image-hero-1: scenes --json includes imageHero", () => {
  const run = runCli(["scenes", "--json"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  const sceneIds = result.value.map((scene) => scene.id);
  assert.ok(sceneIds.includes("imageHero"));
});

test("image-hero-2: frame renders a timeline that uses imageHero with an existing PNG", () => {
  const dir = mkdtempSync(join(tmpdir(), "nextframe-image-hero-"));
  const imagePath = join(dir, "hero.png");
  const timelinePath = join(dir, "timeline.json");
  const outPath = join(dir, "frame.png");

  try {
    writePNG(imagePath);
    writeFileSync(timelinePath, JSON.stringify({
      schema: "nextframe/v0.1",
      duration: 3,
      background: "#000000",
      project: { width: 320, height: 180, fps: 30, aspectRatio: 16 / 9 },
      chapters: [],
      markers: [],
      tracks: [
        {
          id: "v1",
          kind: "video",
          clips: [
            {
              id: "imageHero-1",
              start: 0,
              dur: 3,
              scene: "imageHero",
              params: { src: imagePath, fit: "contain", zoomStart: 1, zoomEnd: 1.05 },
            },
          ],
        },
      ],
      assets: [],
    }, null, 2));

    const run = runCli(["frame", timelinePath, "1.0", outPath, "--json"]);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.value.path, outPath);
    assert.ok(existsSync(outPath));
    assert.ok(statSync(outPath).size > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
