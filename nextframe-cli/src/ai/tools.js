import { REGISTRY } from "../scenes/index.js";
import { getSceneMeta, listSceneMeta } from "../scenes/meta.js";
import { validateTimeline } from "../engine/validate.js";
import { resolveTimeline, resolveExpression } from "../engine/time.js";
import { describeAt } from "../engine/describe.js";
import { renderGantt as gantt } from "../views/gantt.js";
import { pngToAscii } from "../views/ascii.js";
import { addClip, addMarker, moveClip, removeClip, resizeClip, setParam } from "../timeline/ops.js";

export const TOOLS = {
  list_scenes: {
    schema: { name: "list_scenes", description: "List all scenes and their META", params: [] },
    handler: () => ({ ok: true, value: listSceneMeta() }),
  },
  get_scene_meta: {
    schema: {
      name: "get_scene_meta",
      description: "Get META for a single scene",
      params: [{ name: "id", type: "string", required: true }],
    },
    handler: ({ id }) => {
      const meta = getSceneMeta(id);
      if (!meta) return { ok: false, error: { code: "UNKNOWN_SCENE", message: `no scene "${id}"` } };
      return { ok: true, value: meta };
    },
  },
  validate_timeline: {
    schema: {
      name: "validate_timeline",
      description: "Run 6 safety gates",
      params: [{ name: "timeline", type: "object", required: true }],
    },
    handler: ({ timeline }) => ({ ok: true, value: validateTimeline(timeline) }),
  },
  resolve_time: {
    schema: {
      name: "resolve_time",
      description: "Resolve a symbolic time expression against a timeline",
      params: [{ name: "timeline", type: "object", required: true }, { name: "expr", type: "object", required: true }],
    },
    handler: ({ timeline, expr }) => {
      const r = resolveTimeline(timeline);
      if (!r.ok) return r;
      const lookup = withShorthandRefs(r.lookup || {}, r.value);
      return resolveExpression(expr, lookup, timeline.duration);
    },
  },
  describe_frame: {
    schema: {
      name: "describe_frame",
      description: "Semantic metadata at time t",
      params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }],
    },
    handler: ({ timeline, t }) => describeAt(timeline, t),
  },
  find_clips: {
    schema: {
      name: "find_clips",
      description: "Search clips by predicate",
      params: [{ name: "timeline", type: "object", required: true }, { name: "scene", type: "string" }, { name: "track", type: "string" }, { name: "at", type: "number" }, { name: "param", type: "string" }],
    },
    handler: ({ timeline, scene, track, at, param }) => {
      const r = resolveTimeline(timeline);
      if (!r.ok) return r;
      const matches = [];
      for (const trk of r.value.tracks || []) {
        if (track && trk.id !== track) continue;
        for (const clip of trk.clips || []) {
          if (scene && clip.scene !== scene) continue;
          if (typeof at === "number" && (at < clip.start || at > clip.start + clip.dur)) continue;
          if (param && !Object.prototype.hasOwnProperty.call(clip.params || {}, param)) continue;
          matches.push({
            trackId: trk.id,
            clipId: clip.id,
            scene: clip.scene,
            start: clip.start,
            dur: clip.dur,
            params: clip.params || {},
          });
        }
      }
      return { ok: true, value: matches };
    },
  },
  get_clip: {
    schema: {
      name: "get_clip",
      description: "Get full clip details by id",
      params: [{ name: "timeline", type: "object", required: true }, { name: "clipId", type: "string", required: true }],
    },
    handler: ({ timeline, clipId }) => {
      const r = resolveTimeline(timeline);
      if (!r.ok) return r;
      const original = findClipEntry(timeline, clipId);
      const resolved = findClipEntry(r.value, clipId);
      if (!original || !resolved) {
        return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"` } };
      }
      return {
        ok: true,
        value: {
          trackId: original.trackId,
          clip: clone(original.clip),
          resolvedStart: resolved.clip.start,
          meta: REGISTRY.get(original.clip.scene)?.META || null,
        },
      };
    },
  },
  apply_patch: {
    schema: {
      name: "apply_patch",
      description: "Apply timeline mutations then validate",
      params: [{ name: "timeline", type: "object", required: true }, { name: "ops", type: "array", required: true }],
    },
    handler: ({ timeline, ops }) => {
      if (!Array.isArray(ops)) return { ok: false, error: { code: "BAD_OPS", message: "ops must be an array" } };
      let next = timeline;
      let applied = 0;
      for (const op of ops) {
        const result = applyTimelineOp(next, op);
        if (!result.ok) return result;
        next = result.value;
        applied += 1;
      }
      return { ok: true, value: { timeline: next, validation: validateTimeline(next), applied } };
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
  render_ascii: {
    schema: {
      name: "render_ascii",
      description: "ASCII art of frame at time t",
      params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }, { name: "width", type: "number" }],
    },
    handler: async ({ timeline, t, width }) => {
      const targetModule = "../targets/" + "napi-canvas.js";
      const { renderFramePNG } = await import(targetModule);
      const rendered = renderFramePNG(timeline, t, { width: 640, height: 360 });
      if (!rendered.ok) return rendered;
      try {
        return { ok: true, value: await pngToAscii(rendered.value, width || 80, 24) };
      } catch (error) {
        return { ok: false, error: { code: "ASCII_RENDER_FAILED", message: error.message } };
      }
    },
  },
  gantt_ascii: {
    schema: {
      name: "gantt_ascii",
      description: "ASCII gantt chart of the timeline",
      params: [{ name: "timeline", type: "object", required: true }, { name: "width", type: "number", required: false }],
    },
    handler: ({ timeline, width }) => {
      const r = resolveTimeline(timeline);
      if (!r.ok) return r;
      return { ok: true, value: gantt(r.value, { width: width || 80 }) };
    },
  },
  suggest_clip_at: {
    schema: {
      name: "suggest_clip_at",
      description: "Return clips active at time t",
      params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }],
    },
    handler: ({ timeline, t }) => {
      const r = resolveTimeline(timeline);
      if (!r.ok) return r;
      const active = [];
      for (const trk of r.value.tracks || []) {
        for (const clip of trk.clips || []) {
          if (t >= clip.start && t <= clip.start + clip.dur) {
            active.push({ track: trk.id, id: clip.id, scene: clip.scene });
          }
        }
      }
      return { ok: true, value: active };
    },
  },
};

