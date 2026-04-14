import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createSourceDocument, slugifyTitle, validateSourceDocument } from "../src/cli/_source.js";

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

test("source-list returns source summaries from library source.json files", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v5-source-list-"));
  try {
    writeSource(root, "alpha-talk", createSourceDocument({
      id: "alpha-talk",
      title: "Alpha Talk",
      url: "https://example.com/alpha",
      durationSec: 91.2,
      format: "720p",
      downloadedAt: "2026-04-13T00:00:00.000Z",
      transcript: { total_sentences: 10, total_words: 80, language: "en", model: "base.en" },
      clips: [{ id: 1, title: "Clip A", from_id: 1, to_id: 3, start_sec: 0, end_sec: 12, duration_sec: 12, file: "clips/clip_01.mp4", subtitles: [] }],
    }));
    writeSource(root, "beta-demo", createSourceDocument({
      id: "beta-demo",
      title: "Beta Demo",
      url: "https://example.com/beta",
      durationSec: 45,
      format: "1080p",
      downloadedAt: "2026-04-13T00:00:00.000Z",
      transcript: null,
      clips: [],
    }));
    mkdirSync(join(root, "ignored-dir"), { recursive: true });

    const result = runCli(["source-list", "--library", root]);
    const rows = JSON.parse(result.stdout);

    assert.deepEqual(rows, [
      {
        id: "alpha-talk",
        title: "Alpha Talk",
        duration: 91.2,
        transcript_status: "ready",
        clip_count: 1,
      },
      {
        id: "beta-demo",
        title: "Beta Demo",
        duration: 45,
        transcript_status: "pending",
        clip_count: 0,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source-link appends linked video atoms to pipeline.json", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v5-source-link-"));
  const library = join(root, "library");
  const sourceDir = join(library, "demo-source");
  try {
    runCli(["project-new", "show-a", `--root=${root}`]);
    runCli(["episode-new", "show-a", "ep01", `--root=${root}`]);

    mkdirSync(join(sourceDir, "clips"), { recursive: true });
    writeFileSync(join(sourceDir, "clips", "clip_01.mp4"), "");
    writeFileSync(join(sourceDir, "clips", "clip_02.mp4"), "");
    writeFileSync(join(sourceDir, "source.json"), JSON.stringify(createSourceDocument({
      id: "demo-source",
      title: "Demo Source",
      url: "https://example.com/demo",
      durationSec: 120,
      format: "720p",
      downloadedAt: "2026-04-13T00:00:00.000Z",
      transcript: { total_sentences: 12, total_words: 110, language: "en", model: "base.en" },
      clips: [
        {
          id: 1,
          title: "Intro",
          from_id: 1,
          to_id: 4,
          start_sec: 0.06,
          end_sec: 8.5,
          duration_sec: 8.44,
          file: "clips/clip_01.mp4",
          subtitles: [{ text: "hello", start_ms: 60, end_ms: 240 }],
        },
        {
          id: 2,
          title: "Outro",
          from_id: 5,
          to_id: 8,
          start_sec: 10,
          end_sec: 18,
          duration_sec: 8,
          file: "clips/clip_02.mp4",
          subtitles: [{ text: "bye", start_ms: 100, end_ms: 260 }],
        },
      ],
    }), null, 2));

    const result = runCli([
      "source-link",
      sourceDir,
      "--project",
      "show-a",
      "--episode",
      "ep01",
      "--root",
      root,
    ]);
    const payload = JSON.parse(result.stdout);
    const pipeline = JSON.parse(readFileSync(join(root, "show-a", "ep01", "pipeline.json"), "utf8"));

    assert.equal(payload.ok, true);
    assert.equal(payload.added, 2);
    assert.equal(pipeline.atoms.length, 2);
    assert.deepEqual(pipeline.atoms.map((atom) => atom.id), [1, 2]);
    assert.deepEqual(pipeline.atoms.map((atom) => atom.name), ["Intro", "Outro"]);
    assert.equal(pipeline.atoms[0].type, "video");
    assert.equal(pipeline.atoms[0].file, resolve(sourceDir, "clips/clip_01.mp4"));
    assert.equal(pipeline.atoms[0].source_ref, join(sourceDir, "source.json"));
    assert.equal(pipeline.atoms[0].source_clip_id, 1);
    assert.equal(pipeline.atoms[0].hasTl, true);
    assert.deepEqual(pipeline.atoms[0].subtitles, [{ text: "hello", start_ms: 60, end_ms: 240 }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source helpers slugify titles and validate source.json schema", () => {
  assert.equal(slugifyTitle("Dario Amodei Interview!"), "dario-amodei-interview");

  const valid = createSourceDocument({
    id: "dario-amodei-interview",
    title: "Dario Amodei Interview",
    url: "https://example.com/video",
    durationSec: 355.5,
    format: "720",
    downloadedAt: "2026-04-13T12:00:00.000Z",
    transcript: null,
    clips: [],
  });
  assert.deepEqual(validateSourceDocument(valid), { ok: true, errors: [] });

  const invalid = {
    ...valid,
    id: "",
    clips: [{ id: 0, title: "", from_id: 0, to_id: 0, start_sec: "bad", end_sec: 1, duration_sec: -1, file: "", subtitles: [{}] }],
  };
  const validation = validateSourceDocument(invalid);
  assert.equal(validation.ok, false);
  assert(validation.errors.some((error) => error.includes("id must be a non-empty string")));
  assert(validation.errors.some((error) => error.includes("clips[0].id")));
  assert(validation.errors.some((error) => error.includes("clips[0].subtitles[0].text")));
});

function writeSource(root, name, source) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.json"), JSON.stringify(source, null, 2) + "\n");
}
