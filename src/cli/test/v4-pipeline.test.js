import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args, expectedStatus = 0) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
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
