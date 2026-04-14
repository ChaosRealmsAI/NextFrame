// Legacy timeline describe() aggregation kept outside engine/.

import { REGISTRY } from "./scene-registry.js";
import { resolveTimeline } from "./legacy-timeline.js";

export function describeAt(timeline, t) {
  const resolvedTimeline = resolveTimeline(timeline);
  if (!resolvedTimeline.ok) return { ok: false, error: resolvedTimeline.error };
  const resolved = resolvedTimeline.value;
  const viewport = {
    width: resolved.project?.width || 1920,
    height: resolved.project?.height || 1080,
  };

  let chapter = null;
  for (const candidate of resolved.chapters || []) {
    if (typeof candidate.start === "number" && typeof candidate.end === "number" && t >= candidate.start && t <= candidate.end) {
      chapter = candidate.id;
      break;
    }
  }

  const active = [];
  for (const track of resolved.tracks || []) {
    if (track.muted) continue;
    for (const clip of track.clips || []) {
      const start = clip.start;
      const duration = clip.dur;
      if (typeof start !== "number" || typeof duration !== "number") continue;
      if (t < start || t > start + duration) continue;
      const entry = REGISTRY.get(clip.scene);
      if (!entry || typeof entry.describe !== "function") continue;
      const localT = t - start;
      const desc = entry.describe(localT, clip.params || {}, viewport);
      active.push({
        clipId: clip.id,
        sceneId: clip.scene,
        trackId: track.id,
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
