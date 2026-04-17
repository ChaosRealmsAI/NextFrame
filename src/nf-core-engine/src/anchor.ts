// Anchor resolver: topologically orders anchors by dependencies, then
// evaluates ref / expr / number nodes into concrete numeric values.

import type { AnchorExprNode, SourceAst, Viewport } from "./parser.js";
import { collectDeps, evalExpr } from "./expr.js";
import { topoSort, UnknownRef } from "./topo.js";

export interface ResolvedBundle {
  viewport: Viewport;
  tracks: unknown[];
  anchors: Record<string, number>;
}

function depsOf(node: AnchorExprNode): string[] {
  if (typeof node === "number") return [];
  if ("ref" in node) return [node.ref];
  return collectDeps(node.expr);
}

export function resolveAnchors(ast: SourceAst): ResolvedBundle {
  const keys = Object.keys(ast.anchors);
  const deps: Record<string, string[]> = {};
  for (const k of keys) {
    const ds = depsOf(ast.anchors[k]);
    for (const d of ds) {
      if (!(d in ast.anchors)) throw new UnknownRef(d, k);
    }
    deps[k] = ds;
  }
  const order = topoSort({ nodes: keys, deps });
  const anchors: Record<string, number> = {};
  for (const k of order) {
    const node = ast.anchors[k];
    if (typeof node === "number") anchors[k] = node;
    else if ("ref" in node) anchors[k] = anchors[node.ref];
    else anchors[k] = evalExpr(node.expr, anchors);
  }
  return { viewport: ast.viewport, tracks: ast.tracks, anchors };
}
