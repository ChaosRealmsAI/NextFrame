import { parse } from "./parser.ts";
import type { AnchorDict, AnchorPoint, AnchorValue, ExprAst, RefExprAst } from "./types.js";

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function pointKey(id: string, point: AnchorPoint) {
  return point === "at" ? id : `${id}.${point}`;
}

function lookupAnchorValue(
  dict: AnchorDict,
  ref: RefExprAst,
): { key: string; value: AnchorValue } {
  const exactKey = pointKey(ref.id, ref.point);
  const exact = dict[exactKey];
  if (exact?.at !== undefined) {
    return { key: exactKey, value: exact.at };
  }
  if (exact) {
    fail("MISSING_POINT", `anchor "${exactKey}" is missing point "at"`);
  }

  const entry = dict[ref.id];
  if (!entry) {
    fail("MISSING_ANCHOR", `anchor "${ref.id}" not found`);
  }
  const value = entry[ref.point];
  if (value === undefined) {
    fail("MISSING_POINT", `anchor "${ref.id}" is missing point "${ref.point}"`);
  }
  return { key: exactKey, value };
}

function resolveValue(
  dict: AnchorDict,
  value: AnchorValue,
  key: string,
  stack: string[],
): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("BAD_ANCHOR_EXPR", `anchor "${key}" is not a finite number`);
    }
    return value;
  }

  if (stack.includes(key)) {
    fail("ANCHOR_CIRCULAR_DEP", [...stack, key].join(" -> "));
  }

  return resolveAst(dict, parse(value), [...stack, key]);
}

function resolveAst(dict: AnchorDict, ast: ExprAst, stack: string[]): number {
  if (ast.kind === "ref") {
    const target = lookupAnchorValue(dict, ast);
    return resolveValue(dict, target.value, target.key, stack);
  }

  return resolveAst(dict, ast.base, stack) + ast.deltaMs;
}

export function resolve(dict: AnchorDict, expr: string | number): number {
  if (typeof expr === "number") {
    if (!Number.isFinite(expr)) {
      fail("BAD_ANCHOR_EXPR", "numeric expression must be finite");
    }
    return expr;
  }

  return resolveAst(dict, parse(expr), []);
}

export function resolveAll(dict: AnchorDict): AnchorDict {
  return Object.fromEntries(
    Object.entries(dict).map(([id, entry]) => [id, { ...entry }]),
  );
}
