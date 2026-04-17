// nf-core-engine — Source → Resolved compiler + bundler (TS, ADR-025).
// Pipeline: parse → resolve anchors (expr + topo) → bundle tracks into HTML.

import { parseSource } from "./parser.js";
import { resolveAnchors, type ResolvedBundle } from "./anchor.js";
import { bundle, bundleDetailed, type BundleOptions } from "./bundler.js";

export interface BundleResult {
  html: string;
  bytes: number;
  warnings: string[];
  resolved: ResolvedBundle;
  tracks_included: string[];
  assets_inlined: number;
}

export function compile(source: string, options: BundleOptions = {}): BundleResult {
  const ast = parseSource(source);
  const resolved = resolveAnchors(ast);
  const bundled = bundleDetailed(resolved, options);
  return {
    html: bundled.html,
    bytes: bundled.html.length,
    warnings: bundled.warnings,
    resolved,
    tracks_included: bundled.tracks_included,
    assets_inlined: bundled.assets_inlined,
  };
}

export { parseSource, ParseError } from "./parser.js";
export type { SourceAst, Viewport, AnchorExprNode } from "./parser.js";
export { resolveAnchors } from "./anchor.js";
export type { ResolvedBundle, AnchorMeta } from "./anchor.js";
export { bundle, bundleDetailed } from "./bundler.js";
export type { BundleOptions } from "./bundler.js";
export { writeBack } from "./writeback.js";
export type { WriteBackResult } from "./writeback.js";
export { evalExpr, parseExpr, collectDeps, ExprError } from "./expr.js";
export { topoSort, CyclicAnchors, UnknownRef } from "./topo.js";
export { validateSource } from "./validate.js";
export type { ValidateReport, ValidateError } from "./validate.js";
