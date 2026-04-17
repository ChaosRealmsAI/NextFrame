import { test } from "node:test";
import assert from "node:assert/strict";
import { writeBack } from "./writeback.js";

const pretty = (obj: unknown): string => JSON.stringify(obj, null, 2) + "\n";

test("writeback: empty edit is byte-identical", () => {
  const src = pretty({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    anchors: { a: 500, b: 1000 },
  });
  const result = writeBack(src, {});
  assert.equal(result.output, src);
  assert.equal(result.diff, "");
  assert.equal(result.stable, true);
});

test("writeback: L2 stability — writeBack(writeBack(v)) === writeBack(v)", () => {
  const src = pretty({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    anchors: { a: 500, b: 1000 },
    tracks: [],
  });
  const edit = { anchors: { a: 750 } };
  const once = writeBack(src, edit);
  const twice = writeBack(once.output, edit);
  assert.equal(twice.output, once.output);
  assert.equal(once.stable, true);
});

test("writeback: L3 key order preserved", () => {
  const src = [
    "{",
    '  "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },',
    '  "anchors": { "z": 1, "a": 2 },',
    '  "tracks": []',
    "}",
    "",
  ].join("\n");
  const result = writeBack(src, { anchors: { z: 99 } });
  // z must still appear before a in the output.
  const zIdx = result.output.indexOf('"z"');
  const aIdx = result.output.indexOf('"a"');
  assert.ok(zIdx > 0 && aIdx > zIdx);
});

test("writeback: L4 single-anchor edit produces ≤1-line diff", () => {
  const src = [
    "{",
    '  "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },',
    '  "anchors": {',
    '    "t_intro": 0,',
    '    "t_body": 2',
    "  },",
    '  "tracks": []',
    "}",
    "",
  ].join("\n");
  const result = writeBack(src, { anchors: { t_body: 5 } });
  // line-diff count
  const before = src.split("\n");
  const after = result.output.split("\n");
  let changed = 0;
  for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
    if (before[i] !== after[i]) changed += 1;
  }
  assert.ok(changed <= 1, `expected ≤1 changed line, got ${changed}`);
  assert.ok(result.output.includes("5"));
});

test("writeback: nested path edit", () => {
  const src = pretty({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    anchors: { a: 500 },
  });
  const result = writeBack(src, { viewport: { w: 1280 } });
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.viewport.w, 1280);
  assert.equal(parsed.viewport.h, 1080);
  assert.equal(parsed.viewport.ratio, "16:9");
});

test("writeback: string value edit", () => {
  const src = pretty({ viewport: { ratio: "16:9", w: 1920, h: 1080 }, title: "hello" });
  const result = writeBack(src, { title: "world" });
  assert.ok(result.output.includes('"world"'));
  assert.ok(!result.output.includes('"hello"'));
});
