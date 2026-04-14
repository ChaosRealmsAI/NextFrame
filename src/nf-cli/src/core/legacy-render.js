// Legacy canvas renderer kept outside engine/ so the old path can be removed.

import { createCanvas } from "@napi-rs/canvas";
import "./legacy-fonts.js";
import { REGISTRY } from "./scene-registry.js";
import { guarded } from "./guard.js";
import { resolveTimeline } from "./legacy-timeline.js";
import { resolveKeyframes } from "../../../nf-core/engine/keyframes.js";
import { applyEnterEffect, applyExitEffect } from "../../../nf-core/animation/effects/index.js";
import { applyFilters } from "../../../nf-core/filters/index.js";

export class CanvasPool {
  #capacity;
  #buckets = new Map();
  #leases = new WeakMap();

  constructor(capacity = 2) {
    this.#capacity = capacity;
  }

  acquire(width, height) {
    const key = `${width}x${height}`;
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = { slots: [], cursor: 0 };
      this.#buckets.set(key, bucket);
    }

    let slot = null;
    let slotIndex = -1;
    const total = bucket.slots.length;
    for (let offset = 0; offset < total; offset++) {
      const index = (bucket.cursor + offset) % total;
      if (!bucket.slots[index].inUse) {
        slot = bucket.slots[index];
        slotIndex = index;
        break;
      }
    }

    if (!slot) {
      if (bucket.slots.length >= this.#capacity) {
        throw new Error(`canvas pool exhausted for ${key}`);
      }
      slot = { canvas: createCanvas(width, height), inUse: false };
      bucket.slots.push(slot);
      slotIndex = bucket.slots.length - 1;
    }

    slot.inUse = true;
    bucket.cursor = bucket.slots.length > 0 ? (slotIndex + 1) % bucket.slots.length : 0;
    const ctx = slot.canvas.getContext("2d");
    resetContext(ctx, width, height);
    ctx.save();
    this.#leases.set(slot.canvas, { bucket, slot });
    return slot.canvas;
  }

  release(canvas) {
    const lease = this.#leases.get(canvas);
    if (!lease) return;
    this.#leases.delete(canvas);
    const ctx = canvas.getContext("2d");
    ctx.restore();
    lease.slot.inUse = false;
  }
}

export function renderAt(timeline, t, opts = {}) {
  let resolved = timeline;
  if (needsResolve(timeline)) {
    const result = resolveTimeline(timeline);
    if (!result.ok) return guarded("renderAt", { ok: false, error: result.error });
    resolved = result.value;
  }
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const useCanvasPool = opts.useCanvasPool !== false;
  const mainCanvas = acquireCanvas(useCanvasPool ? opts.canvasPool || null : null, width, height);
  const canvas = mainCanvas.canvas;
  const ctx = canvas.getContext("2d");

  try {
    ctx.fillStyle = resolved.background || "#000000";
    ctx.fillRect(0, 0, width, height);

    let firstLayer = true;
    for (const track of resolved.tracks || []) {
      if (track.muted || track.kind === "audio") continue;
      for (const clip of track.clips || []) {
        const start = clip.start;
        const duration = clip.dur;
        if (typeof start !== "number" || typeof duration !== "number") continue;
        if (t < start || t > start + duration) continue;

        const entry = REGISTRY.get(clip.scene);
        if (!entry || typeof entry.render !== "function") {
          drawMissingSceneMarker(ctx, width, clip.scene);
          continue;
        }

        const localT = t - start;
        const defaultBlend = firstLayer ? "source-over" : "lighten";
        const blend = typeof clip.blend === "string" ? clip.blend : defaultBlend;
        const resolvedParams = resolveKeyframes(clip.params || {}, localT);
        const hasEffects = clip.effects && (clip.effects.enter || clip.effects.exit);
        const hasFilters = clip.filters && clip.filters.length > 0;

        if (blend === "source-over" && firstLayer && !hasEffects && !hasFilters) {
          try {
            ctx.save();
            entry.render(localT, resolvedParams, ctx, t);
          } finally {
            ctx.restore();
          }
        } else {
          let offscreen = null;
          try {
            offscreen = acquireCanvas(useCanvasPool ? opts.offscreenCanvasPool || null : null, width, height);
            const offscreenCtx = offscreen.canvas.getContext("2d");
            try {
              offscreenCtx.save();
              entry.render(localT, resolvedParams, offscreenCtx, t);
            } finally {
              offscreenCtx.restore();
            }
            if (hasFilters) applyFilters(offscreenCtx, width, height, clip.filters, localT);
          } catch (error) {
            drawCrashMarker(ctx, width, height, clip.scene, error);
            offscreen?.release();
            continue;
          }
          try {
            ctx.save();
            ctx.globalCompositeOperation = blend;
            if (clip.effects?.enter) applyEnterEffect(ctx, localT, clip.effects.enter, width, height);
            if (clip.effects?.exit) applyExitEffect(ctx, localT, duration, clip.effects.exit, width, height);
            ctx.drawImage(offscreen.canvas, 0, 0);
          } finally {
            ctx.restore();
            offscreen.release();
          }
        }

        firstLayer = false;
      }
    }

    return guarded("renderAt", {
      ok: true,
      canvas,
      value: { width, height, t },
      release: mainCanvas.release,
    });
  } catch (error) {
    mainCanvas.release();
    throw error;
  }
}

function resetContext(ctx, width, height) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, width, height);
}

function acquireCanvas(pool, width, height) {
  if (!pool) {
    return { canvas: createCanvas(width, height), release() {} };
  }
  const canvas = pool.acquire(width, height);
  return {
    canvas,
    release() {
      pool.release(canvas);
    },
  };
}

function drawMissingSceneMarker(ctx, width, sceneId) {
  ctx.save();
  ctx.fillStyle = "#ff0044";
  ctx.fillRect(0, 0, width, 32);
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`unknown scene: ${sceneId}`, 12, 22);
  ctx.restore();
}

function drawCrashMarker(ctx, width, height, sceneId, error) {
  ctx.save();
  ctx.fillStyle = "rgba(255,0,0,0.7)";
  ctx.fillRect(0, height - 40, width, 40);
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText(`scene "${sceneId}" crashed: ${error.message}`, 12, height - 14);
  ctx.restore();
}

function needsResolve(timeline) {
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      if (typeof clip.start !== "number" || typeof clip.dur !== "number") return true;
    }
  }
  for (const chapter of timeline.chapters || []) {
    if (typeof chapter.start !== "number" || (chapter.end !== undefined && typeof chapter.end !== "number")) {
      return true;
    }
  }
  for (const marker of timeline.markers || []) {
    if (typeof marker.t !== "number") return true;
  }
  return false;
}
