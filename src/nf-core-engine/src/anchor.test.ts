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
