// Anchor resolver: topologically orders anchors by dependencies, then
// evaluates ref / expr / number nodes into concrete numeric values. Tracks
// a refs map + source_line metadata so IDE / error messages can point back
// to the user's original text.

import type { AnchorExprNode, SourceAst, Viewport } from "./parser.js";
import { collectDeps, evalExpr } from "./expr.js";
import { topoSort, UnknownRef } from "./topo.js";

export interface AnchorMeta {
  refs: string[];
  source_line: number | null;
  kind: "number" | "ref" | "expr";
}

export interface ResolvedBundle {
  viewport: Viewport;
  tracks: unknown[];
  anchors: Record<string, number>;
  anchors_meta: Record<string, AnchorMeta>;
  topo_order: string[];
}

function depsOf(node: AnchorExprNode): string[] {
  if (typeof node === "number") return [];
  if ("ref" in node) return [node.ref];
  return collectDeps(node.expr);
}

function kindOf(node: AnchorExprNode): "number" | "ref" | "expr" {
  if (typeof node === "number") return "number";
  if ("ref" in node) return "ref";
  return "expr";
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
  const anchors_meta: Record<string, AnchorMeta> = {};
  for (const k of order) {
    const node = ast.anchors[k];
    if (typeof node === "number") anchors[k] = node;
    else if ("ref" in node) anchors[k] = anchors[node.ref];
    else anchors[k] = evalExpr(node.expr, anchors);
    anchors_meta[k] = {
      refs: deps[k],
      source_line: ast.anchorLines[k] ?? null,
      kind: kindOf(node),
    };
  }
  return {
    viewport: ast.viewport,
    tracks: ast.tracks,
    anchors,
    anchors_meta,
    topo_order: order,
  };
}
