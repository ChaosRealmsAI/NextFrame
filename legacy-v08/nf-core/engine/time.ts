// Symbolic-time resolver for NextFrame timelines.
// Converts symbolic time expressions (after/before/sync/offset) to numeric seconds.

import { guarded } from "./_guard.js";
import type { Timeline } from "../types.js";

export const GRID_SIZE = 0.1;

interface TimeError extends Error {
  code: string;
  ref?: string;
  hint?: string;
}

interface TimeNode {
  nodeId: string;
  refBase: string;
  field: string;
  raw: unknown;
  expr: TimeExpr;
  path: (string | number)[] | null;
  deps: string[];
  dependents: string[];
}

type TimeExpr =
  | { kind: "number"; value: number }
  | { kind: "expr"; op: string; ref: string; gap: number; by: number };

interface TimeContext {
  timeline: Timeline;
  nodes: Map<string, TimeNode>;
  refs: Map<string, string>;
  paths: Array<{ nodeId: string; path: (string | number)[] }>;
}

interface NodeDef {
  nodeId: string;
  refBase: string;
  field: string;
  value: unknown;
  path: (string | number)[] | null;
}

export function resolveTimeline(timeline: Timeline): ReturnType<typeof guarded> {
  try {
    const context = buildContext(timeline);
    buildDependencyGraph(context);
    const order = topologicallySort(context);
    const values = resolveValues(context.nodes, order);
    quantizeAll(values);
    rangeCheck(context.nodes, values, timeline.duration ?? 0);
    const resolved = materialize(context, values);
    const lookup = buildLookup(context, values);
    return guarded("resolveTimeline", { ok: true, value: resolved, lookup });
  } catch (err) {
    const error = err as TimeError;
    return guarded("resolveTimeline", {
      ok: false,
      error: {
        code: error.code || "TIME_RESOLVE_ERROR",
        message: error.message,
        ref: error.ref,
        hint: error.hint,
      },
    });
  }
}

export function resolveExpression(expr: unknown, lookup: Record<string, number>, duration: number): ReturnType<typeof guarded> {
  if (typeof expr === "number") {
    return guarded("resolveExpression", { ok: true, value: quantize(expr) });
  }
  if (!expr || typeof expr !== "object") {
    return guarded("resolveExpression", { ok: false, error: { code: "BAD_TIME", message: `bad time: ${JSON.stringify(expr)}` } });
  }
  const exprObj = expr as Record<string, unknown>;
  const op = ["at", "after", "before", "sync", "until", "offset"].find((key) => key in exprObj);
  if (!op) {
    return guarded("resolveExpression", { ok: false, error: { code: "BAD_TIME", message: "missing operator" } });
  }
  const ref = op === "offset" ? exprObj.offset : exprObj[op];
  const base = lookup[ref as string];
  if (base === undefined) {
    return guarded("resolveExpression", {
      ok: false,
      error: {
        code: "TIME_REF_NOT_FOUND",
        message: `unknown ref "${String(ref)}"`,
        ref: String(ref),
        hint: `available: ${Object.keys(lookup).slice(0, 10).join(", ")}`,
      },
    });
  }
  let value = base;
  if (op === "after") value = base + ((exprObj.gap as number) || 0);
  if (op === "before") value = base - ((exprObj.gap as number) || 0);
  if (op === "offset") value = base + ((exprObj.by as number) || 0);
  if (value < 0 || value > duration + 1e-6) {
    return guarded("resolveExpression", { ok: false, error: { code: "TIME_OUT_OF_RANGE", message: `resolved time ${quantize(value)} outside [0, ${duration}]`, ref } });
  }
  return guarded("resolveExpression", { ok: true, value: quantize(value) });
}

