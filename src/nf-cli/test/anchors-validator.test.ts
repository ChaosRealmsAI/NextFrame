import test from "node:test";
import assert from "node:assert/strict";

import { validateAnchors } from "../../nf-core/anchors/validator.ts";

test("validateAnchors accepts exact-key anchors emitted by the tts filler", () => {
  const dict = {
    "seg0.begin": { at: 0 },
    "seg0.end": { at: 3400 },
  };

  assert.deepEqual(
    validateAnchors(dict, [{ expr: "seg0.begin", path: "tracks[0].clips[0].begin" }]),
    { ok: true, issues: [] },
  );
});

test("validateAnchors still supports base-entry range anchors and code cycles", () => {
  const valid = validateAnchors(
    { seg0: { begin: 0, end: 3400 } },
    [{ expr: "seg0.begin", path: "tracks[0].clips[0].begin" }],
  );
  assert.equal(valid.ok, true);

  const cyclic = validateAnchors({
    a: { filler: "code", expr: "b.at + 1" },
    b: { filler: "code", expr: "a.at + 1" },
  });
  assert.equal(cyclic.ok, false);
  assert.match(JSON.stringify(cyclic.issues), /ANCHOR_CIRCULAR_DEP/);
});

test("validateAnchors reports missing anchors referenced by code fillers", () => {
  const result = validateAnchors({
    a: { filler: "code:missing.at + 1" },
  });

  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.issues), /MISSING_ANCHOR/);
  assert.match(JSON.stringify(result.issues), /anchors\.a\.filler/);
});

test("validateAnchors reports missing points referenced by code fillers", () => {
  const result = validateAnchors({
    a: { filler: "code:seg0.end + 1" },
    seg0: { begin: 0 },
  });

  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.issues), /MISSING_POINT/);
  assert.match(JSON.stringify(result.issues), /anchors\.a\.filler/);
});
