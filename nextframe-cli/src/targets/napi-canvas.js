// L1 render target — single frame to PNG bytes via @napi-rs/canvas.

import { renderAt } from "../engine/render.js";

/**
 * Render a single frame and return PNG bytes.
 * @param {object} timeline
 * @param {number} t
 * @param {{width?: number, height?: number}} [opts]
 * @returns {{ok: true, value: Buffer} | {ok: false, error: object}}
 */
export function renderFramePNG(timeline, t, opts = {}) {
  const r = renderAt(timeline, t, opts);
  if (!r.ok) return r;
  const buf = r.canvas.toBuffer("image/png");
  return { ok: true, value: buf };
}

/**
 * Render a frame and return raw RGBA bytes (for piping into ffmpeg).
 */
export function renderFrameRGBA(timeline, t, opts = {}) {
  const r = renderAt(timeline, t, opts);
  if (!r.ok) return r;
  const data = r.canvas.data();
  return { ok: true, value: data, width: r.value.width, height: r.value.height };
}
