// Effect registry — enter/exit animations applied after scene renders.
// Each effect: apply(ctx, canvas, progress, params) → ctx transform

import { fadeIn } from "./fadeIn.js";
import { fadeOut } from "./fadeOut.js";
import { slideUp } from "./slideUp.js";
import { slideDown } from "./slideDown.js";
import { scaleIn } from "./scaleIn.js";
import { scaleOut } from "./scaleOut.js";

export const EFFECT_TABLE = {
  fadeIn:    { id: "fadeIn",    description: "Opacity 0→1",          params: [{ name: "dur", type: "number", default: 0.5 }] },
  fadeOut:   { id: "fadeOut",   description: "Opacity 1→0",          params: [{ name: "dur", type: "number", default: 0.5 }] },
  slideUp:   { id: "slideUp",   description: "Slide up + fade in",   params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  slideDown: { id: "slideDown", description: "Slide down + fade out", params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  scaleIn:   { id: "scaleIn",   description: "Scale 0→1 + fade in",  params: [{ name: "dur", type: "number", default: 0.5 }] },
  scaleOut:  { id: "scaleOut",  description: "Scale 1→0 + fade out", params: [{ name: "dur", type: "number", default: 0.5 }] },
};

export const EFFECT_FNS = { fadeIn, fadeOut, slideUp, slideDown, scaleIn, scaleOut };
export const EFFECT_IDS = Object.keys(EFFECT_FNS);

export function getEffect(id) {
  if (!EFFECT_FNS[id]) return null;
  return { id, apply: EFFECT_FNS[id], META: EFFECT_TABLE[id] };
}

export function listEffects() {
  return EFFECT_IDS.map((id) => EFFECT_TABLE[id]);
}

/**
 * Apply enter effect to a canvas context.
 * @param {object} ctx — 2d context of offscreen canvas
 * @param {number} localT — time since clip start
 * @param {{ type: string, dur?: number }} effect
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function applyEnterEffect(ctx, localT, effect, canvasWidth, canvasHeight) {
  if (!effect || !effect.type) return;
  const fn = EFFECT_FNS[effect.type];
  if (!fn) return;
  const dur = effect.dur || 0.5;
  if (localT >= dur) return; // effect done
  const progress = Math.min(1, localT / dur);
  fn(ctx, progress, canvasWidth, canvasHeight, effect);
}

/**
 * Apply exit effect to a canvas context.
 * @param {object} ctx — 2d context of offscreen canvas
 * @param {number} localT — time since clip start
 * @param {number} clipDur — total clip duration
 * @param {{ type: string, dur?: number }} effect
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function applyExitEffect(ctx, localT, clipDur, effect, canvasWidth, canvasHeight) {
  if (!effect || !effect.type) return;
  const fn = EFFECT_FNS[effect.type];
  if (!fn) return;
  const dur = effect.dur || 0.5;
  const exitStart = clipDur - dur;
  if (localT < exitStart) return; // not yet
  const progress = Math.min(1, (localT - exitStart) / dur);
  fn(ctx, progress, canvasWidth, canvasHeight, effect);
}
