import type { AnchorPoint, ExprAst, RefExprAst } from "./types.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const OFFSET_RE = /([+-])(\d+(?:\.\d+)?)(ms|s)$/;

function fail(message: string): never {
  throw new Error(`BAD_ANCHOR_EXPR: ${message}`);
}

function failUnknownPoint(point: string): never {
  throw new Error(`UNKNOWN_POINT: unsupported point "${point}"`);
}

function isAnchorPoint(value: string): value is AnchorPoint {
  return value === "begin" || value === "end" || value === "at";
}

export function parseRefId(raw: string): string {
  if (!IDENT_RE.test(raw) || raw.includes("..") || raw.endsWith(".")) {
    fail(`invalid anchor id "${raw}"`);
  }
  return raw;
}

export function parseRef(
  raw: string,
  opts: { allowImplicitAt?: boolean } = {},
): RefExprAst {
  const id = parseRefId(raw);
  const parts = id.split(".");
  if (parts.length < 2) {
    fail(`anchor reference "${raw}" must include .begin, .end, or .at`);
  }

  const point = parts.at(-1) ?? "";
  if (isAnchorPoint(point)) {
    const baseId = parts.slice(0, -1).join(".");
    parseRefId(baseId);
    return { kind: "ref", id: baseId, point };
  }

  if (parts.length >= 3 || opts.allowImplicitAt) {
    return { kind: "ref", id, point: "at" };
  }

  failUnknownPoint(point);
}

export function parse(expr: string): ExprAst {
  if (typeof expr !== "string") {
    fail("expression must be a string");
  }

  const compact = expr.replace(/[ \t]+/g, "");
  if (!compact) {
    fail("expression is empty");
  }

  const offsetMatch = compact.match(OFFSET_RE);
  const baseText = offsetMatch ? compact.slice(0, -offsetMatch[0].length) : compact;
  const base = parseRef(baseText, { allowImplicitAt: Boolean(offsetMatch) });

  if (!offsetMatch) {
    return base;
  }

  const amount = Number(offsetMatch[2]);
  if (!Number.isFinite(amount)) {
    fail(`invalid offset in "${expr}"`);
  }

  const unit = offsetMatch[3];
  const sign = offsetMatch[1] === "-" ? -1 : 1;
  const deltaMs = sign * amount * (unit === "s" ? 1000 : 1);
  return { kind: "offset", base, deltaMs };
}
