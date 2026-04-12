// Symbolic time resolver — adapted from POC W4.
// Resolves {at|after|before|sync|until|offset} expressions on a Timeline
// (tracks[].clips[]) into raw seconds, with cycle detection and 0.1s quantization.

export const GRID_SIZE = 0.1;

/**
 * Resolve all symbolic time values in a timeline.
 * @param {object} timeline - Timeline JSON (may contain TimeExpression objects)
 * @returns {{ok: true, value: object, lookup: object} | {ok: false, error: object}}
 */
export function resolveTimeline(timeline) {
  try {
    const context = buildContext(timeline);
    buildDependencyGraph(context);
    const order = topologicallySort(context.nodes);
    const values = resolveValues(context.nodes, order);
    quantizeAll(values);
    rangeCheck(context.nodes, values, timeline.duration);
    const resolved = materialize(context, values);
    const lookup = buildLookup(context, values);
    return { ok: true, value: resolved, lookup };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err.code || "TIME_RESOLVE_ERROR",
        message: err.message,
        ref: err.ref,
        hint: err.hint,
      },
    };
  }
}

/**
 * Resolve a single TimeValue into a number, given an already-resolved lookup.
 * @param {number|object} expr
 * @param {Record<string, number>} lookup
 * @param {number} duration
 * @returns {{ok: true, value: number} | {ok: false, error: object}}
 */
export function resolveExpression(expr, lookup, duration) {
  if (typeof expr === "number") {
    return { ok: true, value: quantize(expr) };
  }
  if (!expr || typeof expr !== "object") {
    return { ok: false, error: { code: "BAD_TIME", message: `bad time: ${JSON.stringify(expr)}` } };
  }
  const op = ["at", "after", "before", "sync", "until", "offset"].find((k) => k in expr);
  if (!op) {
    return { ok: false, error: { code: "BAD_TIME", message: "missing operator" } };
  }
  const ref = op === "offset" ? expr.offset : expr[op];
  const base = lookup[ref];
  if (base === undefined) {
    return {
      ok: false,
      error: {
        code: "TIME_REF_NOT_FOUND",
        message: `unknown ref "${ref}"`,
        ref,
        hint: `available: ${Object.keys(lookup).slice(0, 10).join(", ")}`,
      },
    };
  }
  let val = base;
  if (op === "after") val = base + (expr.gap || 0);
  if (op === "before") val = base - (expr.gap || 0);
  if (op === "offset") val = base + (expr.by || 0);
  return { ok: true, value: quantize(val) };
}

function buildContext(timeline) {
  const ctx = {
    timeline,
    nodes: new Map(),
    refs: new Map(),
    paths: [],
  };
  const duration = timeline.duration;
  if (typeof duration !== "number" || duration <= 0) {
    throw withCode("BAD_DURATION", "timeline.duration must be > 0");
  }
  addNode(ctx, {
    nodeId: "project.start",
    refBase: "project-start",
    field: "start",
    value: 0,
    path: null,
  });
  addNode(ctx, {
    nodeId: "project.end",
    refBase: "project-end",
    field: "end",
    value: duration,
    path: null,
  });
  ctx.refs.set("project-start", "project.start");
  ctx.refs.set("project-end", "project.end");

  const chapters = timeline.chapters || [];
  chapters.forEach((ch, i) => {
    if (!ch.id) throw withCode("MISSING_ID", `chapter[${i}] missing id`);
    addNode(ctx, {
      nodeId: `chapter.${ch.id}.start`,
      refBase: `chapter-${ch.id}`,
      field: "start",
      value: ch.start,
      path: ["chapters", i, "start"],
    });
    if (ch.end !== undefined) {
      addNode(ctx, {
        nodeId: `chapter.${ch.id}.end`,
        refBase: `chapter-${ch.id}`,
        field: "end",
        value: ch.end,
        path: ["chapters", i, "end"],
      });
    }
  });

  const markers = timeline.markers || [];
  markers.forEach((m, i) => {
    if (!m.id) throw withCode("MISSING_ID", `marker[${i}] missing id`);
    addNode(ctx, {
      nodeId: `marker.${m.id}.t`,
      refBase: `marker-${m.id}`,
      field: "t",
      value: m.t,
      path: ["markers", i, "t"],
    });
  });

  const tracks = timeline.tracks || [];
  tracks.forEach((trk, ti) => {
    (trk.clips || []).forEach((clip, ci) => {
      if (!clip.id) throw withCode("MISSING_ID", `clip in track[${ti}] missing id`);
      addNode(ctx, {
        nodeId: `clip.${clip.id}.start`,
        refBase: `clip-${clip.id}`,
        field: "start",
        value: clip.start,
        path: ["tracks", ti, "clips", ci, "start"],
      });
      if (clip.dur !== undefined) {
        addNode(ctx, {
          nodeId: `clip.${clip.id}.dur`,
          refBase: `clip-${clip.id}`,
          field: "dur",
          value: clip.dur,
          path: ["tracks", ti, "clips", ci, "dur"],
        });
      }
    });
  });

  return ctx;
}

