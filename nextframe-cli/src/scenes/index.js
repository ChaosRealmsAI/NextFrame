// Scene registry — 21 frame-pure scenes from runtime/web/src/scenes/.
// Each entry: { id, render, describe, META }.
// describe() / META wrap the existing render functions to satisfy the
// scene contract from spec/architecture/02-modules.md.

import { auroraGradient } from "./auroraGradient.js";
import { barChartReveal } from "./barChartReveal.js";
import { circleRipple } from "./circleRipple.js";
import { cornerBadge } from "./cornerBadge.js";
import { countdown } from "./countdown.js";
import { dataPulse } from "./dataPulse.js";
import { fluidBackground } from "./fluidBackground.js";
import { glitchText } from "./glitchText.js";
import { imageHero } from "./imageHero.js";
import { kineticHeadline } from "./kineticHeadline.js";
import { lineChart } from "./lineChart.js";
import { lowerThirdVelvet } from "./lowerThirdVelvet.js";
import { meshGrid } from "./meshGrid.js";
import { neonGrid } from "./neonGrid.js";
import { orbitRings } from "./orbitRings.js";
import { particleFlow } from "./particleFlow.js";
import { pixelRain } from "./pixelRain.js";
import { shapeBurst } from "./shapeBurst.js";
import { spotlightSweep } from "./spotlightSweep.js";
import { starfield } from "./starfield.js";
import { textOverlay } from "./textOverlay.js";

// ─── META TABLE ──────────────────────────────────────────────────────────────
// Mined from runtime/web/src/scenes/index.js. category + duration_hint + params.