export const TOOL_DEFINITIONS = Object.fromEntries(Object.entries(TOOLS).map(([name, tool]) => [name, { description: tool.schema.description }]));

function withShorthandRefs(lookup, timeline) {
  const aliases = { ...lookup };
  for (const marker of timeline.markers || []) {
    if (marker?.id && aliases[marker.id] === undefined && lookup[`marker-${marker.id}`] !== undefined) {
      aliases[marker.id] = lookup[`marker-${marker.id}`];
    }
  }
  for (const chapter of timeline.chapters || []) {
    if (chapter?.id && aliases[chapter.id] === undefined && lookup[`chapter-${chapter.id}`] !== undefined) {
      aliases[chapter.id] = lookup[`chapter-${chapter.id}`];
    }
  }
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip?.id && aliases[clip.id] === undefined && lookup[`clip-${clip.id}`] !== undefined) {
        aliases[clip.id] = lookup[`clip-${clip.id}`];
      }
    }
  }

  return aliases;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function findClipEntry(timeline, clipId) {
  for (const track of timeline?.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.id === clipId) return { trackId: track.id, clip };
    }
  }
  return null;
}

function applyTimelineOp(timeline, op) {
  if (!op || typeof op !== "object") {
    return { ok: false, error: { code: "BAD_OP", message: "op must be an object" } };
  }
  if (op.op === "add-clip" && typeof op.clip?.start === "number") {
    return { ok: false, error: { code: "RAW_SECONDS", message: "clip.start must be symbolic", hint: "use symbolic time" } };
  }
  switch (op.op) {
    case "add-clip":
      return addClip(timeline, op.track, op.clip);
    case "move-clip":
      return moveClip(timeline, op.clipId, op.start);
    case "resize-clip":
      return resizeClip(timeline, op.clipId, op.dur);
    case "remove-clip":
      return removeClip(timeline, op.clipId);
    case "set-param":
      return setParam(timeline, op.clipId, op.key, op.value);
    case "add-marker":
      return addMarker(timeline, op.marker || { id: op.id, t: op.t ?? op.at, label: op.label });
    default:
      return { ok: false, error: { code: "UNSUPPORTED_OP", message: `unsupported op "${op.op}"` } };
  }
}

function evaluateCheck(frame, check) {
  if (!check || typeof check !== "object") {
    return { ok: false, error: { code: "BAD_CHECK", message: "check must be an object" } };
  }
  const active = frame.active_clips || [];
  switch (check.type) {
    case "clip_visible": {
      const actual = active.some((clip) => clip.clipId === check.clipId);
      const expected = check.visible ?? true;
      return { ok: true, value: { pass: actual === expected, expected, actual } };
    }
    case "scene_active": {
      const actual = active.some((clip) => clip.sceneId === check.scene);
      const expected = check.active ?? true;
      return { ok: true, value: { pass: actual === expected, expected, actual } };
    }
    case "clip_count": {
      const actual = active.length;
      const expected = check.min ?? 0;
      return { ok: true, value: { pass: actual >= expected, expected: { min: expected }, actual } };
    }
    case "chapter": {
      const actual = frame.chapter;
      return { ok: true, value: { pass: actual === check.chapter, expected: check.chapter, actual } };
    }
    default:
      return { ok: false, error: { code: "UNSUPPORTED_CHECK", message: `unsupported check "${check.type}"` } };
  }
}
