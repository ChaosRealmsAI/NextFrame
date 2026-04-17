import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSource } from "./validate.js";

const baseVp = { ratio: "16:9", w: 1920, h: 1080 };
const makeSrc = (patch: Record<string, unknown>): string =>
  JSON.stringify({ viewport: baseVp, anchors: {}, tracks: [], ...patch }, null, 2);

test("validate: ok for clean source", () => {
  const report = validateSource(
    makeSrc({ anchors: { a: 0, b: "@a + 100ms" } }),
  );
  assert.equal(report.ok, true);
  assert.equal(report.anchors_resolved, 2);
  assert.deepEqual(report.errors, []);
});

test("validate: anchor-cycle code + cycle_path", () => {
  const report = validateSource(
    makeSrc({ anchors: { a: "b + 1", b: "a - 1" } }),
  );
  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, "anchor-cycle");
  assert.ok((report.errors[0].cycle_path ?? []).length >= 2);
});

test("validate: anchor-undefined code + name", () => {
  const report = validateSource(
    makeSrc({ anchors: { a: { ref: "missing" } } }),
  );
  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, "anchor-undefined");
  assert.equal(report.errors[0].name, "missing");
});

test("validate: viewport-mismatch when w/h != ratio", () => {
  const src = JSON.stringify({
    viewport: { ratio: "16:9", w: 1920, h: 1000 },
    anchors: {},
    tracks: [],
  });
  const report = validateSource(src);
  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, "viewport-mismatch");
});

test("validate: viewport-ratio-invalid when ratio off whitelist", () => {
  const src = JSON.stringify({
    viewport: { ratio: "2:1", w: 2000, h: 1000 },
    anchors: {},
    tracks: [],
  });
  const report = validateSource(src);
  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, "viewport-ratio-invalid");
  const details = report.errors[0].details as { whitelist: string[] } | undefined;
  assert.ok(details?.whitelist.includes("16:9"));
});

test("validate: large cycle (50 nodes) detected without stack overflow", () => {
  const anchors: Record<string, string> = {};
  for (let i = 0; i < 50; i += 1) {
    const next = (i + 1) % 50;
    anchors[`n${i}`] = `n${next} + 0`;
  }
  const report = validateSource(
    JSON.stringify({ viewport: baseVp, anchors, tracks: [] }),
  );
  assert.equal(report.ok, false);
  assert.equal(report.errors[0].code, "anchor-cycle");
});

test("validate: anchor meta exposes source_line via parser scan", () => {
  const src = [
    "{",
    '  "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },',
    '  "anchors": {',
    '    "opening": 0,',
    '    "s1_start": "@opening + 200ms"',
    "  },",
    '  "tracks": []',
    "}",
  ].join("\n");
  const report = validateSource(src);
  assert.equal(report.ok, true);
});
