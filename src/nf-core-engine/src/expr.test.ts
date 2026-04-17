import { test } from "node:test";
import assert from "node:assert/strict";
import { collectDeps, evalExpr, ExprError } from "./expr.js";

test("expr: numeric literal", () => {
  assert.equal(evalExpr("42"), 42);
  assert.equal(evalExpr("3.5"), 3.5);
});

test("expr: identifier lookup", () => {
  assert.equal(evalExpr("intro_start", { intro_start: 500 }), 500);
});

test("expr: arithmetic with precedence", () => {
  assert.equal(evalExpr("2 + 3 * 4"), 14);
  assert.equal(evalExpr("(2 + 3) * 4"), 20);
  assert.equal(evalExpr("10 - 2 - 3"), 5);
  assert.equal(evalExpr("8 / 4 / 2"), 1);
});

test("expr: mixed identifiers + arithmetic", () => {
  assert.equal(evalExpr("intro_start + 2000", { intro_start: 500 }), 2500);
  assert.equal(evalExpr("-x + 1", { x: 10 }), -9);
});

test("expr: collectDeps", () => {
  assert.deepEqual(collectDeps("a + b * (c - a)").sort(), ["a", "b", "c"]);
  assert.deepEqual(collectDeps("42"), []);
});

test("expr: syntax error throws ExprError with position", () => {
  assert.throws(() => evalExpr("1 + "), (e: unknown) => e instanceof ExprError);
  assert.throws(() => evalExpr("1 ^ 2"), (e: unknown) => e instanceof ExprError);
  assert.throws(() => evalExpr("(1 + 2"), (e: unknown) => e instanceof ExprError);
});

test("expr: undefined identifier throws", () => {
  assert.throws(() => evalExpr("missing + 1"), (e: unknown) => e instanceof ExprError);
});

test("expr: division by zero throws", () => {
  assert.throws(() => evalExpr("1 / 0"), (e: unknown) => e instanceof ExprError);
});

test("expr: @-prefix sugar resolves to bare identifier", () => {
  assert.equal(evalExpr("@intro_start + 2000", { intro_start: 500 }), 2500);
  assert.deepEqual(collectDeps("@a + @b * (@c - @a)").sort(), ["a", "b", "c"]);
});

test("expr: ms and s unit suffix", () => {
  assert.equal(evalExpr("200ms"), 200);
  assert.equal(evalExpr("2s"), 2000);
  assert.equal(evalExpr("@opening + 200ms", { opening: 0 }), 200);
  assert.equal(evalExpr("@opening + 2s", { opening: 0 }), 2000);
});

test("expr: dangling '@' raises ExprError", () => {
  assert.throws(() => evalExpr("@ + 1"), (e: unknown) => e instanceof ExprError);
});
