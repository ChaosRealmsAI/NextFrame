import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const MINIMAL = resolve(ROOT, "examples/minimal.timeline.json");
const AUDIO_FIXTURE = resolve(ROOT, "examples/cc-e01-slide01/slide01-audio.mp3");
const SHARED_PNG = "/tmp/smoke-minimal-t1.5.png";

function runCli(args, opts = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });
}

function tinyTimeline() {
  return {
    schema: "nextframe/v0.1",
    duration: 2,
    background: "#101010",
    project: { width: 320, height: 180, aspectRatio: 16 / 9, fps: 30 },
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [{ id: "bg", start: 0, dur: 2, scene: "auroraGradient", params: {} }],
      },
    ],
    assets: [],
  };
}

function uniquePath(label, ext) {
  return join(tmpdir(), `${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
}

function writeTimeline(label) {
  const path = uniquePath(label, "timeline.json");
  writeFileSync(path, JSON.stringify(tinyTimeline()));
  return path;
}

function cleanup(...paths) {
  for (const path of paths) {
    if (path && existsSync(path)) unlinkSync(path);
  }
}

function ensurePngFixture() {
  if (existsSync(SHARED_PNG)) return SHARED_PNG;
  const run = runCli(["frame", MINIMAL, "1.5", SHARED_PNG, "--json"]);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(SHARED_PNG), "frame fixture should exist");
  return SHARED_PNG;
}

test("cli-assets-1: import-image adds an image asset with a stable id", () => {
  const tlPath = writeTimeline("cli-assets-1");
  const imagePath = ensurePngFixture();
  try {
    const run = runCli(["import-image", tlPath, imagePath, "--json"]);
    assert.equal(run.status, 0, run.stderr);

    const out = JSON.parse(run.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.value.kind, "image");
    assert.equal(out.value.path, imagePath);
    assert.match(out.value.id, /^img-smoke-minimal-t1-5-\d+$/);

    const timeline = JSON.parse(readFileSync(tlPath, "utf8"));
    assert.equal(timeline.assets.length, 1);
    assert.deepEqual(timeline.assets[0], out.value);
  } finally {
    cleanup(tlPath);
  }
});

test("cli-assets-2: import-audio validates the path and appends an audio asset", () => {
  const tlPath = writeTimeline("cli-assets-2");
  try {
    const run = runCli(["import-audio", tlPath, AUDIO_FIXTURE, "--json"]);
    assert.equal(run.status, 0, run.stderr);

    const out = JSON.parse(run.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.value.kind, "audio");
    assert.equal(out.value.path, AUDIO_FIXTURE);
    assert.match(out.value.id, /^aud-slide01-audio-\d+$/);

    const timeline = JSON.parse(readFileSync(tlPath, "utf8"));
    assert.equal(timeline.assets.length, 1);
    assert.deepEqual(timeline.assets[0], out.value);
  } finally {
    cleanup(tlPath);
  }
});

test("cli-assets-3: list-assets groups assets by kind, supports --json, and flags missing files", () => {
  const tlPath = writeTimeline("cli-assets-3");
  const sourceImage = ensurePngFixture();
  const imagePath = uniquePath("cli-assets-3-image", "png");
  copyFileSync(sourceImage, imagePath);
  try {
    let run = runCli(["import-image", tlPath, imagePath, "--json"]);
    assert.equal(run.status, 0, run.stderr);
    const importedImage = JSON.parse(run.stdout).value;

    run = runCli(["import-audio", tlPath, AUDIO_FIXTURE, "--json"]);
    assert.equal(run.status, 0, run.stderr);
    const importedAudio = JSON.parse(run.stdout).value;

    unlinkSync(imagePath);

    const plain = runCli(["list-assets", tlPath]);
    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, new RegExp(`\\[image\\] ${importedImage.id}  ${escapeRegExp(importedImage.path)}  ⚠ missing`));
    assert.match(plain.stdout, new RegExp(`\\[audio\\] ${importedAudio.id}  ${escapeRegExp(importedAudio.path)}`));

    const json = runCli(["list-assets", tlPath, "--json"]);
    assert.equal(json.status, 0, json.stderr);
    const out = JSON.parse(json.stdout);
    assert.equal(out.ok, true);
    assert.deepEqual(
      out.value.assets.map((asset) => asset.kind),
      ["image", "audio"],
    );
    assert.equal(out.value.assets[0].missing, true);
    assert.equal(out.value.assets[1].missing, false);
  } finally {
    cleanup(tlPath, imagePath);
  }
});

test("cli-assets-4: remove-asset removes by id and the asset no longer appears in list-assets", () => {
  const tlPath = writeTimeline("cli-assets-4");
  const imagePath = ensurePngFixture();
  try {
    let run = runCli(["import-image", tlPath, imagePath, "--json"]);
    assert.equal(run.status, 0, run.stderr);
    const importedImage = JSON.parse(run.stdout).value;

    run = runCli(["import-audio", tlPath, AUDIO_FIXTURE, "--json"]);
    assert.equal(run.status, 0, run.stderr);
    const importedAudio = JSON.parse(run.stdout).value;

    const removed = runCli(["remove-asset", tlPath, importedImage.id, "--json"]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.deepEqual(JSON.parse(removed.stdout), { ok: true, value: { removed: importedImage.id } });

    const listed = runCli(["list-assets", tlPath, "--json"]);
    assert.equal(listed.status, 0, listed.stderr);
    const out = JSON.parse(listed.stdout);
    assert.equal(out.ok, true);
    assert.deepEqual(out.value.assets.map((asset) => asset.id), [importedAudio.id]);

    const timeline = JSON.parse(readFileSync(tlPath, "utf8"));
    assert.deepEqual(timeline.assets.map((asset) => asset.id), [importedAudio.id]);
  } finally {
    cleanup(tlPath);
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
