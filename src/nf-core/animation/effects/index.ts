// Effect registry — pure CSS-object animations for DOM/SVG scenes.
// Each effect: apply(progress, opts) → CSS style object

import { fadeIn } from "./fadeIn.js";
import { fadeOut } from "./fadeOut.js";
import { slideUp } from "./slideUp.js";
import { slideDown } from "./slideDown.js";
import { slideLeft } from "./slideLeft.js";
import { slideRight } from "./slideRight.js";
import { scaleIn } from "./scaleIn.js";
import { scaleOut } from "./scaleOut.js";
import { springIn } from "./springIn.js";
import { springOut } from "./springOut.js";
import { blurIn } from "./blurIn.js";
import { blurOut } from "./blurOut.js";
import { wipeReveal } from "./wipeReveal.js";
import { bounceIn } from "./bounceIn.js";
import { applyCanvasStyle } from "../canvasCompat.js";

export const EFFECT_TABLE = {
  fadeIn:     { id: "fadeIn",     description: "Opacity 0→1",                   params: [{ name: "dur", type: "number", default: 0.5 }] },
  fadeOut:    { id: "fadeOut",    description: "Opacity 1→0",                    params: [{ name: "dur", type: "number", default: 0.5 }] },
  slideUp:   { id: "slideUp",   description: "Slide up + fade in",              params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  slideDown: { id: "slideDown", description: "Slide down + fade out",            params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  slideLeft: { id: "slideLeft", description: "Slide in from left + fade",        params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  slideRight:{ id: "slideRight",description: "Slide in from right + fade",       params: [{ name: "dur", type: "number", default: 0.6 }, { name: "distance", type: "number", default: 40 }] },
  scaleIn:   { id: "scaleIn",  description: "Scale 0→1 + fade in",              params: [{ name: "dur", type: "number", default: 0.5 }] },
  scaleOut:  { id: "scaleOut", description: "Scale 1→0 + fade out",              params: [{ name: "dur", type: "number", default: 0.5 }] },
  springIn:  { id: "springIn", description: "Spring scale-in with overshoot",    params: [{ name: "dur", type: "number", default: 0.6 }] },
  springOut: { id: "springOut",description: "Spring scale-out with overshoot",   params: [{ name: "dur", type: "number", default: 0.6 }] },
  blurIn:    { id: "blurIn",   description: "Blur-to-clear entrance + fade",     params: [{ name: "dur", type: "number", default: 0.5 }] },
  blurOut:   { id: "blurOut",  description: "Clear-to-blur exit + fade",          params: [{ name: "dur", type: "number", default: 0.5 }] },
  wipeReveal:{ id: "wipeReveal",description: "Left-to-right clip reveal",        params: [{ name: "dur", type: "number", default: 0.6 }] },
  bounceIn:  { id: "bounceIn", description: "Bounce scale-in + fade",            params: [{ name: "dur", type: "number", default: 0.6 }] },
};

export const EFFECT_FNS = { fadeIn, fadeOut, slideUp, slideDown, slideLeft, slideRight, scaleIn, scaleOut, springIn, springOut, blurIn, blurOut, wipeReveal, bounceIn };
export const EFFECT_IDS = Object.keys(EFFECT_FNS);
export const EFFECT_NAMES = [...EFFECT_IDS];

export function getEffect(id: any) {
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
export function applyEnterEffect(ctx: any, localT: any, effect: any, canvasWidth: any, canvasHeight: any) {
  if (!effect || !effect.type) return;
  const fn = EFFECT_FNS[effect.type];
  if (!fn) return;
  const dur = effect.dur || 0.5;
  if (localT >= dur) return; // effect done
  const progress = Math.min(1, localT / dur);
  const style = fn(progress, effect);
  applyCanvasStyle(ctx, canvasWidth, canvasHeight, style);
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
export function applyExitEffect(ctx: any, localT: any, clipDur: any, effect: any, canvasWidth: any, canvasHeight: any) {
  if (!effect || !effect.type) return;
  const fn = EFFECT_FNS[effect.type];
  if (!fn) return;
  const dur = effect.dur || 0.5;
  const exitStart = clipDur - dur;
  if (localT < exitStart) return; // not yet
  const progress = Math.min(1, (localT - exitStart) / dur);
  const style = fn(progress, effect);
  applyCanvasStyle(ctx, canvasWidth, canvasHeight, style);
}
