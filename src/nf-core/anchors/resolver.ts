import type { AnchorDict } from "./types.js";
import { parse } from "./parser.js";

function exactAnchorValue(dict: AnchorDict, ref: string) {
  const entry = dict[ref];
  if (!entry) {
    return null;
  }
  if (Number.isFinite(entry.at)) {
    return Number(entry.at);
  }
  return null;
}

function nestedAnchorValue(dict: AnchorDict, ref: string) {
  const match = ref.match(/^(.+)\.(at|begin|end)$/);
  if (!match) return null;
  const entry = dict[match[1]];
  if (!entry) return null;
  const value = entry[match[2] as "at" | "begin" | "end"];
  if (!Number.isFinite(value)) return null;
  return Number(value);
}

function anchorValue(dict: AnchorDict, ref: string) {
  const exact = exactAnchorValue(dict, ref);
  if (exact !== null) return exact;
  const nested = nestedAnchorValue(dict, ref);
  if (nested !== null) return nested;
  throw new Error(`MISSING_ANCHOR: anchor "${ref}" is not defined`);
}

export function resolve(dict: AnchorDict, expr: string, _fps?: number): number {
  const ast = parse(expr);
  if (ast.type === "anchor_ref") {
    return anchorValue(dict, ast.ref);
  }

  const base = anchorValue(dict, ast.expr.ref);
  const delta = ast.unit === "s" ? ast.value * 1000 : ast.value;
  return ast.op === "+" ? base + delta : base - delta;
}
