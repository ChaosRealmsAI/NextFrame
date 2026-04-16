import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { createSourceDocument, slugifyTitle, validateSourceDocument } from "../src/commands/_helpers/_source.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args: string[], expectedStatus = 0, options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, ...options.env },
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
    assert.deepEqual(pipeline.atoms.map((atom: Record<string, unknown>) => atom.id), [1, 2]);
    assert.deepEqual(pipeline.atoms.map((atom: Record<string, unknown>) => atom.name), ["Intro", "Outro"]);
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

test("source-download stores a downloaded source inside the episode sources directory", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v5-source-download-"));
  const mockBin = createMockSourceBin(root);
  try {
    runCli(["project-new", "show-a", `--root=${root}`]);
    runCli(["episode-new", "show-a", "ep01", `--root=${root}`]);

    const result = runCli([
      "source-download",
      "show-a",
      "ep01",
      "--url",
      "https://example.com/demo",
      `--root=${root}`,
      "--json",
    ], 0, { env: { NEXTFRAME_SOURCE_BIN: mockBin } });
    const payload = JSON.parse(result.stdout);
    const sourceDir = join(root, "show-a", "ep01", "sources", "mock-video");
    const source = JSON.parse(readFileSync(join(sourceDir, "source.json"), "utf8"));

    assert.equal(payload.ok, true);
    assert.equal(payload.source_dir, sourceDir);
    assert.equal(source.id, "mock-video");
    assert.equal(source.title, "Mock Video");
    assert.equal(source.url, "https://example.com/demo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source-transcribe resolves an episode source by name and updates source.json", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v5-source-transcribe-"));
  const mockBin = createMockSourceBin(root);
  const sourceDir = join(root, "show-a", "ep01", "sources", "demo-source");
  try {
    runCli(["project-new", "show-a", `--root=${root}`]);
    runCli(["episode-new", "show-a", "ep01", `--root=${root}`]);

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.mp4"), "");
    writeFileSync(join(sourceDir, "source.json"), JSON.stringify(createSourceDocument({
      id: "demo-source",
      title: "Demo Source",
      url: "https://example.com/demo",
      durationSec: 120,
      format: "720p",
      downloadedAt: "2026-04-13T00:00:00.000Z",
      transcript: null,
      clips: [],
    }), null, 2));

    const result = runCli([
      "source-transcribe",
      "show-a",
      "ep01",
      "--source",
      "demo-source",
      `--root=${root}`,
      "--json",
    ], 0, { env: { NEXTFRAME_SOURCE_BIN: mockBin } });
    const payload = JSON.parse(result.stdout);
    const source = JSON.parse(readFileSync(join(sourceDir, "source.json"), "utf8"));

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.transcript, {
      total_sentences: 2,
      total_words: 4,
      language: "auto",
      model: "base.en",
    });
    assert.deepEqual(source.transcript, payload.transcript);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source-cut writes clips into the episode clips directory and appends pipeline atoms", () => {
  const root = mkdtempSync(join(tmpdir(), "nextframe-v5-source-cut-"));
  const mockBin = createMockSourceBin(root);
  const sourceDir = join(root, "show-a", "ep01", "sources", "demo-source");
  const planPath = join(root, "cut-plan.json");
  try {
    runCli(["project-new", "show-a", `--root=${root}`]);
    runCli(["episode-new", "show-a", "ep01", `--root=${root}`]);

    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "source.mp4"), "");
    writeFileSync(join(sourceDir, "source.json"), JSON.stringify(createSourceDocument({
      id: "demo-source",
      title: "Demo Source",
      url: "https://example.com/demo",
      durationSec: 120,
      format: "720p",
      downloadedAt: "2026-04-13T00:00:00.000Z",
      transcript: { total_sentences: 2, total_words: 4, language: "en", model: "base.en" },
      clips: [],
    }), null, 2));
    writeFileSync(join(sourceDir, "sentences.json"), JSON.stringify([
      {
        id: 1,
        text: "hello there",
        start_sec: 0,
        end_sec: 1.5,
        words: [
          { text: "hello", start_sec: 0, end_sec: 0.7 },
          { text: "there", start_sec: 0.8, end_sec: 1.5 },
        ],
      },
      {
        id: 2,
        text: "general kenobi",
        start_sec: 2,
        end_sec: 3.2,
        words: [
          { text: "general", start_sec: 2, end_sec: 2.6 },
          { text: "kenobi", start_sec: 2.7, end_sec: 3.2 },
        ],
      },
    ], null, 2));
    writeFileSync(planPath, JSON.stringify([{ from_id: 1, to_id: 2 }], null, 2));

    const result = runCli([
      "source-cut",
      "show-a",
      "ep01",
      "--source",
      "demo-source",
      "--plan",
      planPath,
      `--root=${root}`,
      "--json",
    ], 0, { env: { NEXTFRAME_SOURCE_BIN: mockBin } });
    const payload = JSON.parse(result.stdout);
    const episodeClipsDir = join(root, "show-a", "ep01", "clips");
    const pipeline = JSON.parse(readFileSync(join(root, "show-a", "ep01", "pipeline.json"), "utf8"));
    const source = JSON.parse(readFileSync(join(sourceDir, "source.json"), "utf8"));

    assert.equal(payload.ok, true);
    assert.equal(payload.clips_dir, episodeClipsDir);
    assert.equal(source.clips.length, 1);
    assert.equal(source.clips[0].file, join(episodeClipsDir, "clip_01.mp4"));
    assert.equal(pipeline.atoms.length, 1);
    assert.equal(pipeline.atoms[0].name, "Clip 1");
    assert.equal(pipeline.atoms[0].file, join(episodeClipsDir, "clip_01.mp4"));
    assert.equal(pipeline.atoms[0].source_ref, join(sourceDir, "source.json"));
    assert.equal(pipeline.atoms[0].source_clip_id, 1);
    assert.equal(pipeline.atoms[0].hasTl, true);
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

function writeSource(root: string, name: string, source: Record<string, unknown>) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.json"), JSON.stringify(source, null, 2) + "\n");
}

function createMockSourceBin(root: string) {
  const path = join(root, "mock-nf-source.js");
  writeFileSync(path, `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const args = process.argv.slice(2);
const command = args[0];

function value(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function outDir() {
  return value("-o") || value("--out-dir");
}

if (command === "download") {
  const dir = outDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ title: "Mock Video", duration_sec: 42 }, null, 2));
  writeFileSync(join(dir, "source.mp4"), "");
  process.exit(0);
}

if (command === "transcribe") {
  const dir = outDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sentences.json"), JSON.stringify([
    {
      id: 1,
      text: "hello world",
      start_sec: 0,
      end_sec: 1.2,
      words: [
        { text: "hello", start_sec: 0, end_sec: 0.5 },
        { text: "world", start_sec: 0.6, end_sec: 1.2 }
      ]
    },
    {
      id: 2,
      text: "again now",
      start_sec: 1.3,
      end_sec: 2.1,
      words: [
        { text: "again", start_sec: 1.3, end_sec: 1.7 },
        { text: "now", start_sec: 1.8, end_sec: 2.1 }
      ]
    }
  ], null, 2));
  process.exit(0);
}

if (command === "cut") {
  const dir = outDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "clip_01.mp4"), "");
  writeFileSync(join(dir, "cut_report.json"), JSON.stringify({
    success: [
      {
        clip_num: 1,
        title: "Clip 1",
        from_id: 1,
        to_id: 2,
        start: 0,
        end: 3.2,
        duration: 3.2,
        file: "clip_01.mp4",
        text_preview: "hello world"
      }
    ],
    failed: []
  }, null, 2));
  process.exit(0);
}

process.exit(1);
`);
  chmodSync(path, 0o755);
  return path;
}
