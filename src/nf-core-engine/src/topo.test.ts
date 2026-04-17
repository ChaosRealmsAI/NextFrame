import { test } from "node:test";
import assert from "node:assert/strict";
import { topoSort, CyclicAnchors, UnknownRef } from "./topo.js";

test("topo: linear chain", () => {
  const out = topoSort({ nodes: ["a", "b", "c"], deps: { a: [], b: ["a"], c: ["b"] } });
  assert.deepEqual(out, ["a", "b", "c"]);
});

test("topo: DAG with independent branches", () => {
  const out = topoSort({
    nodes: ["a", "b", "c", "d"],
    deps: { a: [], b: ["a"], c: ["a"], d: ["b", "c"] },
  });
  assert.equal(out[0], "a");
  assert.equal(out[3], "d");
  assert.ok(out.indexOf("b") < out.indexOf("d"));
  assert.ok(out.indexOf("c") < out.indexOf("d"));
});

test("topo: cycle detection", () => {
  assert.throws(
    () => topoSort({ nodes: ["a", "b"], deps: { a: ["b"], b: ["a"] } }),
    (e: unknown) => e instanceof CyclicAnchors,
  );
});

test("topo: unknown ref detection", () => {
  assert.throws(
    () => topoSort({ nodes: ["a"], deps: { a: ["missing"] } }),
    (e: unknown) => e instanceof UnknownRef,
  );
});

test("topo: empty graph", () => {
  assert.deepEqual(topoSort({ nodes: [], deps: {} }), []);
});
