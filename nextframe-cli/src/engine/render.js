// Frame renderer — given a (resolved) timeline and time t, draws into a
// napi-canvas Canvas. Walks tracks bottom-up (tracks[0] is back).
// Frame-pure: no caches, no random, no Date.

import { createCanvas } from "@napi-rs/canvas";
import "./fonts.js"; // side-effect: register CJK fonts
import { REGISTRY } from "../scenes/index.js";
import { resolveTimeline } from "./time.js";

/**
 * Render the timeline at time t into a fresh canvas.
 * @param {object} timeline - Timeline (raw or symbolic — will be resolved)
 * @param {number} t - global time, raw seconds
 * @param {{width?: number, height?: number}} [opts]
 * @returns {{ok: true, canvas: object, value: object} | {ok: false, error: object}}
 */
export function renderAt(timeline, t, opts = {}) {
  let resolved = timeline;
  if (needsResolve(timeline)) {
    const r = resolveTimeline(timeline);
    if (!r.ok) return { ok: false, error: r.error };
    resolved = r.value;
  }
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = resolved.background || "#000000";
  ctx.fillRect(0, 0, width, height);

  // Walk tracks bottom-up
  for (const trk of resolved.tracks || []) {
    if (trk.muted) continue;
    if (trk.kind === "audio") continue; // v0.1: ignore audio tracks for video render
    for (const clip of trk.clips || []) {
      const start = clip.start;
      const dur = clip.dur;
      if (typeof start !== "number" || typeof dur !== "number") continue;
      if (t < start || t > start + dur) continue;
      const entry = REGISTRY.get(clip.scene);
      if (!entry) {
        // Draw a red placeholder rect
        ctx.fillStyle = "#ff0044";
        ctx.fillRect(0, 0, width, 32);
        ctx.fillStyle = "#fff";
        ctx.font = "20px sans-serif";
        ctx.fillText(`unknown scene: ${clip.scene}`, 12, 22);
        continue;
      }
      const localT = t - start;
      try {
        ctx.save();
        entry.render(localT, clip.params || {}, ctx, t);
        ctx.restore();
      } catch (err) {
        ctx.restore();
        // Frame-pure rule: a single scene crash must not poison the whole frame
        ctx.fillStyle = "rgba(255,0,0,0.7)";
        ctx.fillRect(0, height - 40, width, 40);
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.fillText(`scene "${clip.scene}" crashed: ${err.message}`, 12, height - 14);
      }
    }
  }

  return { ok: true, canvas, value: { width, height, t } };
}

function needsResolve(timeline) {
  for (const trk of timeline.tracks || []) {
    for (const clip of trk.clips || []) {
      if (typeof clip.start !== "number" || typeof clip.dur !== "number") return true;
    }
  }
  for (const ch of timeline.chapters || []) {
    if (typeof ch.start !== "number" || (ch.end !== undefined && typeof ch.end !== "number")) {
      return true;
    }
  }
  for (const m of timeline.markers || []) {
    if (typeof m.t !== "number") return true;
  }
  return false;
}
