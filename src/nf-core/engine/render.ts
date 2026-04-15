// Frame renderer — given a (resolved) timeline and time t, draws into a
// napi-canvas Canvas. Walks tracks bottom-up (tracks[0] is back).
//
// Multi-track compositing:
//   - First active clip drawn directly to main canvas (source-over, sets bg).
//   - Every subsequent active clip is drawn to its own offscreen canvas,
//     then composited onto the main canvas with clip.blend (default "lighten"
//     for tracks > 0, "source-over" for track 0). This lets overlay scenes
//     (text, shapes) show through the background scene below — every scene
//     in the v0.1 library currently paints a full opaque background, so
//     without this step the topmost track always wins.
//
// Per-clip override: set { "blend": "source-over" | "lighten" | "screen" |
// "add" | "multiply" | "overlay" | "darken" | "difference" } on the clip.
// Frame-pure: no caches, no random, no Date.

import { createCanvas } from "@napi-rs/canvas";
import { REGISTRY } from "../scenes/index.js";
import { guarded } from "./_guard.js";
import { resolveTimeline } from "./time.js";
import { resolveKeyframes } from "./keyframes.js";
import { applyEnterEffect, applyExitEffect } from "../animation/effects/index.js";
import { applyFilters } from "../filters/index.js";
import type { Timeline, LegacyTrack as Track, LegacyClip as Clip, Chapter, Marker } from "../types.js";

type NapiCanvas = ReturnType<typeof createCanvas>;

export class CanvasPool {
  #capacity;
  #buckets = new Map();
  #leases = new WeakMap();

  constructor(capacity = 2) {
    this.#capacity = capacity;
  }

  acquire(width: number, height: number) {
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
      const idx = (bucket.cursor + offset) % total;
      if (!bucket.slots[idx].inUse) {
        slot = bucket.slots[idx];
        slotIndex = idx;
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

  release(canvas: NapiCanvas) {
    const lease = this.#leases.get(canvas);
    if (!lease) return;
    this.#leases.delete(canvas);
    const ctx = canvas.getContext("2d");
    ctx.restore();
    lease.slot.inUse = false;
  }
}

function resetContext(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, width, height);
}

function acquireCanvas(pool: CanvasPool | null, width: number, height: number) {
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

/**
 * Render the timeline at time t into a fresh canvas.
 * @param {Timeline} timeline - Timeline (raw or symbolic — will be resolved)
 * @param {number} t - global time, raw seconds
 * @param {{width?: number, height?: number, useCanvasPool?: boolean, canvasPool?: CanvasPool | null, offscreenCanvasPool?: CanvasPool | null}} [opts]
 * @returns {{ok: true, canvas: object, value: object, release: () => void} | {ok: false, error: object}}
 */
interface RenderAtOpts {
  width?: number;
  height?: number;
  useCanvasPool?: boolean;
  canvasPool?: CanvasPool | null;
  offscreenCanvasPool?: CanvasPool | null;
}

export function renderAt(timeline: Timeline, t: number, opts: RenderAtOpts = {}) {
  let resolved: Timeline = timeline;
  if (needsResolve(timeline)) {
    const r = resolveTimeline(timeline);
    if (!r.ok) return guarded("renderAt", { ok: false as const, error: r.error });
    resolved = r.value as Timeline;
  }
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const useCanvasPool = opts.useCanvasPool !== false;
  const mainCanvas = acquireCanvas(useCanvasPool ? opts.canvasPool || null : null, width, height);
  const canvas = mainCanvas.canvas;
  const ctx = canvas.getContext("2d");

  try {
    // Main-canvas background (lowest layer).
    ctx.fillStyle = resolved.background || "#000000";
    ctx.fillRect(0, 0, width, height);

    let firstLayer = true;

    // Walk tracks bottom-up
    const tracks = resolved.tracks || [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const trk = tracks[ti];
      if (trk.muted) continue;
      if (trk.kind === "audio") continue; // v0.1: ignore audio tracks for video render
      for (const clip of trk.clips || []) {
        const start = clip.start;
        const dur = clip.dur;
        if (typeof start !== "number" || typeof dur !== "number") continue;
        if (t < start || t > start + dur) continue;
        const entry = REGISTRY.get(clip.scene);
        if (!entry) {
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
          // Direct draw into main canvas — scene fully owns background.
          try {
            ctx.save();
            if (entry.render) entry.render(localT, resolvedParams, ctx, t);
          } finally {
            ctx.restore();
          }
        } else {
          // Offscreen canvas — scene draws its full frame, we composite it.
          let offscreen = null;
          try {
            offscreen = acquireCanvas(useCanvasPool ? opts.offscreenCanvasPool || null : null, width, height);
            const offCtx = offscreen.canvas.getContext("2d");
            try {
              offCtx?.save();
              if (entry.render && offCtx) entry.render(localT, resolvedParams, offCtx, t);
            } finally {
              offCtx?.restore();
            }
            // Apply filters (post-processing on pixels)
            if (hasFilters && offCtx) applyFilters(offCtx, width, height, clip.filters ?? [], localT);
          } catch (err) {
            drawCrashMarker(ctx, width, height, clip.scene, err);
            offscreen?.release();
            continue;
          }
          try {
            ctx.save();
            ctx.globalCompositeOperation = blend;
            // Apply enter/exit effects (ctx transforms before drawing)
            if (clip.effects?.enter) applyEnterEffect(ctx, localT, clip.effects.enter, width, height);
            if (clip.effects?.exit) applyExitEffect(ctx, localT, dur, clip.effects.exit, width, height);
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
  } catch (err) {
    mainCanvas.release();
    throw err;
  }
}

function drawMissingSceneMarker(ctx: CanvasRenderingContext2D, width: number, sceneId: string) {
  ctx.save();
  ctx.fillStyle = "#ff0044";
  ctx.fillRect(0, 0, width, 32);
  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText(`unknown scene: ${sceneId}`, 12, 22);
  ctx.restore();
}

function drawCrashMarker(ctx: CanvasRenderingContext2D, width: number, height: number, sceneId: string, err: unknown) {
  ctx.save();
  ctx.fillStyle = "rgba(255,0,0,0.7)";
  ctx.fillRect(0, height - 40, width, 40);
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText(`scene "${sceneId}" crashed: ${(err as Error).message}`, 12, height - 14);
  ctx.restore();
}

function needsResolve(timeline: Timeline) {
  for (const trk of timeline.tracks ?? []) {
    for (const clip of trk.clips ?? []) {
      if (typeof clip.start !== "number" || typeof clip.dur !== "number") return true;
    }
  }
  for (const ch of timeline.chapters ?? []) {
    if (typeof ch.start !== "number" || (ch.end !== undefined && typeof ch.end !== "number")) {
      return true;
    }
  }
  for (const m of timeline.markers ?? []) {
    if (typeof m.t !== "number") return true;
  }
  return false;
}
