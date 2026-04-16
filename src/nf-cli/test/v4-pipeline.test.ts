import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args: string[], expectedStatus = 0, options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
    env: options.env,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

test("v4-pipeline commands manage pipeline.json and keep project state isolated", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v4-pipeline-"));
  try {
    runCli(["project-new", "series-a", `--root=${root}`]);
    runCli(["episode-new", "series-a", "ep01", `--root=${root}`]);

    const empty = JSON.parse(runCli(["pipeline-get", "series-a", "ep01", `--root=${root}`]).stdout);
    assert.equal(empty.ok, true);
    assert.equal(empty.value.version, "0.4");
    assert.deepEqual(empty.value.script.segments, []);

    runCli([
      "script-set",
      "series-a",
      "ep01",
      "--segment=1",
      "--narration=Intro",
      "--visual=Hero card",
      "--role=hook",
      "--logic=Open loop",
      '--arc=["pain","solution"]',
      "--principles-audience=founders",
      "--principles-tone=direct",
      `--root=${root}`,
    ]);
    runCli([
      "audio-set",
      "series-a",
      "ep01",
      "--segment=1",
      "--status=generated",
      "--duration=4.2",
      '--sentences=[{"text":"Intro","start":0,"end":4.2}]',
      "--voice=Xiaoxiao",
      "--speed=1.1",
      `--root=${root}`,
    ]);
    runCli([
      "atom-add",
      "series-a",
      "ep01",
      "--type=component",
      "--name=Counter",
      "--scene=numberCounter",
      "--segment=1",
      '--params={"value":42}',
      `--root=${root}`,
    ]);
    runCli([
      "output-add",
      "series-a",
      "ep01",
      "--name=v1",
      "--file=out.mp4",
      "--duration=12.5",
      "--size=5MB",
      "--changes=initial",
      `--root=${root}`,
    ]);
    runCli(["output-publish", "series-a", "ep01", "--id=1", "--platform=douyin", `--root=${root}`]);
    runCli(["project-config", "series-a", "--set", "brand=NextFrame", `--root=${root}`]);

    const pipelinePath = join(root, "series-a", "ep01", "pipeline.json");
    const pipeline = JSON.parse(readFileSync(pipelinePath, "utf8"));
    assert.deepEqual(pipeline.script.arc, ["pain", "solution"]);
    assert.equal(pipeline.script.principles.audience, "founders");
    assert.equal(pipeline.audio.voice, "Xiaoxiao");
    assert.equal(pipeline.audio.segments[0].sentences[0].text, "Intro");
    assert.equal(pipeline.atoms[0].scene, "numberCounter");
    assert.equal(pipeline.outputs[0].published[0].platform, "douyin");

    const shared = JSON.parse(runCli(["project-config", "series-a", "--get", "brand", `--root=${root}`, "--json"]).stdout);
    assert.equal(shared.value, "NextFrame");

    const segments = JSON.parse(runCli(["segment-list", "series-a", "ep01", `--root=${root}`, "--json"]).stdout);
    assert.deepEqual(segments.segments, []);

    runCli(["project-new", "series-b", `--root=${root}`]);
    runCli(["episode-new", "series-b", "ep01", `--root=${root}`]);
    runCli(["script-set", "series-b", "ep01", "--segment=1", "--narration=Other", `--root=${root}`]);

    const firstPipeline = JSON.parse(readFileSync(join(root, "series-a", "ep01", "pipeline.json"), "utf8"));
    const secondPipeline = JSON.parse(readFileSync(join(root, "series-b", "ep01", "pipeline.json"), "utf8"));
    assert.equal(firstPipeline.script.segments[0].narration, "Intro");
    assert.equal(secondPipeline.script.segments[0].narration, "Other");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audio-synth generates nf-tts artifacts and registers generated audio metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v4-audio-synth-"));
  const fakeBinDir = join(root, "bin");
  try {
    mkdirSync(fakeBinDir, { recursive: true });
    writeFakeVox(fakeBinDir);

    runCli(["project-new", "series-a", `--root=${root}`]);
    runCli(["episode-new", "series-a", "ep01", `--root=${root}`]);
    runCli([
      "script-set",
      "series-a",
      "ep01",
      "--segment=1",
      '--narration=Intro line. Second line.',
      `--root=${root}`,
    ]);

    const env = { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH || ""}` };
    const result = runCli([
      "audio-synth",
      "series-a",
      "ep01",
      "--segment=1",
      "--voice=Xiaoxiao",
      "--backend=edge",
      `--root=${root}`,
      "--json",
    ], 0, { env });
    const payload = JSON.parse(result.stdout);
    const pipeline = JSON.parse(readFileSync(join(root, "series-a", "ep01", "pipeline.json"), "utf8"));

    assert.equal(payload.ok, true);
    assert.equal(payload.duration, 2.5);
    assert.equal(payload.mp3, join(root, "series-a", "ep01", "audio", "seg-1", "seg-1", "seg-1.mp3"));
    assert.equal(payload.timeline, join(root, "series-a", "ep01", "audio", "seg-1", "seg-1", "seg-1.timeline.json"));
    assert.equal(payload.srt, join(root, "series-a", "ep01", "audio", "seg-1", "seg-1", "seg-1.srt"));

    assert.equal(pipeline.audio.voice, "Xiaoxiao");
    assert.equal(pipeline.audio.segments[0].status, "generated");
    assert.equal(pipeline.audio.segments[0].duration, 2.5);
    assert.equal(pipeline.audio.segments[0].file, "audio/seg-1/seg-1/seg-1.mp3");
    assert.equal(pipeline.audio.segments[0].sentences[0].text, "Intro line.");
    assert.equal(pipeline.audio.segments[0].sentences[0].words[0].text, "Intro");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFakeVox(binDir: string) {
  const script = join(binDir, "nf-tts");
  writeFileSync(script, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args[0] !== "synth") process.exit(1);

const text = args[1];
let dir = ".";
let output = "out.mp3";

for (let index = 2; index < args.length; index += 1) {
  if (args[index] === "-d") {
    dir = args[index + 1];
    index += 1;
    continue;
  }
  if (args[index] === "-o") {
    output = args[index + 1];
    index += 1;
  }
}

const stem = output.replace(/\\.mp3$/i, "");
const artifactDir = path.join(dir, stem);
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, output), "mp3");
fs.writeFileSync(path.join(artifactDir, stem + ".timeline.json"), JSON.stringify({
  segments: [
    {
      text: "Intro line.",
      start_ms: 0,
      end_ms: 1250,
      words: [{ word: "Intro", start_ms: 0, end_ms: 600 }],
    },
    {
      text: "Second line.",
      start_ms: 1250,
      end_ms: 2500,
      words: [{ word: "Second", start_ms: 1250, end_ms: 1900 }],
    },
  ],
}, null, 2) + "\\n");
fs.writeFileSync(path.join(artifactDir, stem + ".srt"), "1\\n00:00:00,000 --> 00:00:01,250\\n" + text + "\\n");
`);
  chmodSync(script, 0o755);
}
