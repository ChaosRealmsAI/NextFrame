import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const AUDIO_FIXTURE = resolve(ROOT, "examples/cc-e01-slide01/slide01-audio.mp3");

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
    project: { width: 160, height: 90, aspectRatio: 16 / 9, fps: 12 },
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [{ id: "bg", start: 0, dur: 2, scene: "auroraGradient", params: {} }],
      },
      {
        id: "v2",
        kind: "video",
        clips: [{ id: "title", start: 0.25, dur: 1.25, scene: "textOverlay", params: { text: "CLI EXPORT" } }],
      },
    ],
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

function createEpisodeTree(homeDir, { project, episode, segment, timeline }) {
  const root = join(homeDir, "NextFrame", "projects");
  const projectDir = join(root, project);
  const episodeDir = join(projectDir, episode);
  mkdirSync(episodeDir, { recursive: true });
  writeFileSync(join(projectDir, "project.json"), JSON.stringify({
    name: project,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  }));
  writeFileSync(join(episodeDir, "episode.json"), JSON.stringify({
    name: episode,
    order: 1,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  }));
  writeFileSync(join(episodeDir, `${segment}.json`), JSON.stringify(timeline));
  return {
    episodeDir,
    mp4Path: join(episodeDir, `${segment}.mp4`),
    framePath: join(episodeDir, ".frames", `${segment}-t3.50.png`),
    exportsPath: join(episodeDir, ".exports", "exports.json"),
  };
}

function ffprobeJson(path) {
  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    path,
  ], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(probe.status, 0, probe.stderr);
  return JSON.parse(probe.stdout);
}

test("cli-export-1: render --audio muxes video and audio streams", () => {
  const tlPath = writeTimeline("cli-export-1");
  const outPath = uniquePath("cli-export-1", "mp4");
  try {
    const run = runCli(["render", tlPath, outPath, `--audio=${AUDIO_FIXTURE}`, "--json"]);
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.ok, true);

    const parsed = ffprobeJson(outPath);
    const videoStreams = (parsed.streams || []).filter((stream) => stream.codec_type === "video");
    const audioStreams = (parsed.streams || []).filter((stream) => stream.codec_type === "audio");
    assert.equal(videoStreams.length, 1);
    assert.equal(audioStreams.length, 1);
    assert.equal(videoStreams[0].codec_name, "h264");
    assert.equal(audioStreams[0].codec_name, "aac");
  } finally {
    cleanup(tlPath, outPath);
  }
});

test("cli-export-2: render --target accepts ffmpeg and rejects unknown targets", () => {
  const tlPath = writeTimeline("cli-export-2");
  const okOutPath = uniquePath("cli-export-2-ok", "mp4");
  const badOutPath = uniquePath("cli-export-2-bad", "mp4");
  try {
    const okRun = runCli(["render", tlPath, okOutPath, "--target=ffmpeg", "--json"]);
    assert.equal(okRun.status, 0, okRun.stderr);
    assert.equal(JSON.parse(okRun.stdout).ok, true);
    assert.ok(existsSync(okOutPath));

    const badRun = runCli(["render", tlPath, badOutPath, "--target=bogus", "--json"]);
    assert.notEqual(badRun.status, 0);
    const badOut = JSON.parse(badRun.stdout);
    assert.equal(badOut.ok, false);
    assert.equal(badOut.error.code, "UNKNOWN_TARGET");
    assert.ok(badOut.error.hint.includes("ffmpeg"), `hint should mention ffmpeg: ${badOut.error.hint}`);
    assert.ok(!existsSync(badOutPath));
  } finally {
    cleanup(tlPath, okOutPath, badOutPath);
  }
});

