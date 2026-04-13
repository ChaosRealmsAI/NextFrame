// AI tool definitions — v0.3 layers[] format.
import { REGISTRY, listScenes, getScene } from '../engine-v2/registry.js';
import { validateTimeline } from '../engine-v2/validate.js';
import { describeAt } from '../engine-v2/describe.js';
import { addLayer, removeLayer, moveLayer, resizeLayer, setLayerProp, listLayers } from '../engine-v2/ops.js';

export const TOOLS = {
  list_scenes: {
    schema: { name: "list_scenes", description: "List all v0.3 scenes from registry", params: [] },
    handler: () => ({ ok: true, value: listScenes() }),
  },
  get_scene: {
    schema: {
      name: "get_scene",
      description: "Get scene metadata by id",
      params: [{ name: "id", type: "string", required: true }],
    },
    handler: ({ id }) => {
      const scene = getScene(id);
      if (!scene) return { ok: false, error: { code: "UNKNOWN_SCENE", message: `no scene "${id}"` } };
      return { ok: true, value: scene };
    },
  },
  validate_timeline: {
    schema: {
      name: "validate_timeline",
      description: "Validate v0.3 layers[] timeline",
      params: [{ name: "timeline", type: "object", required: true }],
    },
    handler: ({ timeline }) => validateTimeline(timeline),
  },
  describe_frame: {
    schema: {
      name: "describe_frame",
      description: "Describe active layers at time t",
      params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }],
    },
    handler: ({ timeline, t }) => describeAt(timeline, t),
  },
  find_layers: {
    schema: {
      name: "find_layers",
      description: "Search layers by scene or time",
      params: [{ name: "timeline", type: "object", required: true }, { name: "scene", type: "string" }, { name: "at", type: "number" }],
    },
    handler: ({ timeline, scene, at }) => {
      const matches = [];
      for (const layer of timeline.layers || []) {
        if (scene && layer.scene !== scene) continue;
        if (typeof at === "number" && (at < layer.start || at >= layer.start + layer.dur)) continue;
        matches.push({ id: layer.id, scene: layer.scene, start: layer.start, dur: layer.dur, end: layer.start + layer.dur });
      }
      return { ok: true, value: matches };
    },
  },
  get_layer: {
    schema: {
      name: "get_layer",
      description: "Get full layer details by id",
      params: [{ name: "timeline", type: "object", required: true }, { name: "layerId", type: "string", required: true }],
    },
    handler: ({ timeline, layerId }) => {
      const layer = (timeline.layers || []).find(l => l.id === layerId);
      if (!layer) return { ok: false, error: { code: "NOT_FOUND", message: `no layer "${layerId}"` } };
      return { ok: true, value: { ...layer, sceneMeta: REGISTRY.get(layer.scene) || null } };
    },
  },
  list_layers: {
    schema: {
      name: "list_layers",
      description: "List all layers with timing",
      params: [{ name: "timeline", type: "object", required: true }],
    },
    handler: ({ timeline }) => listLayers(timeline),
  },
  apply_patch: {
    schema: {
      name: "apply_patch",
      description: "Apply layer mutations then validate",
      params: [{ name: "timeline", type: "object", required: true }, { name: "ops", type: "array", required: true }],
    },
    handler: ({ timeline, ops }) => {
      if (!Array.isArray(ops)) return { ok: false, error: { code: "BAD_OPS", message: "ops must be an array" } };
      const tl = JSON.parse(JSON.stringify(timeline));
      let applied = 0;
      for (const op of ops) {
        const result = applyLayerOp(tl, op);
        if (!result.ok) return result;
        applied += 1;
      }
      return { ok: true, value: { timeline: tl, validation: validateTimeline(tl), applied } };
    },
  },
  assert_at: {
    schema: {
      name: "assert_at",
      description: "Assert conditions at time t",
      params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }, { name: "checks", type: "array", required: true }],
    },
    handler: ({ timeline, t, checks }) => {
      if (!Array.isArray(checks)) return { ok: false, error: { code: "BAD_CHECKS", message: "checks must be an array" } };
      const frame = describeAt(timeline, t);
      if (!frame.ok) return frame;
      const failed = [];
      let passed = 0;
      for (const check of checks) {
        const result = evaluateCheck(frame.value, check);
        if (!result.ok) return result;
        if (result.value.pass) passed += 1;
        else failed.push({ check, expected: result.value.expected, actual: result.value.actual });
      }
      return { ok: true, value: { t, passed, failed, total: checks.length } };
    },
  },
};

export const TOOL_DEFINITIONS = Object.fromEntries(Object.entries(TOOLS).map(([name, tool]) => [name, { description: tool.schema.description }]));

function applyLayerOp(timeline, op) {
  if (!op || typeof op !== "object") {
    return { ok: false, error: { code: "BAD_OP", message: "op must be an object" } };
  }
  switch (op.op) {
    case "add-layer":
      return addLayer(timeline, op.layer || op);
    case "remove-layer":
      return removeLayer(timeline, op.id || op.layerId);
    case "move-layer":
      return moveLayer(timeline, op.id || op.layerId, op.start);
    case "resize-layer":
      return resizeLayer(timeline, op.id || op.layerId, op.dur);
    case "set-prop":
      return setLayerProp(timeline, op.id || op.layerId, op.key, op.value);
    default:
      return { ok: false, error: { code: "UNSUPPORTED_OP", message: `unsupported op "${op.op}"` } };
  }
}

function evaluateCheck(frame, check) {
  if (!check || typeof check !== "object") {
    return { ok: false, error: { code: "BAD_CHECK", message: "check must be an object" } };
  }
  const active = frame.active || [];
  switch (check.type) {
    case "layer_visible": {
      const actual = active.some((l) => l.id === check.layerId);
      const expected = check.visible ?? true;
      return { ok: true, value: { pass: actual === expected, expected, actual } };
    }
    case "scene_active": {
      const actual = active.some((l) => l.scene === check.scene);
      const expected = check.active ?? true;
      return { ok: true, value: { pass: actual === expected, expected, actual } };
    }
    case "layer_count": {
      const actual = active.length;
      const expected = check.min ?? 0;
      return { ok: true, value: { pass: actual >= expected, expected: { min: expected }, actual } };
    }
    default:
      return { ok: false, error: { code: "UNSUPPORTED_CHECK", message: `unsupported check "${check.type}"` } };
  }
}
