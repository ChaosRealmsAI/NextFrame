import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUserTracks } from "../user/loader.js";

const VALID_TRACK = `
export function describe() { return { type: "object", properties: {}, additionalProperties: false }; }
export function sample() { return {}; }
export function render() { return { dom: null }; }
`;

const BROKEN_TRACK = `
export function describe() { return {}; }
// missing sample and render — should be skipped with a warning
`;

test("loadUserTracks picks up a newly-added valid track", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nftracks-"));
  try {
    writeFileSync(join(dir, "mytrack.js"), VALID_TRACK);
    const { tracks, warnings } = await loadUserTracks(dir);
    assert.ok(tracks.mytrack, "expected mytrack in loaded map");
    assert.equal(typeof tracks.mytrack.describe, "function");
    assert.equal(warnings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserTracks skips invalid tracks with a warning", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nftracks-"));
  try {
    writeFileSync(join(dir, "broken.js"), BROKEN_TRACK);
    const { tracks, warnings } = await loadUserTracks(dir);
    assert.equal(tracks.broken, undefined);
    assert.ok(warnings.some((w) => w.includes("broken")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserTracks returns an empty map for empty directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nftracks-"));
  try {
    const { tracks, warnings } = await loadUserTracks(dir);
    assert.deepEqual(tracks, {});
    assert.equal(warnings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUserTracks handles missing directory without crash", async () => {
  const { tracks, warnings } = await loadUserTracks(join(tmpdir(), "definitely-does-not-exist-nftracks"));
  assert.deepEqual(tracks, {});
  assert.ok(warnings.length >= 1);
});
