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
import { svgOverlay } from "./svgOverlay.js";
import { textOverlay } from "./textOverlay.js";
import { vignette } from "./vignette.js";
import { ccFrame } from "./ccFrame.js";
import { ccBigNumber } from "./ccBigNumber.js";
import { ccPill } from "./ccPill.js";
import { ccNote } from "./ccNote.js";
import { ccDesc } from "./ccDesc.js";
import { markdownSlide } from "./markdownSlide.js";
import { lottieAnim } from "./lottieAnim.js";
import { assertSceneContract, assertNoDuplicateIds } from "./_contract.js";

const p = (name, type, fallback, extra = {}) => ({ name, type, default: fallback, ...extra });

export const META_TABLE = {
  auroraGradient: { category: "Backgrounds", description: "Drifting hue gradient with deterministic film grain", duration_hint: 12, params: [p("hueA", "number", 270, { range: [0, 360], semantic: "primary hue" }), p("hueB", "number", 200, { range: [0, 360], semantic: "secondary hue" }), p("hueC", "number", 320, { range: [0, 360], semantic: "tertiary hue" }), p("intensity", "number", 1, { range: [0, 1.5], semantic: "color intensity" }), p("grain", "number", 0.04, { range: [0, 0.15], semantic: "film grain" })], ai_prompt_example: "Use as a background for the entire video with hueA=270 violet" },
  fluidBackground: { category: "Backgrounds", description: "Multi-blob fluid background, blurred and drifting", duration_hint: 12, params: [p("blobCount", "number", 5, { range: [1, 8], semantic: "blob count" }), p("hueA", "number", 210, { range: [0, 360], semantic: "primary hue" }), p("hueB", "number", 290, { range: [0, 360], semantic: "secondary hue" }), p("hueC", "number", 340, { range: [0, 360], semantic: "tertiary hue" }), p("intensity", "number", 0.6, { range: [0, 1.5], semantic: "intensity" }), p("drift", "number", 0.4, { range: [0, 1], semantic: "drift speed" }), p("blur", "number", 80, { range: [0, 160], semantic: "blur radius px" })] },
  imageHero: { category: "Media", description: "Hero image with ken-burns zoom and pan", duration_hint: 8, params: [p("src", "string", null, { semantic: "image path or url" }), p("fit", "enum", "cover", { options: ["cover", "contain"], semantic: "fit mode" }), p("zoomStart", "number", 1, { range: [0.5, 2.5], semantic: "start zoom" }), p("zoomEnd", "number", 1.15, { range: [0.5, 3], semantic: "end zoom" }), p("panX", "number", 0.05, { range: [-0.5, 0.5], semantic: "x pan" }), p("panY", "number", -0.03, { range: [-0.5, 0.5], semantic: "y pan" })] },
  kineticHeadline: { category: "Typography", description: "Big animated headline + subtitle reveal", duration_hint: 5, params: [p("text", "string", "NEXTFRAME", { required: true, semantic: "headline text" }), p("subtitle", "string", "Frame-pure scene library", { semantic: "subtitle" }), p("hueStart", "number", 30, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 320, { range: [0, 360], semantic: "end hue" }), p("stagger", "number", 0.18, { range: [0.05, 0.5], semantic: "letter stagger" }), p("size", "number", 0.12, { range: [0.05, 0.25], semantic: "font size ratio" })], ai_prompt_example: "Show product name in the body chapter" },
  glitchText: { category: "Typography", description: "Glitchy chromatic-aberration text effect", duration_hint: 4, params: [p("text", "string", "GLITCH", { required: true, semantic: "text" }), p("fontSize", "number", 140, { range: [24, 320], semantic: "font px" }), p("weight", "string", "900", { semantic: "font weight" }), p("baseHue", "number", 320, { range: [0, 360], semantic: "base hue" }), p("glitchAmount", "number", 0.4, { range: [0, 1.5], semantic: "glitch strength" }), p("scanlines", "boolean", true, { semantic: "scanline overlay" }), p("burstFreq", "number", 2.5, { range: [0.1, 12], semantic: "burst frequency" })] },
  neonGrid: { category: "Shapes", description: "Synthwave neon grid horizon", duration_hint: 12, params: [p("hueHorizon", "number", 320, { range: [0, 360], semantic: "horizon hue" }), p("hueGrid", "number", 280, { range: [0, 360], semantic: "grid hue" }), p("scrollSpeed", "number", 0.4, { range: [0, 2], semantic: "scroll speed" }), p("lineCount", "number", 16, { range: [8, 32], semantic: "horizontal lines" }), p("colCount", "number", 22, { range: [8, 48], semantic: "vertical lines" })] },
  meshGrid: { category: "Shapes", description: "Wavy mesh grid in perspective", duration_hint: 12, params: [p("cols", "number", 20, { range: [6, 40], semantic: "columns" }), p("rows", "number", 14, { range: [4, 28], semantic: "rows" }), p("hueA", "number", 200, { range: [0, 360], semantic: "hue A" }), p("hueB", "number", 320, { range: [0, 360], semantic: "hue B" }), p("waveSpeed", "number", 0.7, { range: [0, 3], semantic: "wave speed" }), p("waveAmp", "number", 0.18, { range: [0, 0.4], semantic: "wave amplitude" }), p("perspective", "number", 0.45, { range: [0, 1], semantic: "perspective" }), p("lineWidth", "number", 1.4, { range: [0.5, 4], semantic: "line width px" })] },
  starfield: { category: "Backgrounds", description: "Drifting starfield with glow", duration_hint: 15, params: [p("hueBase", "number", 215, { range: [0, 360], semantic: "base hue" }), p("hueShift", "number", 110, { range: [0, 180], semantic: "hue shift" }), p("drift", "number", 0.06, { range: [0, 0.2], semantic: "drift speed" }), p("density", "number", 1, { range: [0.4, 2], semantic: "star density" }), p("glow", "number", 1, { range: [0.4, 2], semantic: "glow strength" })] },
  spotlightSweep: { category: "Backgrounds", description: "Sweeping spotlight beams", duration_hint: 10, params: [p("beamCount", "number", 3, { range: [1, 8], semantic: "beam count" }), p("hueA", "number", 210, { range: [0, 360], semantic: "hue A" }), p("hueB", "number", 320, { range: [0, 360], semantic: "hue B" }), p("sweepSpeed", "number", 0.5, { range: [0, 3], semantic: "sweep speed" }), p("beamWidth", "number", 0.4, { range: [0.05, 1.2], semantic: "beam width" }), p("intensity", "number", 0.85, { range: [0, 1.5], semantic: "intensity" }), p("ambient", "number", 0.05, { range: [0, 0.3], semantic: "ambient light" })] },
  pixelRain: { category: "Backgrounds", description: "Matrix-style cascading characters", duration_hint: 10, params: [p("columns", "number", 48, { range: [4, 160], semantic: "column count" }), p("hueStart", "number", 140, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 200, { range: [0, 360], semantic: "end hue" }), p("speed", "number", 180, { range: [20, 960], semantic: "fall speed" }), p("density", "number", 1.2, { range: [0, 4], semantic: "density" }), p("charSize", "number", 18, { range: [8, 72], semantic: "char px" }), p("glyphPalette", "string", "01ABCDEF", { semantic: "glyph set" })] },
  particleFlow: { category: "Backgrounds", description: "Curl-noise particle field", duration_hint: 10, params: [p("count", "number", 400, { range: [40, 1200], semantic: "particle count" }), p("hueA", "number", 180, { range: [0, 360], semantic: "hue A" }), p("hueB", "number", 320, { range: [0, 360], semantic: "hue B" }), p("fieldScale", "number", 0.004, { range: [0.0005, 0.03], semantic: "field scale" }), p("speed", "number", 80, { range: [5, 240], semantic: "speed" }), p("trailLength", "number", 24, { range: [4, 64], semantic: "trail length" }), p("lineWidth", "number", 1.2, { range: [0.2, 4], semantic: "line width" })] },
  circleRipple: { category: "Shapes", description: "Expanding concentric ring ripple", duration_hint: 6, params: [p("hueStart", "number", 185, { range: [0, 360], semantic: "start hue" }), p("hueSpan", "number", 180, { range: [30, 300], semantic: "hue span" }), p("ringCount", "number", 9, { range: [4, 16], semantic: "ring count" }), p("interval", "number", 0.26, { range: [0.08, 1], semantic: "spawn interval s" }), p("lifespan", "number", 2.1, { range: [0.5, 6], semantic: "ring lifespan s" }), p("thickness", "number", 0.012, { range: [0.004, 0.03], semantic: "ring thickness" })] },
  orbitRings: { category: "Backgrounds", description: "Orbiting dot rings", duration_hint: 12, params: [p("ringCount", "number", 6, { range: [1, 10], semantic: "ring count" }), p("hueA", "number", 180, { range: [0, 360], semantic: "hue A" }), p("hueB", "number", 320, { range: [0, 360], semantic: "hue B" }), p("baseSpeed", "number", 0.4, { range: [0.05, 2], semantic: "base speed" }), p("dotSize", "number", 10, { range: [2, 48], semantic: "dot px" }), p("ringWidth", "number", 1.5, { range: [0.5, 6], semantic: "ring width px" }), p("glow", "boolean", true, { semantic: "enable glow" })] },
  countdown: { category: "Typography", description: "Big numerals counting down", duration_hint: 6, params: [p("sequence", "string", "5,4,3,2,1,GO", { semantic: "csv sequence" }), p("subtitle", "string", "SYSTEMS ARMED", { semantic: "subtitle" }), p("hueStart", "number", 18, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 145, { range: [0, 360], semantic: "end hue" }), p("accentHue", "number", 320, { range: [0, 360], semantic: "accent hue" })] },
  shapeBurst: { category: "Shapes", description: "Confetti burst of mixed shapes", duration_hint: 5, params: [p("count", "number", 80, { range: [8, 240], semantic: "shape count" }), p("shape", "enum", "mixed", { options: ["circle", "triangle", "square", "mixed"], semantic: "shape kind" }), p("hueStart", "number", 200, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 320, { range: [0, 360], semantic: "end hue" }), p("sizeMin", "number", 12, { range: [2, 96], semantic: "min px" }), p("sizeMax", "number", 48, { range: [4, 160], semantic: "max px" }), p("speed", "number", 320, { range: [40, 960], semantic: "burst speed" }), p("gravity", "number", 120, { range: [-240, 720], semantic: "gravity" }), p("fadeOut", "boolean", true, { semantic: "fade tail" })] },
  barChartReveal: { category: "Data Viz", description: "Bar chart bars rising into place", duration_hint: 5, params: [p("title", "string", "MONTHLY GROWTH", { semantic: "chart title" }), p("unit", "string", "%", { semantic: "value unit" }), p("hueStart", "number", 200, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 320, { range: [0, 360], semantic: "end hue" }), p("stagger", "number", 0.12, { range: [0.05, 0.5], semantic: "bar stagger" }), p("barDur", "number", 0.85, { range: [0.2, 2], semantic: "bar grow dur" })] },
  lineChart: { category: "Data Viz", description: "Line chart drawing in", duration_hint: 6, params: [p("title", "string", "ACTIVE USERS", { semantic: "title" }), p("unit", "string", "%", { semantic: "unit" }), p("hueStart", "number", 182, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 310, { range: [0, 360], semantic: "end hue" }), p("drawStart", "number", 0.2, { range: [0, 2], semantic: "draw start s" }), p("drawEnd", "number", 2.6, { range: [0.4, 6], semantic: "draw end s" })] },
  dataPulse: { category: "Data Viz", description: "Audio-style pulsing bars", duration_hint: 10, params: [p("bars", "number", 64, { range: [8, 160], semantic: "bar count" }), p("hueA", "number", 180, { range: [0, 360], semantic: "hue A" }), p("hueB", "number", 320, { range: [0, 360], semantic: "hue B" }), p("peak", "number", 0.8, { range: [0, 1.5], semantic: "peak height" }), p("baseHeight", "number", 0.15, { range: [0, 0.6], semantic: "min height" }), p("smoothness", "number", 0.25, { range: [0, 1], semantic: "smoothing" }), p("glowAlpha", "number", 0.4, { range: [0, 1], semantic: "glow alpha" })] },
  lowerThirdVelvet: { category: "Overlays", description: "Lower third title bar with wipe and pulse dot", duration_hint: 6, params: [p("title", "string", "NEXTFRAME", { required: true, semantic: "title text" }), p("subtitle", "string", "Scene Registry Demo", { semantic: "subtitle" }), p("hueA", "number", 20, { range: [0, 360], semantic: "primary hue" }), p("hueB", "number", 320, { range: [0, 360], semantic: "secondary hue" }), p("holdEnd", "number", 4, { range: [0.5, 20], semantic: "hold end s" }), p("fadeOut", "number", 0.6, { range: [0.1, 4], semantic: "fade out s" })], ai_prompt_example: "Use in the outro to show product name + tagline" },
  cornerBadge: { category: "Overlays", description: "Corner ribbon badge with label and subtitle", duration_hint: 5, params: [p("label", "string", "BREAKING", { semantic: "headline label" }), p("subtitle", "string", "SCENE LIBRARY EXPANDS", { semantic: "small text" }), p("hue", "number", 346, { range: [0, 360], semantic: "main hue" }), p("accentHue", "number", 32, { range: [0, 360], semantic: "accent hue" }), p("inset", "number", 0.045, { range: [0.01, 0.12], semantic: "inset ratio" })] },
  textOverlay: { category: "Overlays", description: "Generic positioned text overlay", duration_hint: 4, params: [p("text", "string", "Your text here", { required: true, semantic: "text" }), p("fontSize", "number", 96, { range: [16, 240], semantic: "font px" }), p("color", "string", "#ffffff", { semantic: "text color hex" }), p("align", "enum", "center", { options: ["left", "center", "right"], semantic: "align" }), p("anchor", "enum", "center", { options: ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"], semantic: "anchor" }), p("weight", "string", "800", { semantic: "font weight" }), p("letterSpacing", "number", -0.02, { range: [-0.2, 0.3], semantic: "letter spacing" }), p("enterDur", "number", 0.6, { range: [0.1, 3], semantic: "enter dur s" }), p("holdDur", "number", 2.5, { range: [0, 12], semantic: "hold dur s" })] },
  vignette: { category: "Overlays", description: "Radial darken toward corners", duration_hint: 10, params: [p("intensity", "number", 0.7, { range: [0, 1], semantic: "darken strength" }), p("hue", "number", 240, { range: [0, 360], semantic: "corner tint hue" }), p("radius", "number", 0.75, { range: [0.2, 1.2], semantic: "gradient radius" })] },
  svgOverlay: { category: "Browser", description: "SVG markup rendered via Chrome", duration_hint: 8, params: [p("svg", "string", "<svg></svg>")] },
  markdownSlide: { category: "Browser", description: "Markdown rendered as styled slide", duration_hint: 8, params: [p("md", "string", "# Hello"), p("theme", "string", "anthropic-warm")] },
  lottieAnim: { category: "Browser", description: "Lottie JSON animation frame", duration_hint: 6, params: [p("src", "string", ""), p("frame", "number", 0)] },
  ccFrame: { category: "Series", description: "Anthropic-warm slide shell with brand chrome", duration_hint: 72, params: [p("tag", "string", "OPC · 王宇轩"), p("series", "string", "《深入浅出 Claude Code 源代码》"), p("subtitle", "string", "以终为始：从最终提示词倒推逻辑"), p("ep", "string", "E01"), p("duration", "number", 72.42)] },
  ccBigNumber: { category: "Series", description: "Giant serif number + label", duration_hint: 10, params: [p("number", "string", "87"), p("label", "string", "类提示词")] },
  ccPill: { category: "Series", description: "Monospace label pill with accent border", duration_hint: 10, params: [p("text", "string", "ANTHROPIC CONFIDENTIAL · LEAKED"), p("x", "number", 0.5), p("y", "number", 0.28)] },
  ccNote: { category: "Series", description: "Note badge with accent dot", duration_hint: 10, params: [p("text", "string", "以 Claude Code 第一人称讲述"), p("x", "number", 0.5), p("y", "number", 0.72), p("delay", "number", 1.5)] },
  ccDesc: { category: "Series", description: "Italic mono centered description", duration_hint: 10, params: [p("text", "string", "我数过了。"), p("x", "number", 0.5), p("y", "number", 0.64), p("delay", "number", 1.0)] },
};

export const RENDER_FNS = { auroraGradient, barChartReveal, circleRipple, cornerBadge, countdown, dataPulse, fluidBackground, glitchText, imageHero, kineticHeadline, lineChart, lowerThirdVelvet, meshGrid, neonGrid, orbitRings, particleFlow, pixelRain, shapeBurst, spotlightSweep, starfield, svgOverlay, markdownSlide, lottieAnim, textOverlay, vignette, ccFrame, ccBigNumber, ccPill, ccNote, ccDesc };

function defaultParamsOf(meta) {
  const out = {};
  for (const spec of meta.params || []) out[spec.name] = spec.default;
  return out;
}

function makeDescribe(sceneId, meta) {
  return function describe(t, params = {}, viewport = { width: 1920, height: 1080 }) {
    const dur = meta.duration_hint || 5;
    const merged = { ...defaultParamsOf(meta), ...params };
    const enter = 0.6;
    const exitStart = Math.max(enter, dur - enter);
    const phase = t < enter ? "enter" : t > exitStart ? "exit" : "hold";
    const progress = phase === "enter" ? Math.max(0, t / enter) : phase === "exit" ? Math.max(0, Math.min(1, (t - exitStart) / enter)) : (t - enter) / Math.max(0.1, dur - enter * 2);
    return { sceneId, phase, progress, visible: phase !== "exit" || progress < 1, params: merged, elements: [], boundingBox: { x: 0, y: 0, w: viewport.width, h: viewport.height } };
  };
}

function makeEntry(id) {
  const meta = META_TABLE[id];
  if (!meta) throw new Error(`META missing for scene "${id}"`);
  const entry = { id, render: RENDER_FNS[id], describe: makeDescribe(id, { id, ...meta }), META: { id, ...meta } };
  assertSceneContract(id, entry);
  return entry;
}

export const SCENE_IDS = Object.keys(RENDER_FNS);
assertNoDuplicateIds(SCENE_IDS);
export const REGISTRY = new Map(SCENE_IDS.map((id) => [id, makeEntry(id)]));
const PUBLIC_SCENE_IDS = SCENE_IDS.filter((id) => id !== "imageHero");

export function getScene(id) {
  return REGISTRY.get(id);
}

export function listScenes() {
  return PUBLIC_SCENE_IDS.map((id) => REGISTRY.get(id).META);
}
