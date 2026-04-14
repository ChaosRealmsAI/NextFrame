// Legacy symbolic-time resolver kept outside engine/.

import { guarded } from "./guard.js";

export const GRID_SIZE = 0.1;

export function resolveTimeline(timeline) {
  try {
    const context = buildContext(timeline);
    buildDependencyGraph(context);
    const order = topologicallySort(context);
    const values = resolveValues(context.nodes, order);
    quantizeAll(values);
    rangeCheck(context.nodes, values, timeline.duration);
    const resolved = materialize(context, values);
    const lookup = buildLookup(context, values);
    return guarded("resolveTimeline", { ok: true, value: resolved, lookup });
  } catch (error) {
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

export function resolveExpression(expr, lookup, duration) {
  if (typeof expr === "number") {
    return guarded("resolveExpression", { ok: true, value: quantize(expr) });
  }
  if (!expr || typeof expr !== "object") {
    return guarded("resolveExpression", { ok: false, error: { code: "BAD_TIME", message: `bad time: ${JSON.stringify(expr)}` } });
  }

  const op = ["at", "after", "before", "sync", "until", "offset"].find((key) => key in expr);
  if (!op) {
    return guarded("resolveExpression", { ok: false, error: { code: "BAD_TIME", message: "missing operator" } });
  }
  const ref = op === "offset" ? expr.offset : expr[op];
  const base = lookup[ref];
  if (base === undefined) {
    return guarded("resolveExpression", {
      ok: false,
      error: {
        code: "TIME_REF_NOT_FOUND",
        message: `unknown ref "${ref}"`,
        ref,
        hint: `available: ${Object.keys(lookup).slice(0, 10).join(", ")}`,
      },
    });
  }

  let value = base;
  if (op === "after") value = base + (expr.gap || 0);
  if (op === "before") value = base - (expr.gap || 0);
  if (op === "offset") value = base + (expr.by || 0);
  if (value < 0 || value > duration + 1e-6) {
    return guarded("resolveExpression", { ok: false, error: { code: "TIME_OUT_OF_RANGE", message: `resolved time ${quantize(value)} outside [0, ${duration}]`, ref } });
  }
  return guarded("resolveExpression", { ok: true, value: quantize(value) });
}

function buildContext(timeline) {
  const context = {
    timeline,
    nodes: new Map(),
    refs: new Map(),
    paths: [],
  };
  const duration = timeline.duration;
  if (typeof duration !== "number" || duration <= 0) {
    throw withCode("BAD_DURATION", "timeline.duration must be > 0");
  }

  addNode(context, {
    nodeId: "project.start",
    refBase: "project-start",
    field: "start",
    value: 0,
    path: null,
  });
  addNode(context, {
    nodeId: "project.end",
    refBase: "project-end",
    field: "end",
    value: duration,
    path: null,
  });
  context.refs.set("project-start", "project.start");
  context.refs.set("project-end", "project.end");

  const chapters = timeline.chapters || [];
  chapters.forEach((chapter, index) => {
    if (!chapter.id) throw withCode("MISSING_ID", `chapter[${index}] missing id`);
    addNode(context, {
      nodeId: `chapter.${chapter.id}.start`,
      refBase: `chapter-${chapter.id}`,
      field: "start",
      value: chapter.start,
      path: ["chapters", index, "start"],
    });
    if (chapter.end !== undefined) {
      addNode(context, {
        nodeId: `chapter.${chapter.id}.end`,
        refBase: `chapter-${chapter.id}`,
        field: "end",
        value: chapter.end,
        path: ["chapters", index, "end"],
      });
    }
  });

  const markers = timeline.markers || [];
  markers.forEach((marker, index) => {
    if (!marker.id) throw withCode("MISSING_ID", `marker[${index}] missing id`);
    addNode(context, {
      nodeId: `marker.${marker.id}.t`,
      refBase: `marker-${marker.id}`,
      field: "t",
      value: marker.t,
      path: ["markers", index, "t"],
    });
  });

  const tracks = timeline.tracks || [];
  tracks.forEach((track, trackIndex) => {
    (track.clips || []).forEach((clip, clipIndex) => {
      if (!clip.id) throw withCode("MISSING_ID", `clip in track[${trackIndex}] missing id`);
      addNode(context, {
        nodeId: `clip.${clip.id}.start`,
        refBase: `clip-${clip.id}`,
        field: "start",
        value: clip.start,
        path: ["tracks", trackIndex, "clips", clipIndex, "start"],
      });
      if (clip.dur !== undefined) {
        addNode(context, {
          nodeId: `clip.${clip.id}.dur`,
          refBase: `clip-${clip.id}`,
          field: "dur",
          value: clip.dur,
          path: ["tracks", trackIndex, "clips", clipIndex, "dur"],
        });
        addNode(context, {
          nodeId: `clip.${clip.id}.end`,
          refBase: `clip-${clip.id}`,
          field: "end",
          value: { offset: `clip-${clip.id}`, by: typeof clip.dur === "number" ? clip.dur : 0 },
          path: null,
        });
      }
    });
  });

  return context;
}

function addNode(context, def) {
  const node = {
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

function parseExpr(value) {
  if (typeof value === "number") return { kind: "number", value };
  if (!value || typeof value !== "object") {
    throw withCode("BAD_TIME", `expected number or symbolic, got ${JSON.stringify(value)}`);
  }

  const ops = ["at", "after", "before", "sync", "until", "offset"];
  const present = ops.filter((key) => key in value);
  if (present.length !== 1) {
    throw withCode("BAD_TIME", `must contain exactly one operator: ${JSON.stringify(value)}`);
  }
  const op = present[0];
  const ref = op === "offset" ? value.offset : value[op];
  if (typeof ref !== "string" || !ref.trim()) {
    throw withCode("BAD_TIME", `${op} must reference a string symbol`);
  }

  return {
    kind: "expr",
    op,
    ref: ref.trim(),
    gap: typeof value.gap === "number" ? value.gap : 0,
    by: typeof value.by === "number" ? value.by : 0,
  };
}

function buildDependencyGraph(context) {
  for (const node of context.nodes.values()) {
    if (node.expr.kind === "number") continue;
    const depId = resolveRefId(context, node.expr.ref, node.expr.op);
    node.deps.push(depId);
    context.nodes.get(depId).dependents.push(node.nodeId);
  }
}

function resolveRefId(context, ref, op) {
  if (context.refs.has(ref)) {
    const id = context.refs.get(ref);
    if (op === "after" && (ref.startsWith("chapter-") || ref.startsWith("clip-"))) {
      const endKey = `${ref}.end`;
      if (context.refs.has(endKey)) return context.refs.get(endKey);
    }
    return id;
  }
  throw withCode("TIME_REF_NOT_FOUND", `unknown ref "${ref}"`, ref, listRefs(context));
}

function listRefs(context) {
  return `available: ${[...context.refs.keys()].slice(0, 12).join(", ")}`;
}

function topologicallySort(context) {
  const indeg = new Map();
  for (const node of context.nodes.values()) indeg.set(node.nodeId, node.deps.length);
  const ready = [];
  for (const node of context.nodes.values()) {
    if (indeg.get(node.nodeId) === 0) ready.push(node.nodeId);
  }

  const order = [];
  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const dep of context.nodes.get(id).dependents) {
      const next = indeg.get(dep) - 1;
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

function resolveValues(nodes, order) {
  const values = new Map();
  for (const id of order) {
    const node = nodes.get(id);
    if (node.expr.kind === "number") {
      values.set(id, node.expr.value);
      continue;
    }

    const ref = values.get(node.deps[0]);
    let value = ref;
    if (node.expr.op === "after") value = ref + node.expr.gap;
    else if (node.expr.op === "before") value = ref - node.expr.gap;
    else if (node.expr.op === "offset") value = ref + node.expr.by;
    values.set(id, value);
  }
  return values;
}

function quantizeAll(values) {
  for (const [key, value] of values.entries()) {
    values.set(key, quantize(value));
  }
}

function quantize(value) {
  return Number((Math.round((value + 1e-9) * 10) / 10).toFixed(1));
}

function rangeCheck(nodes, values, duration) {
  for (const node of nodes.values()) {
    const value = values.get(node.nodeId);
    if (value < 0 || value > duration + 1e-6) {
      throw withCode("TIME_OUT_OF_RANGE", `${node.nodeId} resolves to ${value}, outside [0, ${duration}]`, node.nodeId);
    }
  }
}

function materialize(context, values) {
  const output = JSON.parse(JSON.stringify(context.timeline));
  for (const { nodeId, path } of context.paths) {
    let cursor = output;
    for (let index = 0; index < path.length - 1; index++) cursor = cursor[path[index]];
    cursor[path[path.length - 1]] = values.get(nodeId);
  }
  return output;
}

function buildLookup(context, values) {
  const lookup = {};
  for (const [refKey, nodeId] of context.refs.entries()) {
    lookup[refKey] = values.get(nodeId);
  }
  return lookup;
}

function withCode(code, message, ref, hint) {
  const error = new Error(message);
  error.code = code;
  if (ref) error.ref = ref;
  if (hint) error.hint = hint;
  return error;
}
