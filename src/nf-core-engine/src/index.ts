// nf-core-engine — Source → Resolved compiler + bundler. Walking stub.
// Real impl: parser → anchor resolver → expr eval → topo sort → bundler → writeBack.

import { parseSource } from "./parser.js";
import { resolveAnchors } from "./anchor.js";
import { bundle } from "./bundler.js";

export interface BundleResult {
  html: string;
  bytes: number;
  warnings: string[];
}

export function compile(source: string): BundleResult {
  const ast = parseSource(source);
  const resolved = resolveAnchors(ast);
  const html = bundle(resolved);
  return { html, bytes: html.length, warnings: [] };
}

export { parseSource } from "./parser.js";
export { resolveAnchors } from "./anchor.js";
export { bundle } from "./bundler.js";
export { writeBack } from "./writeback.js";