const META_TABLE = {
  auroraGradient: {
    category: "Backgrounds",
    description: "Drifting hue gradient with deterministic film grain",
    duration_hint: 12,
    params: [
      { name: "hueA", type: "number", default: 270, range: [0, 360], semantic: "primary hue" },
      { name: "hueB", type: "number", default: 200, range: [0, 360], semantic: "secondary hue" },
      { name: "hueC", type: "number", default: 320, range: [0, 360], semantic: "tertiary hue" },
      { name: "intensity", type: "number", default: 1, range: [0, 1.5], semantic: "color intensity" },
      { name: "grain", type: "number", default: 0.04, range: [0, 0.15], semantic: "film grain" },
    ],
    ai_prompt_example: "Use as a background for the entire video with hueA=270 violet",
  },
  fluidBackground: {
    category: "Backgrounds",
    description: "Multi-blob fluid background, blurred and drifting",
    duration_hint: 12,
    params: [
      { name: "blobCount", type: "number", default: 5, range: [1, 8], semantic: "blob count" },
      { name: "hueA", type: "number", default: 210, range: [0, 360], semantic: "primary hue" },
      { name: "hueB", type: "number", default: 290, range: [0, 360], semantic: "secondary hue" },
      { name: "hueC", type: "number", default: 340, range: [0, 360], semantic: "tertiary hue" },
      { name: "intensity", type: "number", default: 0.6, range: [0, 1.5], semantic: "intensity" },
      { name: "drift", type: "number", default: 0.4, range: [0, 1], semantic: "drift speed" },
      { name: "blur", type: "number", default: 80, range: [0, 160], semantic: "blur radius px" },
    ],
  },
  imageHero: {
    category: "Media",
    description: "Hero image with ken-burns zoom and pan",
    duration_hint: 8,
    params: [
      { name: "src", type: "string", default: null, semantic: "image path or url" },
      { name: "fit", type: "enum", default: "cover", options: ["cover", "contain"], semantic: "fit mode" },
      { name: "zoomStart", type: "number", default: 1, range: [0.5, 2.5], semantic: "start zoom" },
      { name: "zoomEnd", type: "number", default: 1.15, range: [0.5, 3], semantic: "end zoom" },
      { name: "panX", type: "number", default: 0.05, range: [-0.5, 0.5], semantic: "x pan" },
      { name: "panY", type: "number", default: -0.03, range: [-0.5, 0.5], semantic: "y pan" },
    ],
  },
  kineticHeadline: {
    category: "Typography",
    description: "Big animated headline + subtitle reveal",
    duration_hint: 5,
    params: [
      { name: "text", type: "string", default: "NEXTFRAME", required: true, semantic: "headline text" },
      { name: "subtitle", type: "string", default: "Frame-pure scene library", semantic: "subtitle" },
      { name: "hueStart", type: "number", default: 30, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 320, range: [0, 360], semantic: "end hue" },
      { name: "stagger", type: "number", default: 0.18, range: [0.05, 0.5], semantic: "letter stagger" },
      { name: "size", type: "number", default: 0.12, range: [0.05, 0.25], semantic: "font size ratio" },
    ],
    ai_prompt_example: "Show product name in the body chapter",
  },
  glitchText: {
    category: "Typography",
    description: "Glitchy chromatic-aberration text effect",
    duration_hint: 4,
    params: [
      { name: "text", type: "string", default: "GLITCH", required: true, semantic: "text" },
      { name: "fontSize", type: "number", default: 140, range: [24, 320], semantic: "font px" },
      { name: "weight", type: "string", default: "900", semantic: "font weight" },
      { name: "baseHue", type: "number", default: 320, range: [0, 360], semantic: "base hue" },
      { name: "glitchAmount", type: "number", default: 0.4, range: [0, 1.5], semantic: "glitch strength" },
      { name: "scanlines", type: "boolean", default: true, semantic: "scanline overlay" },
      { name: "burstFreq", type: "number", default: 2.5, range: [0.1, 12], semantic: "burst frequency" },
    ],
  },
  neonGrid: {
    category: "Shapes",
    description: "Synthwave neon grid horizon",
    duration_hint: 12,
    params: [
      { name: "hueHorizon", type: "number", default: 320, range: [0, 360], semantic: "horizon hue" },
      { name: "hueGrid", type: "number", default: 280, range: [0, 360], semantic: "grid hue" },
      { name: "scrollSpeed", type: "number", default: 0.4, range: [0, 2], semantic: "scroll speed" },
      { name: "lineCount", type: "number", default: 16, range: [8, 32], semantic: "horizontal lines" },
      { name: "colCount", type: "number", default: 22, range: [8, 48], semantic: "vertical lines" },
    ],
  },
  meshGrid: {
    category: "Shapes",
    description: "Wavy mesh grid in perspective",
    duration_hint: 12,
    params: [
      { name: "cols", type: "number", default: 20, range: [6, 40], semantic: "columns" },
      { name: "rows", type: "number", default: 14, range: [4, 28], semantic: "rows" },
      { name: "hueA", type: "number", default: 200, range: [0, 360], semantic: "hue A" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "hue B" },
      { name: "waveSpeed", type: "number", default: 0.7, range: [0, 3], semantic: "wave speed" },
      { name: "waveAmp", type: "number", default: 0.18, range: [0, 0.4], semantic: "wave amplitude" },
      { name: "perspective", type: "number", default: 0.45, range: [0, 1], semantic: "perspective" },
      { name: "lineWidth", type: "number", default: 1.4, range: [0.5, 4], semantic: "line width px" },
    ],
  },
  starfield: {
    category: "Backgrounds",
    description: "Drifting starfield with glow",
    duration_hint: 15,
    params: [
      { name: "hueBase", type: "number", default: 215, range: [0, 360], semantic: "base hue" },
      { name: "hueShift", type: "number", default: 110, range: [0, 180], semantic: "hue shift" },
      { name: "drift", type: "number", default: 0.06, range: [0, 0.2], semantic: "drift speed" },
      { name: "density", type: "number", default: 1, range: [0.4, 2], semantic: "star density" },
      { name: "glow", type: "number", default: 1, range: [0.4, 2], semantic: "glow strength" },
    ],
  },
  spotlightSweep: {
    category: "Backgrounds",
    description: "Sweeping spotlight beams",
    duration_hint: 10,
    params: [
      { name: "beamCount", type: "number", default: 3, range: [1, 8], semantic: "beam count" },
      { name: "hueA", type: "number", default: 210, range: [0, 360], semantic: "hue A" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "hue B" },
      { name: "sweepSpeed", type: "number", default: 0.5, range: [0, 3], semantic: "sweep speed" },
      { name: "beamWidth", type: "number", default: 0.4, range: [0.05, 1.2], semantic: "beam width" },
      { name: "intensity", type: "number", default: 0.85, range: [0, 1.5], semantic: "intensity" },
      { name: "ambient", type: "number", default: 0.05, range: [0, 0.3], semantic: "ambient light" },
    ],
  },
  pixelRain: {
    category: "Backgrounds",
    description: "Matrix-style cascading characters",
    duration_hint: 10,
    params: [
      { name: "columns", type: "number", default: 48, range: [4, 160], semantic: "column count" },
      { name: "hueStart", type: "number", default: 140, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 200, range: [0, 360], semantic: "end hue" },
      { name: "speed", type: "number", default: 180, range: [20, 960], semantic: "fall speed" },
      { name: "density", type: "number", default: 1.2, range: [0, 4], semantic: "density" },
      { name: "charSize", type: "number", default: 18, range: [8, 72], semantic: "char px" },
      { name: "glyphPalette", type: "string", default: "01ABCDEF", semantic: "glyph set" },
    ],
  },
  particleFlow: {
    category: "Backgrounds",
    description: "Curl-noise particle field",
    duration_hint: 10,
    params: [
      { name: "count", type: "number", default: 400, range: [40, 1200], semantic: "particle count" },
      { name: "hueA", type: "number", default: 180, range: [0, 360], semantic: "hue A" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "hue B" },
      { name: "fieldScale", type: "number", default: 0.004, range: [0.0005, 0.03], semantic: "field scale" },
      { name: "speed", type: "number", default: 80, range: [5, 240], semantic: "speed" },
      { name: "trailLength", type: "number", default: 24, range: [4, 64], semantic: "trail length" },
      { name: "lineWidth", type: "number", default: 1.2, range: [0.2, 4], semantic: "line width" },
    ],
  },
  circleRipple: {
    category: "Shapes",
    description: "Expanding concentric ring ripple",
    duration_hint: 6,
    params: [
      { name: "hueStart", type: "number", default: 185, range: [0, 360], semantic: "start hue" },
      { name: "hueSpan", type: "number", default: 180, range: [30, 300], semantic: "hue span" },
      { name: "ringCount", type: "number", default: 9, range: [4, 16], semantic: "ring count" },
      { name: "interval", type: "number", default: 0.26, range: [0.08, 1], semantic: "spawn interval s" },
      { name: "lifespan", type: "number", default: 2.1, range: [0.5, 6], semantic: "ring lifespan s" },
      { name: "thickness", type: "number", default: 0.012, range: [0.004, 0.03], semantic: "ring thickness" },
    ],
  },
  orbitRings: {
    category: "Backgrounds",
    description: "Orbiting dot rings",
    duration_hint: 12,
    params: [
      { name: "ringCount", type: "number", default: 6, range: [1, 10], semantic: "ring count" },
      { name: "hueA", type: "number", default: 180, range: [0, 360], semantic: "hue A" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "hue B" },
      { name: "baseSpeed", type: "number", default: 0.4, range: [0.05, 2], semantic: "base speed" },
      { name: "dotSize", type: "number", default: 10, range: [2, 48], semantic: "dot px" },
      { name: "ringWidth", type: "number", default: 1.5, range: [0.5, 6], semantic: "ring width px" },
      { name: "glow", type: "boolean", default: true, semantic: "enable glow" },
    ],
  },
  countdown: {
    category: "Typography",
    description: "Big numerals counting down",
    duration_hint: 6,
    params: [
      { name: "sequence", type: "string", default: "5,4,3,2,1,GO", semantic: "csv sequence" },
      { name: "subtitle", type: "string", default: "SYSTEMS ARMED", semantic: "subtitle" },
      { name: "hueStart", type: "number", default: 18, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 145, range: [0, 360], semantic: "end hue" },
      { name: "accentHue", type: "number", default: 320, range: [0, 360], semantic: "accent hue" },
    ],
  },
  shapeBurst: {
    category: "Shapes",
    description: "Confetti burst of mixed shapes",
    duration_hint: 5,
    params: [
      { name: "count", type: "number", default: 80, range: [8, 240], semantic: "shape count" },
      { name: "shape", type: "enum", default: "mixed", options: ["circle", "triangle", "square", "mixed"], semantic: "shape kind" },
      { name: "hueStart", type: "number", default: 200, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 320, range: [0, 360], semantic: "end hue" },
      { name: "sizeMin", type: "number", default: 12, range: [2, 96], semantic: "min px" },
      { name: "sizeMax", type: "number", default: 48, range: [4, 160], semantic: "max px" },
      { name: "speed", type: "number", default: 320, range: [40, 960], semantic: "burst speed" },
      { name: "gravity", type: "number", default: 120, range: [-240, 720], semantic: "gravity" },
      { name: "fadeOut", type: "boolean", default: true, semantic: "fade tail" },
    ],
  },
  barChartReveal: {
    category: "Data Viz",
    description: "Bar chart bars rising into place",
    duration_hint: 5,
    params: [
      { name: "title", type: "string", default: "MONTHLY GROWTH", semantic: "chart title" },
      { name: "unit", type: "string", default: "%", semantic: "value unit" },
      { name: "hueStart", type: "number", default: 200, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 320, range: [0, 360], semantic: "end hue" },
      { name: "stagger", type: "number", default: 0.12, range: [0.05, 0.5], semantic: "bar stagger" },
      { name: "barDur", type: "number", default: 0.85, range: [0.2, 2], semantic: "bar grow dur" },
    ],
  },
  lineChart: {
    category: "Data Viz",
    description: "Line chart drawing in",
    duration_hint: 6,
    params: [
      { name: "title", type: "string", default: "ACTIVE USERS", semantic: "title" },
      { name: "unit", type: "string", default: "%", semantic: "unit" },
      { name: "hueStart", type: "number", default: 182, range: [0, 360], semantic: "start hue" },
      { name: "hueEnd", type: "number", default: 310, range: [0, 360], semantic: "end hue" },
      { name: "drawStart", type: "number", default: 0.2, range: [0, 2], semantic: "draw start s" },
      { name: "drawEnd", type: "number", default: 2.6, range: [0.4, 6], semantic: "draw end s" },
    ],
  },
  dataPulse: {
    category: "Data Viz",
    description: "Audio-style pulsing bars",
    duration_hint: 10,
    params: [
      { name: "bars", type: "number", default: 64, range: [8, 160], semantic: "bar count" },
      { name: "hueA", type: "number", default: 180, range: [0, 360], semantic: "hue A" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "hue B" },
      { name: "peak", type: "number", default: 0.8, range: [0, 1.5], semantic: "peak height" },
      { name: "baseHeight", type: "number", default: 0.15, range: [0, 0.6], semantic: "min height" },
      { name: "smoothness", type: "number", default: 0.25, range: [0, 1], semantic: "smoothing" },
      { name: "glowAlpha", type: "number", default: 0.4, range: [0, 1], semantic: "glow alpha" },
    ],
  },
  lowerThirdVelvet: {
    category: "Overlays",
    description: "Lower third title bar with wipe and pulse dot",
    duration_hint: 6,
    params: [
      { name: "title", type: "string", default: "NEXTFRAME", required: true, semantic: "title text" },
      { name: "subtitle", type: "string", default: "Scene Registry Demo", semantic: "subtitle" },
      { name: "hueA", type: "number", default: 20, range: [0, 360], semantic: "primary hue" },
      { name: "hueB", type: "number", default: 320, range: [0, 360], semantic: "secondary hue" },
      { name: "holdEnd", type: "number", default: 4, range: [0.5, 20], semantic: "hold end s" },
      { name: "fadeOut", type: "number", default: 0.6, range: [0.1, 4], semantic: "fade out s" },
    ],
    ai_prompt_example: "Use in the outro to show product name + tagline",
  },
  cornerBadge: {
    category: "Overlays",
    description: "Corner ribbon badge with label and subtitle",
    duration_hint: 5,
    params: [
      { name: "label", type: "string", default: "BREAKING", semantic: "headline label" },
      { name: "subtitle", type: "string", default: "SCENE LIBRARY EXPANDS", semantic: "small text" },
      { name: "hue", type: "number", default: 346, range: [0, 360], semantic: "main hue" },
      { name: "accentHue", type: "number", default: 32, range: [0, 360], semantic: "accent hue" },
      { name: "inset", type: "number", default: 0.045, range: [0.01, 0.12], semantic: "inset ratio" },
    ],
  },
  textOverlay: {
    category: "Overlays",
    description: "Generic positioned text overlay",
    duration_hint: 4,
    params: [
      { name: "text", type: "string", default: "Your text here", required: true, semantic: "text" },
      { name: "fontSize", type: "number", default: 96, range: [16, 240], semantic: "font px" },
      { name: "color", type: "string", default: "#ffffff", semantic: "text color hex" },
      { name: "align", type: "enum", default: "center", options: ["left", "center", "right"], semantic: "align" },
      { name: "anchor", type: "enum", default: "center", options: ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"], semantic: "anchor" },
      { name: "weight", type: "string", default: "800", semantic: "font weight" },
      { name: "letterSpacing", type: "number", default: -0.02, range: [-0.2, 0.3], semantic: "letter spacing" },
      { name: "enterDur", type: "number", default: 0.6, range: [0.1, 3], semantic: "enter dur s" },
      { name: "holdDur", type: "number", default: 2.5, range: [0, 12], semantic: "hold dur s" },
    ],
  },
};

const RENDER_FNS = {
  auroraGradient,
  barChartReveal,
  circleRipple,
  cornerBadge,
  countdown,
  dataPulse,
  fluidBackground,
  glitchText,
  imageHero,
  kineticHeadline,
  lineChart,
  lowerThirdVelvet,
  meshGrid,
  neonGrid,
  orbitRings,
  particleFlow,
  pixelRain,
  shapeBurst,
  spotlightSweep,
  starfield,
  textOverlay,
};

/**
 * Build a default-params dict from a META entry.
 */
function defaultParamsOf(meta) {
  const out = {};
  for (const p of meta.params || []) out[p.name] = p.default;
  return out;
}

/**
 * Generic describe(): infers phase from local time vs scene duration_hint.
 * Returns a minimal but valid ClipDescription.
 */
function makeDescribe(sceneId, meta) {
  return function describe(t, params = {}, viewport = { width: 1920, height: 1080 }) {
    const dur = meta.duration_hint || 5;
    const merged = { ...defaultParamsOf(meta), ...params };
    let phase = "hold";
    let progress = 0.5;
    if (t < 0.6) {
      phase = "enter";
      progress = Math.max(0, t / 0.6);
    } else if (t > dur - 0.6) {
      phase = "exit";
      progress = Math.max(0, Math.min(1, (t - (dur - 0.6)) / 0.6));
    } else {
      phase = "hold";
      progress = (t - 0.6) / Math.max(0.1, dur - 1.2);
    }
    return {
      sceneId,
      phase,
      progress,
      visible: phase !== "exit" || progress < 1,
      params: merged,
      elements: [],
      boundingBox: { x: 0, y: 0, w: viewport.width, h: viewport.height },
    };
  };
}

/**
 * Build a single registry entry conforming to the scene contract:
 * { id, render, describe, META }.
 */
function makeEntry(id) {
  const meta = META_TABLE[id];
  if (!meta) {
    throw new Error(`META missing for scene "${id}"`);
  }
  const fullMeta = {
    id,
    category: meta.category,
    description: meta.description,
    duration_hint: meta.duration_hint,
    params: meta.params,
    ai_prompt_example: meta.ai_prompt_example,
  };
  return {
    id,
    render: RENDER_FNS[id],
    describe: makeDescribe(id, fullMeta),
    META: fullMeta,
  };
}

export const SCENE_IDS = Object.keys(RENDER_FNS);

export const REGISTRY = new Map(SCENE_IDS.map((id) => [id, makeEntry(id)]));

/**
 * Get a scene entry. Returns undefined if not found.
 */
export function getScene(id) {
  return REGISTRY.get(id);
}

/**
 * List all scene metadata as a plain array.
 */
export function listScenes() {
  return SCENE_IDS.map((id) => REGISTRY.get(id).META);
}
