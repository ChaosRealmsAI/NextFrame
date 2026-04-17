import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "./parser.js";
import { resolveAnchors } from "./anchor.js";
import { CyclicAnchors, UnknownRef } from "./topo.js";

const makeSrc = (anchors: Record<string, unknown>): string =>
  JSON.stringify({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    anchors,
    tracks: [],
  });

test("anchor: number + ref resolution", () => {
  const ast = parseSource(makeSrc({ a: 500, b: { ref: "a" } }));
  const resolved = resolveAnchors(ast);
  assert.equal(resolved.anchors.a, 500);
  assert.equal(resolved.anchors.b, 500);
});

test("anchor: expression with identifier", () => {
  const ast = parseSource(makeSrc({ intro_start: 500, body: "intro_start + 2000" }));
  const resolved = resolveAnchors(ast);
  assert.equal(resolved.anchors.body, 2500);
});

test("anchor: chained dependencies via topo order", () => {
  const ast = parseSource(makeSrc({ c: "b + 1", b: "a + 1", a: 10 }));
  const resolved = resolveAnchors(ast);
  assert.equal(resolved.anchors.a, 10);
  assert.equal(resolved.anchors.b, 11);
  assert.equal(resolved.anchors.c, 12);
});

test("anchor: UnknownRef on dangling {ref}", () => {
  const ast = parseSource(makeSrc({ a: { ref: "missing" } }));
  assert.throws(() => resolveAnchors(ast), (e: unknown) => e instanceof UnknownRef);
});

test("anchor: UnknownRef on dangling expr identifier", () => {
  const ast = parseSource(makeSrc({ a: "missing + 1" }));
  assert.throws(() => resolveAnchors(ast), (e: unknown) => e instanceof UnknownRef);
});

test("anchor: CyclicAnchors with path", () => {
  const ast = parseSource(makeSrc({ a: "b + 1", b: "a + 1" }));
  assert.throws(
    () => resolveAnchors(ast),
    (e: unknown) => {
      if (!(e instanceof CyclicAnchors)) return false;
      assert.ok(e.cycle.includes("a"));
      assert.ok(e.cycle.includes("b"));
      return true;
    },
  );
});

test("anchor: BDD-1 @-prefix + ms sugar + shuffled order", () => {
  const ast = parseSource(
    makeSrc({
      s2_start: "@s1_end - 100ms",
      s1_end: "@s1_start + 2000ms",
      s1_start: "@opening + 200ms",
      opening: 0,
    }),
  );
  const r = resolveAnchors(ast);
  assert.deepEqual(r.anchors, {
    s2_start: 2100,
    s1_end: 2200,
    s1_start: 200,
    opening: 0,
  });
});

test("anchor: meta carries refs + kind per anchor", () => {
  const ast = parseSource(
    makeSrc({ a: 0, b: { ref: "a" }, c: "@a + @b + 1" }),
  );
  const r = resolveAnchors(ast);
  assert.equal(r.anchors_meta.a.kind, "number");
  assert.deepEqual(r.anchors_meta.a.refs, []);
  assert.equal(r.anchors_meta.b.kind, "ref");
  assert.deepEqual(r.anchors_meta.b.refs, ["a"]);
  assert.equal(r.anchors_meta.c.kind, "expr");
  assert.deepEqual(r.anchors_meta.c.refs.sort(), ["a", "b"]);
});

test("anchor: source_line metadata populated from raw text", () => {
  const rawText = [
    "{",
    '  "viewport": { "ratio": "16:9", "w": 1920, "h": 1080 },',
    '  "anchors": {',
    '    "first": 0,',
    '    "second": "@first + 100ms"',
    "  },",
    '  "tracks": []',
    "}",
  ].join("\n");
  const ast = parseSource(rawText);
  const r = resolveAnchors(ast);
  assert.equal(r.anchors_meta.first.source_line, 4);
  assert.equal(r.anchors_meta.second.source_line, 5);
});
