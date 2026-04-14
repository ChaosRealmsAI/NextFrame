// Aggregate describe() across all active scenes at a given time.
// Returns a FrameDescription per spec/architecture/04-interfaces.md.

import { REGISTRY } from "../../scenes/index.js";
import { resolveTimeline } from "./time.js";

/**
 * @param {object} timeline
 * @param {number} t - global raw seconds
 * @returns {{ok: boolean, value?: object, error?: object}}
 */
export function describeAt(timeline, t) {
  const r = resolveTimeline(timeline);
  if (!r.ok) return { ok: false, error: r.error };
  const resolved = r.value;
  const viewport = {
    width: resolved.project?.width || 1920,
    height: resolved.project?.height || 1080,
  };

  // Find current chapter
  let chapter = null;
  for (const ch of resolved.chapters || []) {
    if (typeof ch.start === "number" && typeof ch.end === "number") {
      if (t >= ch.start && t <= ch.end) {
        chapter = ch.id;
        break;
      }
    }
  }

  const active = [];
  for (const trk of resolved.tracks || []) {
    if (trk.muted) continue;
    for (const clip of trk.clips || []) {
      const s = clip.start;
      const d = clip.dur;
      if (typeof s !== "number" || typeof d !== "number") continue;
      if (t < s || t > s + d) continue;
      const entry = REGISTRY.get(clip.scene);
      if (!entry) continue;
      const localT = t - s;
      const desc = entry.describe(localT, clip.params || {}, viewport);
      active.push({
        clipId: clip.id,
        sceneId: clip.scene,
        trackId: trk.id,
        localT,
        ...desc,
      });
    }
  }

  return {
    ok: true,
    value: {
      t,
      chapter,
      active_clips: active,
    },
  };
}

export const describeFrame = describeAt;
