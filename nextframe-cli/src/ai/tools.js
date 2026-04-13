import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describeAt } from "../engine-v2/describe.js";
import { addLayer, listLayers, moveLayer, removeLayer, resizeLayer, setLayerProps } from "../engine-v2/ops.js";
import { getScene, listScenes } from "../engine-v2/scenes.js";
import { cloneTimeline, findLayer, listActiveLayers } from "../engine-v2/timeline.js";
import { validateTimeline } from "../engine-v2/validate.js";
import { captureFrameToFile } from "../targets/browser.js";
import { pngToAscii } from "../views/ascii.js";
import { renderGantt } from "../views/gantt.js";

export const TOOLS = {
  list_scenes: makeTool("list_scenes", "List all v0.3 scenes", [], () => ({ ok: true, value: listScenes() })),
  get_scene: makeTool(
    "get_scene",
    "Get one v0.3 scene",
    [{ name: "id", type: "string", required: true }],
    ({ id }) => {
      const scene = getScene(id);
      return scene
        ? { ok: true, value: scene }
        : { ok: false, error: { code: "UNKNOWN_SCENE", message: `unknown scene "${id}"` } };
    },
  ),
  validate_timeline: makeTool(
    "validate_timeline",
    "Validate a v0.3 timeline",
    [{ name: "timeline", type: "object", required: true }],
    ({ timeline }) => ({ ok: true, value: validateTimeline(timeline) }),
  ),
  describe_frame: makeTool(
    "describe_frame",
    "Describe active layers at time t",
    [
      { name: "timeline", type: "object", required: true },
      { name: "t", type: "number", required: true },
    ],
    ({ timeline, t }) => {
      const described = describeAt(timeline, Number(t) || 0);
      if (!described.ok) return described;
      return {
        ok: true,
        value: {
          t: described.value.t,
          active_layers: described.value.active,
        },
      };
    },
  ),
  list_layers: makeTool(
    "list_layers",
    "List layers with timing",
    [{ name: "timeline", type: "object", required: true }],
    ({ timeline }) => listLayers(timeline),
  ),
  get_layer: makeTool(
    "get_layer",
    "Get one layer by id",
    [
      { name: "timeline", type: "object", required: true },
      { name: "layerId", type: "string", required: true },
    ],
    ({ timeline, layerId }) => {
      const layer = findLayer(timeline, layerId);
      if (!layer) {
        return { ok: false, error: { code: "NOT_FOUND", message: `layer "${layerId}" not found` } };
      }
      return { ok: true, value: layer };
    },
  ),
  find_layers: makeTool(
    "find_layers",
    "Filter layers by scene, time, or param name",
    [
      { name: "timeline", type: "object", required: true },
      { name: "scene", type: "string" },
      { name: "at", type: "number" },
      { name: "param", type: "string" },
    ],
    ({ timeline, scene, at, param }) => {
      const time = at === undefined ? null : Number(at);
      const matches = (timeline?.layers || []).filter((layer) => {
        if (scene && layer.scene !== scene) return false;
        if (param && !Object.hasOwn(layer.params || {}, param)) return false;
        if (time !== null && !(time >= Number(layer.start) && time < Number(layer.start) + Number(layer.dur))) {
          return false;
        }
        return true;
      });
      return { ok: true, value: matches };
    },
  ),
  apply_layer_ops: makeTool(
    "apply_layer_ops",
    "Apply v0.3 layer operations",
    [
      { name: "timeline", type: "object", required: true },
      { name: "ops", type: "array", required: true },
    ],
    ({ timeline, ops }) => {
      if (!Array.isArray(ops)) {
        return { ok: false, error: { code: "BAD_OPS", message: "ops must be an array" } };
      }
      const working = cloneTimeline(timeline);
      let applied = 0;
      for (const op of ops) {
        const result = applyLayerOp(working, op);
        if (!result.ok) return result;
        applied += 1;
      }
      return {
        ok: true,
        value: {
          timeline: working,
          applied,
          validation: validateTimeline(working),
        },
      };
    },
  ),
  assert_frame: makeTool(
    "assert_frame",
    "Evaluate assertions at time t",
    [
      { name: "timeline", type: "object", required: true },
      { name: "t", type: "number", required: true },
      { name: "checks", type: "array", required: true },
    ],
    ({ timeline, t, checks }) => {
      if (!Array.isArray(checks)) {
        return { ok: false, error: { code: "BAD_CHECKS", message: "checks must be an array" } };
      }
      const active = listActiveLayers(timeline, Number(t) || 0);
      const failed = [];
      let passed = 0;
      for (const check of checks) {
        const outcome = evaluateCheck(timeline, active, check, Number(t) || 0);
        if (!outcome.ok) return outcome;
        if (outcome.value.pass) passed += 1;
        else failed.push({ check, expected: outcome.value.expected, actual: outcome.value.actual });
      }
      return { ok: true, value: { t: Number(t) || 0, passed, total: checks.length, failed } };
    },
  ),
  gantt_ascii: makeTool(
    "gantt_ascii",
    "Render an ASCII gantt for a v0.3 timeline",
    [
      { name: "timeline", type: "object", required: true },
      { name: "width", type: "number" },
    ],
    ({ timeline, width }) => ({ ok: true, value: renderGantt(timeline, Number(width) || 72) }),
  ),
  render_ascii: makeTool(
    "render_ascii",
    "Render one frame to ASCII",
    [
      { name: "timeline", type: "object", required: true },
      { name: "t", type: "number", required: true },
      { name: "width", type: "number" },
    ],
    async ({ timeline, t, width }) => {
      const tempDir = await mkdtemp(join(tmpdir(), "nextframe-ascii-"));
      const framePath = join(tempDir, "frame.png");
      try {
        const captured = await captureFrameToFile(timeline, framePath, { t: Number(t) || 0 });
        if (!captured.ok) return captured;
        const png = await readFile(framePath);
        return {
          ok: true,
          value: await pngToAscii(png, Number(width) || 80, 24),
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ),
};

export const TOOL_DEFINITIONS = Object.fromEntries(
  Object.entries(TOOLS).map(([name, tool]) => [name, { description: tool.schema.description }]),
);

function makeTool(name, description, params, handler) {
  return {
    schema: {
      name,
      description,
      params,
    },
    handler,
  };
}

function applyLayerOp(timeline, op) {
  if (!op || typeof op !== "object") {
    return { ok: false, error: { code: "BAD_OP", message: "op must be an object" } };
  }
  switch (op.op) {
    case "add_layer":
      return addLayer(timeline, op.layer);
    case "remove_layer":
      return removeLayer(timeline, op.id || op.layerId);
    case "move_layer":
      return moveLayer(timeline, op.id || op.layerId, op.start);
    case "resize_layer":
      return resizeLayer(timeline, op.id || op.layerId, op.dur);
    case "set_layer_props":
      return setLayerProps(timeline, op.id || op.layerId, op.props || {});
    default:
      return { ok: false, error: { code: "UNSUPPORTED_OP", message: `unsupported op "${op.op}"` } };
  }
}

function evaluateCheck(timeline, active, check, t) {
  if (!check || typeof check !== "object") {
    return { ok: false, error: { code: "BAD_CHECK", message: "check must be an object" } };
  }
  switch (check.type) {
    case "layer_visible": {
      const actual = active.some((layer) => layer.id === check.layerId);
      return { ok: true, value: { pass: actual, expected: true, actual } };
    }
    case "scene_active": {
      const actual = active.some((layer) => layer.scene === check.scene);
      return { ok: true, value: { pass: actual, expected: true, actual } };
    }
    case "layer_count": {
      const actual = active.length;
      const expected = Number(check.min) || 0;
      return { ok: true, value: { pass: actual >= expected, expected: { min: expected }, actual } };
    }
    case "chapter_active": {
      const actual = (timeline?.chapters || []).some((chapter) => {
        const end = chapter.end === undefined ? Infinity : Number(chapter.end);
        return chapter.id === check.chapter && t >= Number(chapter.start) && t < end;
      });
      return { ok: true, value: { pass: actual, expected: true, actual } };
    }
    default:
      return { ok: false, error: { code: "UNSUPPORTED_CHECK", message: `unsupported check "${check.type}"` } };
  }
}
