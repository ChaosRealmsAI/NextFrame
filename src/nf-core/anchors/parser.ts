import type { ExprAst } from "./types.js";

const OFFSET_RE = /^([A-Za-z0-9_.-]+\.(?:at|begin|end))\s*([+-])\s*(\d+(?:\.\d+)?)\s*(ms|s)$/;
const REF_RE = /^([A-Za-z0-9_.-]+\.(?:at|begin|end))$/;

export function parse(expr: string): ExprAst {
  const value = String(expr || "").trim();
  const offsetMatch = value.match(OFFSET_RE);
  if (offsetMatch) {
    return {
      type: "offset",
      expr: {
        type: "anchor_ref",
        ref: offsetMatch[1],
      },
      op: offsetMatch[2] as "+" | "-",
      value: Number(offsetMatch[3]),
      unit: offsetMatch[4] as "s" | "ms",
    };
  }

  const refMatch = value.match(REF_RE);
  if (refMatch) {
    return {
      type: "anchor_ref",
      ref: refMatch[1],
    };
  }

  throw new Error(`BAD_ANCHOR_EXPR: unsupported anchor expression "${value}"`);
}
