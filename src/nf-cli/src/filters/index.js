// Filter registry — post-processing on rendered frames.
// Exported filter fns remain the pixel-loop fallback path.

import { warmTone } from "./warmTone.js";
import { getWarmToneCssFilter } from "./warmTone.js";
import { coolTone } from "./coolTone.js";
import { getCoolToneCssFilter } from "./coolTone.js";
import { grayscale } from "./grayscale.js";
import { getGrayscaleCssFilter } from "./grayscale.js";
import { sepia } from "./sepia.js";
import { getSepiaCssFilter } from "./sepia.js";
import { filmGrain } from "./filmGrain.js";
import { applyFilmGrainOverlay } from "./filmGrain.js";

export const FILTER_TABLE = {
  warmTone:  { id: "warmTone",  description: "Warm color grading",  params: [{ name: "intensity", type: "number", default: 0.5, range: [0, 1] }] },
  coolTone:  { id: "coolTone",  description: "Cool/blue shift",     params: [{ name: "intensity", type: "number", default: 0.5, range: [0, 1] }] },
  grayscale: { id: "grayscale", description: "Desaturate to B&W",   params: [{ name: "amount", type: "number", default: 1, range: [0, 1] }] },
  sepia:     { id: "sepia",     description: "Vintage brown tone",  params: [{ name: "intensity", type: "number", default: 0.8, range: [0, 1] }] },
  filmGrain: { id: "filmGrain", description: "Noise grain overlay", params: [{ name: "intensity", type: "number", default: 0.04, range: [0, 1] }] },
};

export const FILTER_FNS = { warmTone, coolTone, grayscale, sepia, filmGrain };
export const FILTER_IDS = Object.keys(FILTER_FNS);
const CSS_FILTER_FNS = {
  warmTone: getWarmToneCssFilter,
  coolTone: getCoolToneCssFilter,
  grayscale: getGrayscaleCssFilter,
  sepia: getSepiaCssFilter,
};

export function getFilter(id) {
  if (!FILTER_FNS[id]) return null;
  return { id, apply: FILTER_FNS[id], META: FILTER_TABLE[id] };
}

export function listFilters() {
  return FILTER_IDS.map((id) => FILTER_TABLE[id]);
}

/**
 * Apply a list of filters to a canvas.
 * @param {object} ctx — 2d context
 * @param {number} width
 * @param {number} height
 * @param {Array<string|{type:string}>} filters
 * @param {number} [t=0] — local clip time for time-varying filters
 * @param {{createCanvas?: Function}} [runtime]
 */
export function applyFilters(ctx, width, height, filters, t = 0, runtime = {}) {
  if (!filters || !filters.length) return;
  const specs = filters.map((f) => typeof f === "string" ? { type: f, _t: t } : { ...f, _t: t });
  const canUseCssFilters = typeof ctx.filter === "string" && typeof runtime.createCanvas === "function";

  if (canUseCssFilters) {
    applyCssFilters(ctx, width, height, specs, runtime.createCanvas);
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  for (const spec of specs) {
    const fn = FILTER_FNS[spec.type];
    if (fn) fn(imageData.data, width, height, spec);
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyCssFilters(ctx, width, height, specs, createCanvas) {
  const filterChain = [];
  for (const spec of specs) {
    const buildCss = CSS_FILTER_FNS[spec.type];
    if (buildCss) filterChain.push(buildCss(spec));
  }

  if (filterChain.length > 0) {
    const source = createCanvas(width, height);
    const sourceCtx = source.getContext("2d");
    sourceCtx.drawImage(ctx.canvas, 0, 0, width, height);
    const previousFilter = ctx.filter;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.filter = filterChain.join(" ");
    ctx.drawImage(source, 0, 0, width, height);
    ctx.restore();
    ctx.filter = previousFilter;
  }

  for (const spec of specs) {
    if (spec.type === "filmGrain") applyFilmGrainOverlay(ctx, width, height, spec, createCanvas);
  }
}
