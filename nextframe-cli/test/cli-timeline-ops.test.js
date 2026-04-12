import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

function runJson(args, expectedStatus = 0) {
  const run = runCli(args);
  assert.equal(run.status, expectedStatus, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

function readTimeline(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tmpPath(name) {
  return `/tmp/${name}-${process.pid}-${Date.now()}.json`;
}

function cleanup(path) {
  rmSync(path, { force: true });
}

test("cli-ops-1: new with flags creates an empty timeline scaffold", () => {
  const path = tmpPath("cli-ops-1");
  const out = runJson([
    "new",
    path,
    "--duration=10",
    "--fps=30",
    "--width=1920",
    "--height=1080",
    "--json",
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.output, path);
  assert.ok(existsSync(path));
  const timeline = readTimeline(path);
  assert.equal(timeline.schema, "nextframe/v0.1");
  assert.equal(timeline.duration, 10);
  assert.equal(timeline.project.fps, 30);
  assert.equal(timeline.project.width, 1920);
  assert.equal(timeline.project.height, 1080);
  assert.deepEqual(timeline.tracks, []);
  assert.deepEqual(timeline.chapters, []);
  assert.deepEqual(timeline.markers, []);
  assert.deepEqual(timeline.assets, []);
  cleanup(path);
});

test("cli-ops-2: add-clip with flags auto-creates the track and scene-based id", () => {
  const path = tmpPath("cli-ops-2");
  runJson(["new", path, "--duration=10", "--json"]);
  const out = runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=0",
    "--duration=5",
    "--json",
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.clip_id, "auroraGradient-1");
  const timeline = readTimeline(path);
  assert.equal(timeline.tracks.length, 1);
  assert.equal(timeline.tracks[0].id, "v1");
  assert.deepEqual(timeline.tracks[0].clips[0], {
    id: "auroraGradient-1",
    start: 0,
    dur: 5,
    scene: "auroraGradient",
    params: {},
  });
  cleanup(path);
});

test("cli-ops-3: add-clip preserves symbolic start objects in the saved JSON", () => {
  const path = tmpPath("cli-ops-3");
  runJson(["new", path, "--duration=12", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=0",
    "--duration=5",
    "--json",
  ]);
  const out = runJson([
    "add-clip",
    path,
    "--track=v2",
    "--scene=kineticHeadline",
    '--start={"after":"auroraGradient-1","gap":1}',
    "--duration=3",
    "--json",
  ]);
  assert.equal(out.resolved_start, 6);
  const timeline = readTimeline(path);
  const clip = timeline.tracks[1].clips[0];
  assert.equal(typeof clip.start, "object");
  assert.equal(Array.isArray(clip.start), false);
  assert.ok("after" in clip.start);
  assert.ok("gap" in clip.start);
  assert.notEqual(clip.start, 6);
  cleanup(path);
});

test("cli-ops-4: move-clip updates start and rejects out-of-range moves", () => {
  const path = tmpPath("cli-ops-4");
  runJson(["new", path, "--duration=10", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=3",
    "--duration=4",
    "--json",
  ]);
  runJson(["move-clip", path, "auroraGradient-1", "--to=5", "--json"]);
  let timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].start, 5);
  const err = runJson(["move-clip", path, "auroraGradient-1", "--to=100", "--json"], 2);
  assert.equal(err.ok, false);
  assert.equal(err.error.code, "OUT_OF_RANGE");
  timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].start, 5);
  cleanup(path);
});

test("cli-ops-5: resize-clip updates duration and returns OUT_OF_RANGE when needed", () => {
  const path = tmpPath("cli-ops-5");
  runJson(["new", path, "--duration=12", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=5",
    "--duration=4",
    "--json",
  ]);
  runJson(["resize-clip", path, "auroraGradient-1", "--duration=6", "--json"]);
  let timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].dur, 6);
  const err = runJson(["resize-clip", path, "auroraGradient-1", "--duration=50", "--json"], 2);
  assert.equal(err.ok, false);
  assert.equal(err.error.code, "OUT_OF_RANGE");
  assert.match(err.error.hint, /timeline\.duration is 12/);
  timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].dur, 6);
  cleanup(path);
});

