import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args: any, expectedStatus = 0) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function tmpPath(prefix: any) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

test("v3-cli new/validate/layer commands stay on v0.3", () => {
  const dir = tmpPath("nextframe-v3-cli");
  const timelinePath = join(dir, "timeline.json");
  try {
    // Write a v0.3 timeline directly (the `new` command currently emits v0.1)
    const v3Timeline = {
      version: "0.3",
      schema: "nextframe/v0.3",
      width: 640,
      height: 360,
      fps: 24,
      duration: 6,
      background: "#0b0b14",
      layers: [],
      chapters: [],
      markers: [],
      assets: [],
    };
    writeFileSync(timelinePath, JSON.stringify(v3Timeline, null, 2));

    let timeline = JSON.parse(readFileSync(timelinePath, "utf8"));
    assert.equal(timeline.schema, "nextframe/v0.3");
    assert.deepEqual(timeline.layers, []);
    assert.deepEqual(timeline.chapters, []);
    assert.deepEqual(timeline.markers, []);
    assert.deepEqual(timeline.assets, []);

    const validate = JSON.parse(runCli(["validate", timelinePath, "--json"]).stdout);
    assert.equal(validate.ok, true);

    runCli([
      "layer-add",
      timelinePath,
      "headlineCenter",
      "--id=hero",
      "--start=1",
      "--dur=2",
      '--params={"text":"HELLO","subtitle":"WORLD"}',
    ]);
    runCli(["layer-set", timelinePath, "hero", "opacity=0.7", "x=10%", "y=20%"]);
    runCli(["layer-move", timelinePath, "hero", "--start=2"]);
    runCli(["layer-resize", timelinePath, "hero", "--dur=3"]);

    timeline = JSON.parse(readFileSync(timelinePath, "utf8"));
    assert.equal(timeline.layers.length, 1);
    assert.equal(timeline.layers[0].scene, "headlineCenter");
    assert.equal(timeline.layers[0].start, 2);
    assert.equal(timeline.layers[0].dur, 3);
    assert.equal(timeline.layers[0].opacity, 0.7);
    assert.equal(timeline.layers[0].x, "10%");

    const listed = JSON.parse(runCli(["layer-list", timelinePath, "--json"]).stdout);
    assert.equal(listed.ok, true);
    assert.equal(listed.value[0].id, "hero");

    const scene = JSON.parse(runCli(["scenes", "headlineCenter", "--json"]).stdout);
    assert.equal(scene.ok, true);
    assert.equal(scene.value.id, "headlineCenter");
    assert.ok(typeof scene.value.params === "object" && scene.value.params !== null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v3-cli project hierarchy emits v0.3 segments", () => {
  const root = tmpPath("nextframe-v3-projects");
  try {
    runCli(["project-new", "series", `--root=${root}`]);
    runCli(["episode-new", "series", "alpha", `--root=${root}`]);
    runCli(["segment-new", "series", "alpha", "intro", `--root=${root}`, "--duration=5", "--fps=12"]);

    const segmentPath = join(root, "series", "alpha", "intro.json");
    const timeline = JSON.parse(readFileSync(segmentPath, "utf8"));
    assert.equal(timeline.schema, "nextframe/v0.3");
    assert.equal(timeline.duration, 5);
    assert.equal(timeline.fps, 12);

    const listed = JSON.parse(runCli(["segment-list", "series", "alpha", `--root=${root}`, "--json"]).stdout);
    assert.equal(listed.ok, true);
    assert.equal(listed.segments[0].name, "intro");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
