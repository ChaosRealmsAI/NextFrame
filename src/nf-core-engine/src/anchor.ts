// Anchor resolver. Walking stub: identity pass — real impl runs expr eval + topo sort.

import type { SourceAst } from "./parser.js";
import { evalExpr } from "./expr.js";
import { topoSort } from "./topo.js";

export interface ResolvedBundle {
  viewport: SourceAst["viewport"];
  tracks: unknown[];
  anchors: Record<string, number>;
}

export function resolveAnchors(ast: SourceAst): ResolvedBundle {
  const anchors: Record<string, number> = {};
  const rawAnchors = (ast.raw as Record<string, unknown>).anchors as
    | Record<string, unknown>
    | undefined;
  if (rawAnchors) {
    const order = topoSort(Object.keys(rawAnchors));
    for (const key of order) {
      const v = rawAnchors[key];
      anchors[key] = typeof v === "number" ? v : evalExpr(String(v));
    }
  }
  return { viewport: ast.viewport, tracks: ast.tracks, anchors };
}