test("cli-ops-6: remove-clip deletes only the selected clip", () => {
  const path = tmpPath("cli-ops-6");
  runJson(["new", path, "--duration=10", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=0",
    "--duration=5",
    "--json",
  ]);
  runJson([
    "add-clip",
    path,
    "--track=v2",
    "--scene=kineticHeadline",
    "--start=5",
    "--duration=3",
    "--json",
  ]);
  const out = runJson(["remove-clip", path, "kineticHeadline-1", "--json"]);
  assert.equal(out.ok, true);
  assert.equal(out.removed, "kineticHeadline-1");
  const timeline = readTimeline(path);
  assert.deepEqual(timeline.tracks[0].clips.map((clip) => clip.id), ["auroraGradient-1"]);
  assert.deepEqual(timeline.tracks[1].clips, []);
  cleanup(path);
});

test("cli-ops-7: set-param updates multiple params and rejects unknown names", () => {
  const path = tmpPath("cli-ops-7");
  runJson(["new", path, "--duration=10", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=kineticHeadline",
    "--start=0",
    "--duration=4",
    "--json",
  ]);
  runJson([
    "set-param",
    path,
    "kineticHeadline-1",
    "--text=GOODBYE",
    "--size=0.2",
    "--json",
  ]);
  let timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].params.text, "GOODBYE");
  assert.equal(timeline.tracks[0].clips[0].params.size, 0.2);
  const err = runJson(["set-param", path, "kineticHeadline-1", "--bogus=x", "--json"], 2);
  assert.equal(err.ok, false);
  assert.equal(err.error.code, "UNKNOWN_PARAM");
  assert.match(err.error.hint, /text/);
  timeline = readTimeline(path);
  assert.equal(timeline.tracks[0].clips[0].params.text, "GOODBYE");
  cleanup(path);
});

test("cli-ops-8: add-marker appends a marker and rejects duplicate ids", () => {
  const path = tmpPath("cli-ops-8");
  runJson(["new", path, "--duration=12", "--json"]);
  const out = runJson([
    "add-marker",
    path,
    "--id=marker-drop",
    "--at=5.0",
    "--label=drop point",
    "--json",
  ]);
  assert.equal(out.ok, true);
  assert.equal(out.marker_id, "marker-drop");
  let timeline = readTimeline(path);
  assert.deepEqual(timeline.markers, [{ id: "marker-drop", at: 5, t: 5, label: "drop point" }]);
  const err = runJson([
    "add-marker",
    path,
    "--id=marker-drop",
    "--at=5.0",
    "--label=drop point",
    "--json",
  ], 2);
  assert.equal(err.ok, false);
  assert.equal(err.error.code, "DUP_MARKER_ID");
  timeline = readTimeline(path);
  assert.equal(timeline.markers.length, 1);
  cleanup(path);
});

test("cli-ops-9: list-clips --json groups clips by track", () => {
  const path = tmpPath("cli-ops-9");
  runJson(["new", path, "--duration=12", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=0",
    "--duration=5",
    "--json",
  ]);
  runJson([
    "add-clip",
    path,
    "--track=v2",
    "--scene=kineticHeadline",
    "--start=6",
    "--duration=3",
    "--params=text=HELLO,size=0.2",
    "--json",
  ]);
  const out = runJson(["list-clips", path, "--json"]);
  assert.equal(out.ok, true);
  assert.equal(out.value.tracks.length, 2);
  assert.deepEqual(out.value.tracks.map((track) => track.id), ["v1", "v2"]);
  assert.equal(out.value.tracks[1].clips[0].id, "kineticHeadline-1");
  assert.equal(out.value.tracks[1].clips[0].params.text, "HELLO");
  cleanup(path);
});

test("cli-ops-10: dup-clip clones a clip onto the same track with the next scene id", () => {
  const path = tmpPath("cli-ops-10");
  runJson(["new", path, "--duration=16", "--json"]);
  runJson([
    "add-clip",
    path,
    "--track=v1",
    "--scene=auroraGradient",
    "--start=0",
    "--duration=5",
    "--params=hueA=180",
    "--json",
  ]);
  const out = runJson(["dup-clip", path, "auroraGradient-1", "--to=8", "--json"]);
  assert.equal(out.ok, true);
  assert.equal(out.clip_id, "auroraGradient-2");
  const timeline = readTimeline(path);
  assert.deepEqual(timeline.tracks[0].clips.map((clip) => clip.id), ["auroraGradient-1", "auroraGradient-2"]);
  assert.equal(timeline.tracks[0].clips[0].start, 0);
  assert.equal(timeline.tracks[0].clips[1].start, 8);
  assert.deepEqual(timeline.tracks[0].clips[1].params, { hueA: 180 });
  cleanup(path);
});
