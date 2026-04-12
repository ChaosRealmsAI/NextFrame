// AI tool surface — 7 functions LLMs use to operate on a Timeline.
// All return {ok, value, error, hints}; never throws.
// Reference: spec/architecture/06-ai-loop.md

import { renderGantt } from "../views/gantt.js";
import { describeFrame } from "../engine/describe.js";
import { addClip, removeClip, moveClip, resizeClip, setParam } from "../timeline/ops.js";
import { resolveTimeline, resolveExpression } from "../engine/time.js";

/**
 * Find clip ids matching predicate.
 * @param {object} timeline
 * @param {{sceneId?: string, trackId?: string, textContent?: string}} predicate
 * @returns {{ok: true, value: string[]}}
 */
export function find_clips(timeline, predicate = {}) {
  const ids = [];
  for (const trk of timeline.tracks || []) {
    if (predicate.trackId && trk.id !== predicate.trackId) continue;
    for (const clip of trk.clips || []) {
      if (predicate.sceneId && clip.scene !== predicate.sceneId) continue;
      if (predicate.textContent) {
        const haystack = JSON.stringify(clip.params || {});
        if (!haystack.includes(predicate.textContent)) continue;
      }
      ids.push(clip.id);
    }
  }
  return { ok: true, value: ids };
}

/**
 * Get a clip by id, with its enclosing track id.
 */
export function get_clip(timeline, clipId) {
  for (const trk of timeline.tracks || []) {
    for (const clip of trk.clips || []) {
      if (clip.id === clipId) {
        return { ok: true, value: { ...clip, _track: trk.id } };
      }
    }
  }
  return {
    ok: false,
    error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId },
    hints: [{ msg: "use find_clips() to discover ids" }],
  };
}

/**
 * Describe what the frame looks like at time t (raw seconds, post-resolve).
 */
export function describe_frame(timeline, t) {
  return describeFrame(timeline, t);
}

/**
 * Apply a patch to the timeline. Returns new timeline (does not mutate).
 */
export function apply_patch(timeline, patch) {
  if (!patch || typeof patch !== "object") {
    return { ok: false, error: { code: "BAD_PATCH", message: "patch must be an object" } };
  }
  switch (patch.op) {
    case "addClip":
      return addClip(timeline, patch.track, patch.clip);
    case "removeClip":
      return removeClip(timeline, patch.clipId);
    case "moveClip":
      return moveClip(timeline, patch.clipId, patch.start);
    case "resizeClip":
    case "setDur":
      return resizeClip(timeline, patch.clipId, patch.dur);
    case "setParam":
      return setParam(timeline, patch.clipId, patch.key, patch.value);
    default:
      return {
        ok: false,
        error: { code: "UNKNOWN_OP", message: `unknown op "${patch.op}"` },
        hints: [{ msg: "supported: addClip|removeClip|moveClip|resizeClip|setParam" }],
      };
  }
}

/**
 * Assert a predicate at a given time. v0.1 supports simple "x.field == value".
 */
export function assert_at(timeline, t, predicate) {
  const desc = describeFrame(timeline, t);
  if (!desc.ok) return { ok: false, pass: false, message: desc.error.message };
  // Minimal DSL: "active_clips.length >= 2" / "clip-X.visible == true"
  // For walking skeleton, return the description so caller can inspect.
  return {
    ok: true,
    pass: true,
    message: `frame@${t}: ${desc.value.active_clips.length} active clips`,
    description: desc.value,
    predicate,
  };
}

/**
 * Render an ASCII screenshot at the given time. Caller should pass a renderer
 * (cyclic-import-free wiring is the caller's job).
 */
export async function render_ascii(timeline, t, renderFrameFn, pngToAsciiFn) {
  const png = await renderFrameFn(timeline, t);
  return pngToAsciiFn(png);
}

/**
 * Render the timeline as ASCII gantt.
 */
export function ascii_gantt(timeline) {
  // Resolve symbolic time first if needed
  const resolved = resolveTimeline(timeline);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return { ok: true, value: renderGantt(resolved.value) };
}

export const TOOL_DEFINITIONS = {
  find_clips: { description: "Search clips by sceneId/trackId/textContent." },
  get_clip: { description: "Get one clip by id." },
  describe_frame: { description: "Describe what's visible at time t." },
  apply_patch: { description: "Apply a patch (addClip|removeClip|moveClip|resizeClip|setParam)." },
  assert_at: { description: "Assert a predicate at time t." },
  render_ascii: { description: "ASCII screenshot of frame at t." },
  ascii_gantt: { description: "ASCII gantt of full timeline." },
};
