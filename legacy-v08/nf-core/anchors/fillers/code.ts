import { parseRef, parseRefId } from "../parser.ts";
import { resolve } from "../resolver.ts";
import type { AnchorDict, AnchorEntry, RefExprAst } from "../types.js";

type Token =
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" }
  | { type: "number"; value: number }
  | { type: "ref"; value: { raw: string; expr: string; ref: RefExprAst } };

function fail(message: string): never {
  throw new Error(`BAD_CODE_EXPR: ${message}`);
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expr.length) {
    const char = expr[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ("+-*/()".includes(char)) {
      tokens.push({ type: "op", value: char as Token["value"] });
      index += 1;
      continue;
    }

    const numeric = expr.slice(index).match(/^\d+(?:\.\d+)?(?:ms|s)?/);
    if (numeric) {
      const raw = numeric[0];
      const unit = raw.endsWith("ms") ? "ms" : raw.endsWith("s") ? "s" : null;
      const value = Number(unit ? raw.slice(0, -unit.length) : raw) * (unit === "s" ? 1000 : 1);
      tokens.push({ type: "number", value });
      index += raw.length;
      continue;
    }

    const ident = expr.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (ident) {
      const raw = ident[0];
      try {
        const ref = raw.includes(".")
          ? parseRef(raw)
          : { kind: "ref" as const, id: parseRefId(raw), point: "at" as const };
        const next = expr[index + raw.length];
        if (next === "(") {
          fail(`function calls are not allowed: "${raw}(...)"`);
        }
        tokens.push({
          type: "ref",
          value: {
            raw,
            expr: raw.includes(".") ? raw : `${raw}.at`,
            ref,
          },
        });
        index += raw.length;
        continue;
      } catch (error) {
        const message = (error as Error).message;
        if (message.startsWith("BAD_ANCHOR_EXPR:") || message.startsWith("UNKNOWN_POINT:")) {
          fail(`unsupported anchor ref "${raw}"`);
        }
        throw error;
      }
    }

    fail(`unexpected token near "${expr.slice(index)}"`);
  }

  return tokens;
}

function parseExpression(tokens: Token[], anchors: AnchorDict) {
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consumeOp(expected?: Token["value"]) {
    const token = tokens[index];
    if (!token || token.type !== "op") {
      return null;
    }
    if (expected && token.value !== expected) {
      return null;
    }
    index += 1;
    return token.value;
  }

  function factor(): number {
    const token = peek();
    if (!token) {
      fail("unexpected end of expression");
    }
    if (token.type === "op" && (token.value === "+" || token.value === "-")) {
      index += 1;
      const value = factor();
      return token.value === "-" ? -value : value;
    }
    if (consumeOp("(")) {
      const value = expression();
      if (!consumeOp(")")) {
        fail('missing closing ")"');
      }
      return value;
    }
    if (token.type === "number") {
      index += 1;
      return token.value;
    }
    if (token.type === "ref") {
      index += 1;
      return resolve(anchors, token.value.expr);
    }

    fail(`unexpected operator "${token.value}"`);
  }

  function term(): number {
    let value = factor();
    while (true) {
      const op = consumeOp("*") ?? consumeOp("/");
      if (!op) {
        return value;
      }
      const rhs = factor();
      if (op === "/" && rhs === 0) {
        fail("division by zero");
      }
      value = op === "*" ? value * rhs : value / rhs;
    }
  }

  function expression(): number {
    let value = term();
    while (true) {
      const op = consumeOp("+") ?? consumeOp("-");
      if (!op) {
        return value;
      }
      const rhs = term();
      value = op === "+" ? value + rhs : value - rhs;
    }
  }

  const result = expression();
  if (index !== tokens.length) {
    fail("trailing tokens are not allowed");
  }
  return result;
}

export function collectCodeRefs(expr: string): RefExprAst[] {
  const seen = new Set<string>();
  const refs: RefExprAst[] = [];
  for (const token of tokenize(expr)) {
    if (token.type !== "ref" || seen.has(token.value.expr)) {
      continue;
    }
    seen.add(token.value.expr);
    refs.push(token.value.ref);
  }
  return refs;
}

export function getCodeExpression(entry: AnchorEntry): string | null {
  if (typeof entry.expr === "string" && entry.expr.trim()) {
    return entry.expr.trim();
  }
  if (typeof entry.filler === "string" && entry.filler.startsWith("code:")) {
    return entry.filler.slice(5).trim();
  }
  return null;
}

export default function codeFiller(
  expr: string,
  ctx: { anchors: AnchorDict; media?: Record<string, unknown> },
): number {
  const trimmed = String(expr).trim();
  if (!trimmed) {
    fail("expression is empty");
  }

  const value = parseExpression(tokenize(trimmed), ctx.anchors);
  if (!Number.isFinite(value)) {
    fail("expression did not resolve to a finite number");
  }
  return value;
}