function addNode(ctx, def) {
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
  ctx.nodes.set(node.nodeId, node);
  if (def.path) ctx.paths.push({ nodeId: node.nodeId, path: def.path });
  // Register refs
  ctx.refs.set(`${def.refBase}.${def.field}`, def.nodeId);
  if (def.field === "start" || def.field === "t") {
    if (!ctx.refs.has(def.refBase)) ctx.refs.set(def.refBase, def.nodeId);
  }
}

function parseExpr(value) {
  if (typeof value === "number") return { kind: "number", value };
  if (!value || typeof value !== "object") {
    throw withCode("BAD_TIME", `expected number or symbolic, got ${JSON.stringify(value)}`);
  }
  const ops = ["at", "after", "before", "sync", "until", "offset"];
  const present = ops.filter((k) => k in value);
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

function buildDependencyGraph(ctx) {
  for (const node of ctx.nodes.values()) {
    if (node.expr.kind === "number") continue;
    const depId = resolveRefId(ctx, node.expr.ref, node.expr.op);
    node.deps.push(depId);
    ctx.nodes.get(depId).dependents.push(node.nodeId);
  }
}

function resolveRefId(ctx, ref, op) {
  // direct hit
  if (ctx.refs.has(ref)) {
    const id = ctx.refs.get(ref);
    // for "after" on chapter/clip, prefer .end if available
    if (op === "after") {
      if (ref.startsWith("chapter-") || ref.startsWith("clip-")) {
        const endKey = `${ref}.end`;
        if (ctx.refs.has(endKey)) return ctx.refs.get(endKey);
      }
    }
    return id;
  }
  throw withCode("TIME_REF_NOT_FOUND", `unknown ref "${ref}"`, ref, listRefs(ctx));
}

function listRefs(ctx) {
  return `available: ${[...ctx.refs.keys()].slice(0, 12).join(", ")}`;
}

function topologicallySort(nodes) {
  const indeg = new Map();
  for (const node of nodes.values()) indeg.set(node.nodeId, node.deps.length);
  const ready = [];
  for (const node of nodes.values()) if (indeg.get(node.nodeId) === 0) ready.push(node.nodeId);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const dep of nodes.get(id).dependents) {
      const next = indeg.get(dep) - 1;
      indeg.set(dep, next);
      if (next === 0) ready.push(dep);
    }
  }
  if (order.length !== nodes.size) {
    const cyclic = [...nodes.keys()].filter((k) => !order.includes(k));
    throw withCode("TIME_CYCLE", `cycle detected: ${cyclic.join(", ")}`);
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
    let val = ref;
    if (node.expr.op === "after") val = ref + node.expr.gap;
    else if (node.expr.op === "before") val = ref - node.expr.gap;
    else if (node.expr.op === "offset") val = ref + node.expr.by;
    // at | sync | until → use ref directly
    values.set(id, val);
  }
  return values;
}

function quantizeAll(values) {
  for (const [k, v] of values.entries()) values.set(k, quantize(v));
}

function quantize(v) {
  return Number(((Math.round((v + 1e-9) * 10)) / 10).toFixed(1));
}

function rangeCheck(nodes, values, duration) {
  for (const node of nodes.values()) {
    const v = values.get(node.nodeId);
    if (v < 0 || v > duration + 1e-6) {
      throw withCode(
        "TIME_OUT_OF_RANGE",
        `${node.nodeId} resolves to ${v}, outside [0, ${duration}]`,
        node.nodeId
      );
    }
  }
}

function materialize(ctx, values) {
  const out = JSON.parse(JSON.stringify(ctx.timeline));
  for (const { nodeId, path } of ctx.paths) {
    let cursor = out;
    for (let i = 0; i < path.length - 1; i++) cursor = cursor[path[i]];
    cursor[path[path.length - 1]] = values.get(nodeId);
  }
  return out;
}

function buildLookup(ctx, values) {
  const lookup = {};
  for (const [refKey, nodeId] of ctx.refs.entries()) {
    lookup[refKey] = values.get(nodeId);
  }
  return lookup;
}

function withCode(code, message, ref, hint) {
  const e = new Error(message);
  e.code = code;
  if (ref) e.ref = ref;
  if (hint) e.hint = hint;
  return e;
}
