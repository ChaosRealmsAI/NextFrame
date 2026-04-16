import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../../nf-core/anchors/parser.ts";

test("parse returns a ref ast for a plain anchor reference", () => {
  assert.deepEqual(parse("s1.begin"), {
    kind: "ref",
    id: "s1",
    point: "begin",
  });
});

test("parse converts second offsets into milliseconds", () => {
  assert.deepEqual(parse("s1.end + 0.5s"), {
    kind: "offset",
    base: { kind: "ref", id: "s1", point: "end" },
    deltaMs: 500,
  });
});

test("parse converts millisecond offsets and ignores whitespace", () => {
  assert.deepEqual(parse("  s1.end  -  0.3s  "), {
    kind: "offset",
    base: { kind: "ref", id: "s1", point: "end" },
    deltaMs: -300,
  });
  assert.deepEqual(parse("beat.drop - 200ms"), {
    kind: "offset",
    base: { kind: "ref", id: "beat.drop", point: "at" },
    deltaMs: -200,
  });
  assert.deepEqual(parse("s1.begin+0.5s"), {
    kind: "offset",
    base: { kind: "ref", id: "s1", point: "begin" },
    deltaMs: 500,
  });
});

test("parse accepts dotted anchor ids without reserving suffixes", () => {
  assert.deepEqual(parse("beat.drop.foo"), {
    kind: "ref",
    id: "beat.drop.foo",
    point: "at",
  });
});

test("parse rejects invalid explicit points", () => {
  assert.throws(() => parse("s1.point"), /UNKNOWN_POINT:/);
});

test("parse rejects invalid arithmetic and malformed refs", () => {
  assert.throws(() => parse("s1.begin \\* 2".replace("\\", "")), /BAD_ANCHOR_EXPR:/);
  assert.throws(() => parse("s1.begin + 1"), /BAD_ANCHOR_EXPR:/);
  assert.throws(() => parse(""), /BAD_ANCHOR_EXPR:/);
  assert.throws(() => parse(".begin"), /BAD_ANCHOR_EXPR:/);
  assert.throws(() => parse("s1..begin"), /BAD_ANCHOR_EXPR:/);
});
