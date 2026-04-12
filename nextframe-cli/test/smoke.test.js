// Smoke test for nextframe-cli walking skeleton.
// Runs: node --test test/
// What it checks:
//   1. scenes subcommand lists 21 scenes with META
//   2. validate examples/minimal.timeline.json → ok
//   3. validate examples/launch.timeline.json → ok
//   4. frame examples/minimal 1.5 → valid PNG
//   5. describe examples/launch 6.0 → non-empty visible_clips
//   6. render examples/minimal → valid h264 1920x1080 mp4

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const MINIMAL = resolve(ROOT, "examples/minimal.timeline.json");
const LAUNCH = resolve(ROOT, "examples/launch.timeline.json");

function run(args) {
  const r = spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function runJSON(args) {
  const r = run([...args, "--json"]);
  if (r.code !== 0) throw new Error(`cli failed exit=${r.code}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

test("scenes lists 21 entries with full META", () => {
  const r = runJSON(["scenes"]);
  assert.equal(r.ok, true);
  assert.equal(r.value.length, 21);
  for (const s of r.value) {
    assert.ok(s.id, `scene missing id`);
    assert.ok(s.category, `${s.id} missing category`);
    assert.ok(Array.isArray(s.params), `${s.id} params not array`);
  }
});

test("validate minimal → ok", () => {
  const r = runJSON(["validate", MINIMAL]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("validate launch → ok", () => {
  const r = runJSON(["validate", LAUNCH]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("frame minimal t=1.5 → PNG", () => {
  const out = "/tmp/smoke-minimal-t1.5.png";
  const r = run(["frame", MINIMAL, "1.5", out]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(out), "png not created");
  const size = statSync(out).size;
  assert.ok(size > 10_000, `png too small: ${size}`);
});

test("describe launch t=6 → visible clips", () => {
  const r = runJSON(["describe", LAUNCH, "6"]);
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.value.active_clips));
  assert.ok(r.value.active_clips.length >= 1);
});

test("timeline ops round trip: new → set-param → move-clip → resize → remove → add", () => {
  const p = "/tmp/smoke-ops.json";
  run(["new", p]);
  let r = runJSON(["set-param", p, "clip-1", "hueA=180"]);
  assert.equal(r.ok, true);
  r = runJSON(["set-param", p, "clip-1", "intensity=1.2"]);
  assert.equal(r.ok, true);
  r = runJSON(["resize-clip", p, "clip-1", "3"]);
  assert.equal(r.ok, true);
  r = runJSON(["move-clip", p, "clip-1", "1"]);
  assert.equal(r.ok, true);
  // The default timeline has duration=5 clip-1 moves to 1 so 1+3=4 ≤ 5 ok
  r = runJSON(["remove-clip", p, "clip-1"]);
  assert.equal(r.ok, true);
  r = runJSON(["add-clip", p, "v1", '{"id":"c2","start":0,"dur":5,"scene":"starfield","params":{}}']);
  assert.equal(r.ok, true);
  // Final timeline renders
  const tl = JSON.parse(run(["validate", p, "--json"]).stdout);
  assert.equal(tl.ok, true);
});

test("render minimal → h264 1920x1080 mp4", () => {
  const out = "/tmp/smoke-minimal.mp4";
  const r = run(["render", MINIMAL, out]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(out));
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0",
     "-show_entries", "stream=codec_name,width,height",
     "-of", "json", out],
    { encoding: "utf8" }
  );
  assert.equal(probe.status, 0, probe.stderr);
  const j = JSON.parse(probe.stdout);
  const s = j.streams[0];
  assert.equal(s.codec_name, "h264");
  assert.equal(s.width, 1920);
  assert.equal(s.height, 1080);
});