function buildContext(timeline: Timeline): TimeContext {
  const context: TimeContext = {
    timeline,
    nodes: new Map(),
    refs: new Map(),
    paths: [],
  };
  const duration = timeline.duration;
  if (typeof duration !== "number" || duration <= 0) {
    throw withCode("BAD_DURATION", "timeline.duration must be > 0");
  }

  addNode(context, { nodeId: "project.start", refBase: "project-start", field: "start", value: 0, path: null });
  addNode(context, { nodeId: "project.end", refBase: "project-end", field: "end", value: duration, path: null });
  context.refs.set("project-start", "project.start");
  context.refs.set("project-end", "project.end");

  const chapters = timeline.chapters ?? [];
  chapters.forEach((chapter, index) => {
    if (!chapter.id) throw withCode("MISSING_ID", `chapter[${index}] missing id`);
    addNode(context, { nodeId: `chapter.${chapter.id}.start`, refBase: `chapter-${chapter.id}`, field: "start", value: chapter.start, path: ["chapters", index, "start"] });
    if (chapter.end !== undefined) {
      addNode(context, { nodeId: `chapter.${chapter.id}.end`, refBase: `chapter-${chapter.id}`, field: "end", value: chapter.end, path: ["chapters", index, "end"] });
    }
  });

  const markers = timeline.markers ?? [];
  markers.forEach((marker, index) => {
    if (!marker.id) throw withCode("MISSING_ID", `marker[${index}] missing id`);
    addNode(context, { nodeId: `marker.${marker.id}.t`, refBase: `marker-${marker.id}`, field: "t", value: marker.t, path: ["markers", index, "t"] });
  });

  const tracks = timeline.tracks ?? [];
  tracks.forEach((track, trackIndex) => {
    (track.clips ?? []).forEach((clip, clipIndex) => {
      if (!clip.id) throw withCode("MISSING_ID", `clip in track[${trackIndex}] missing id`);
      addNode(context, { nodeId: `clip.${clip.id}.start`, refBase: `clip-${clip.id}`, field: "start", value: clip.start, path: ["tracks", trackIndex, "clips", clipIndex, "start"] });
      if (clip.dur !== undefined) {
        addNode(context, { nodeId: `clip.${clip.id}.dur`, refBase: `clip-${clip.id}`, field: "dur", value: clip.dur, path: ["tracks", trackIndex, "clips", clipIndex, "dur"] });
        addNode(context, {
          nodeId: `clip.${clip.id}.end`, refBase: `clip-${clip.id}`, field: "end",
          value: { offset: `clip-${clip.id}`, by: typeof clip.dur === "number" ? clip.dur : 0 },
          path: null,
        });
      }
    });
  });

  return context;
}

function addNode(context: TimeContext, def: NodeDef): void {
  const node: TimeNode = {
    nodeId: def.nodeId,
    refBase: def.refBase,
    field: def.field,
    raw: def.value,
    expr: parseExpr(def.value),
    path: def.path,
    deps: [],
    dependents: [],
  };
  context.nodes.set(node.nodeId, node);
  if (def.path) context.paths.push({ nodeId: node.nodeId, path: def.path });
  context.refs.set(`${def.refBase}.${def.field}`, def.nodeId);
  if (def.field === "start" || def.field === "t") {
    if (!context.refs.has(def.refBase)) context.refs.set(def.refBase, def.nodeId);
  }
}

function parseExpr(value: unknown): TimeExpr {
  if (typeof value === "number") return { kind: "number", value };
  if (!value || typeof value !== "object") {
    throw withCode("BAD_TIME", `expected number or symbolic, got ${JSON.stringify(value)}`);
  }
  const obj = value as Record<string, unknown>;
  const ops = ["at", "after", "before", "sync", "until", "offset"];
  const present = ops.filter((key) => key in obj);
  if (present.length !== 1) {
    throw withCode("BAD_TIME", `must contain exactly one operator: ${JSON.stringify(value)}`);
  }
  const op = present[0];
  const ref = op === "offset" ? obj.offset : obj[op];
  if (typeof ref !== "string" || !ref.trim()) {
    throw withCode("BAD_TIME", `${op} must reference a string symbol`);
  }
  return {
    kind: "expr",
    op,
    ref: ref.trim(),
    gap: typeof obj.gap === "number" ? obj.gap : 0,
    by: typeof obj.by === "number" ? obj.by : 0,
  };
}

