import test from "node:test";
import assert from "node:assert/strict";

import { resolve } from "../../nf-core/anchors/resolver.ts";

test("resolve returns direct anchor points", () => {
  const dict = {
    "s1.begin": { at: 1000 },
    "s1.end": { at: 2200 },
    "beat.drop": { at: 3000 },
  };

  assert.equal(resolve(dict, "s1.begin"), 1000);
  assert.equal(resolve(dict, "s1.end + 0.5s"), 2700);
  assert.equal(resolve(dict, "beat.drop - 200ms"), 2800);
});

test("resolve supports numeric fallbacks, forward refs, and base-entry fallbacks", () => {
  const dict = {
    intro: { end: "outro.begin - 250ms" },
    outro: { begin: 2000 },
    "seg0.begin": { at: 0 },
  };

  assert.equal(resolve(dict, 42), 42);
  assert.equal(resolve(dict, "intro.end"), 1750);
  assert.equal(resolve(dict, "seg0.begin"), 0);
});

test("resolve reports missing anchors and points", () => {
  const dict = {
    s1: { begin: 1000 },
  };

  assert.throws(() => resolve(dict, "s1.point"), /UNKNOWN_POINT:/);
  assert.throws(() => resolve(dict, "missing.begin"), /MISSING_ANCHOR:/);
  assert.throws(() => resolve(dict, "s1.end"), /MISSING_POINT:/);
});

test("resolve detects circular anchor references", () => {
  const dict = {
    a: { at: "b.at" },
    b: { at: "a.at" },
  };

  assert.throws(() => resolve(dict, "a.at"), /ANCHOR_CIRCULAR_DEP:/);
});