test("cli-export-3: render --crf validates and still writes output", () => {
  const tlPath = writeTimeline("cli-export-3");
  const okOutPath = uniquePath("cli-export-3-ok", "mp4");
  const badOutPath = uniquePath("cli-export-3-bad", "mp4");
  try {
    const okRun = runCli(["render", tlPath, okOutPath, "--crf=28", "--json"]);
    assert.equal(okRun.status, 0, okRun.stderr);
    assert.equal(JSON.parse(okRun.stdout).ok, true);
    assert.ok(existsSync(okOutPath));
    assert.ok(statSync(okOutPath).size > 0);

    const badRun = runCli(["render", tlPath, badOutPath, "--crf=99", "--json"]);
    assert.notEqual(badRun.status, 0);
    const badOut = JSON.parse(badRun.stdout);
    assert.equal(badOut.ok, false);
    assert.equal(badOut.error.code, "BAD_CRF");
    assert.equal(badOut.error.hint, "0..51");
    assert.ok(!existsSync(badOutPath));
  } finally {
    cleanup(tlPath, okOutPath, badOutPath);
  }
});

test("cli-export-4: probe returns structured metadata and missing files fail cleanly", () => {
  const tlPath = writeTimeline("cli-export-4");
  const outPath = uniquePath("cli-export-4", "mp4");
  const missingPath = uniquePath("cli-export-4-missing", "mp4");
  try {
    const render = runCli(["render", tlPath, outPath, "--json"]);
    assert.equal(render.status, 0, render.stderr);

    const probe = runCli(["probe", outPath, "--json"]);
    assert.equal(probe.status, 0, probe.stderr);
    const probeOut = JSON.parse(probe.stdout);
    assert.equal(probeOut.ok, true);
    assert.equal(probeOut.value.video.codec, "h264");
    assert.ok(probeOut.value.streams >= 1);

    const missing = runCli(["probe", missingPath, "--json"]);
    assert.notEqual(missing.status, 0);
    const missingOut = JSON.parse(missing.stdout);
    assert.equal(missingOut.ok, false);
    assert.equal(missingOut.error.code, "NOT_FOUND");
  } finally {
    cleanup(tlPath, outPath);
  }
});

test("cli-export-5: 3-level render and frame write to episode storage and exports reads the log", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "cli-export-home-"));
  const timeline = tinyTimeline();
  timeline.duration = 4;
  timeline.tracks[0].clips[0].dur = 4;
  timeline.tracks[1].clips[0].dur = 3;
  const episode = createEpisodeTree(homeDir, {
    project: "show",
    episode: "ep01-canvas-intro",
    segment: "showcase",
    timeline,
  });
  const env = { ...process.env, HOME: homeDir };

  try {
    const render = runCli(["render", "show", "ep01-canvas-intro", "showcase", "--json"], { env });
    assert.equal(render.status, 0, render.stderr);
    const renderOut = JSON.parse(render.stdout);
    assert.equal(renderOut.ok, true);
    assert.equal(renderOut.value.outputPath, episode.mp4Path);
    assert.ok(existsSync(episode.mp4Path));

    const exportLog = JSON.parse(readFileSync(episode.exportsPath, "utf8"));
    assert.equal(exportLog.length, 1);
    assert.equal(exportLog[0].segment, "showcase");
    assert.equal(exportLog[0].path, "showcase.mp4");
    assert.equal(exportLog[0].duration, 4);
    assert.ok(exportLog[0].size > 0);
    assert.match(exportLog[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);

    const frame = runCli(["frame", "show", "ep01-canvas-intro", "showcase", "3.5", "--json"], { env });
    assert.equal(frame.status, 0, frame.stderr);
    const frameOut = JSON.parse(frame.stdout);
    assert.equal(frameOut.ok, true);
    assert.equal(frameOut.value.path, episode.framePath);
    assert.ok(existsSync(episode.framePath));

    const exportsRun = runCli(["exports", "show", "ep01-canvas-intro", "--json"], { env });
    assert.equal(exportsRun.status, 0, exportsRun.stderr);
    const exportsOut = JSON.parse(exportsRun.stdout);
    assert.equal(exportsOut.ok, true);
    assert.equal(exportsOut.path, episode.exportsPath);
    assert.equal(exportsOut.exports.length, 1);
    assert.equal(exportsOut.exports[0].path, "showcase.mp4");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