function buildDependencyGraph(context: TimeContext): void {
  for (const node of context.nodes.values()) {
    if (node.expr.kind === "number") continue;
    const depId = resolveRefId(context, node.expr.ref, node.expr.op);
    node.deps.push(depId);
    context.nodes.get(depId)?.dependents.push(node.nodeId);
  }
}

function resolveRefId(context: TimeContext, ref: string, op: string): string {
  if (context.refs.has(ref)) {
    const id = context.refs.get(ref)!;
    if (op === "after" && (ref.startsWith("chapter-") || ref.startsWith("clip-"))) {
      const endKey = `${ref}.end`;
      if (context.refs.has(endKey)) return context.refs.get(endKey)!;
    }
    return id;
  }
  throw withCode("TIME_REF_NOT_FOUND", `unknown ref "${ref}"`, ref, listRefs(context));
}

function listRefs(context: TimeContext): string {
  return `available: ${[...context.refs.keys()].slice(0, 12).join(", ")}`;
}

function topologicallySort(context: TimeContext): string[] {
  const indeg = new Map<string, number>();
  for (const node of context.nodes.values()) indeg.set(node.nodeId, node.deps.length);
  const ready: string[] = [];
  for (const node of context.nodes.values()) {
    if (indeg.get(node.nodeId) === 0) ready.push(node.nodeId);
  }

  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const dep of context.nodes.get(id)!.dependents) {
      const next = (indeg.get(dep) ?? 1) - 1;
      indeg.set(dep, next);
      if (next === 0) ready.push(dep);
    }
  }

  if (order.length !== context.nodes.size) {
    const cyclic = [...context.nodes.keys()].filter((key) => !order.includes(key));
    throw withCode("TIME_CYCLE", `cycle detected: ${cyclic.join(", ")}`, cyclic[0], listRefs(context));
  }
  return order;
}

function resolveValues(nodes: Map<string, TimeNode>, order: string[]): Map<string, number> {
  const values = new Map<string, number>();
  for (const id of order) {
    const node = nodes.get(id)!;
    if (node.expr.kind === "number") {
      values.set(id, node.expr.value);
      continue;
    }
    const ref = values.get(node.deps[0]) ?? 0;
    let value = ref;
    if (node.expr.op === "after") value = ref + node.expr.gap;
    else if (node.expr.op === "before") value = ref - node.expr.gap;
    else if (node.expr.op === "offset") value = ref + node.expr.by;
    values.set(id, value);
  }
  return values;
}

function quantizeAll(values: Map<string, number>): void {
  for (const [key, value] of values.entries()) {
    values.set(key, quantize(value));
  }
}

function quantize(value: number): number {
  return Number((Math.round((value + 1e-9) * 10) / 10).toFixed(1));
}

function rangeCheck(nodes: Map<string, TimeNode>, values: Map<string, number>, duration: number): void {
  for (const node of nodes.values()) {
    const value = values.get(node.nodeId) ?? 0;
    if (value < 0 || value > duration + 1e-6) {
      throw withCode("TIME_OUT_OF_RANGE", `${node.nodeId} resolves to ${value}, outside [0, ${duration}]`, node.nodeId);
    }
  }
}

function materialize(context: TimeContext, values: Map<string, number>): unknown {
  const output = JSON.parse(JSON.stringify(context.timeline)) as Record<string, unknown>;
  for (const { nodeId, path } of context.paths) {
    let cursor = output as Record<string | number, unknown>;
    for (let index = 0; index < path.length - 1; index++) {
      cursor = cursor[path[index]] as Record<string | number, unknown>;
    }
    cursor[path[path.length - 1]] = values.get(nodeId);
  }
  return output;
}

function buildLookup(context: TimeContext, values: Map<string, number>): Record<string, number> {
  const lookup: Record<string, number> = {};
  for (const [refKey, nodeId] of context.refs.entries()) {
    const v = values.get(nodeId);
    if (v !== undefined) lookup[refKey] = v;
  }
  return lookup;
}

function withCode(code: string, message: string, ref?: string, hint?: string): TimeError {
  const error = new Error(message) as TimeError;
  error.code = code;
  if (ref !== undefined) error.ref = ref;
  if (hint !== undefined) error.hint = hint;
  return error;
}
