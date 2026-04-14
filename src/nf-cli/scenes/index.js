// Legacy scene registry implementation moved out of src/ to keep the main CLI module cohesive.
import { auroraGradient } from "./auroraGradient.js";
import { barChartReveal } from "./barChartReveal.js";
import { circleRipple } from "./circleRipple.js";
import { cornerBadge } from "./cornerBadge.js";
import { countdown } from "./countdown.js";
import { dataPulse } from "./dataPulse.js";
import { fluidBackground } from "./fluidBackground.js";
import { glitchText } from "./glitchText.js";
import { htmlSlide } from "./htmlSlide.js";
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
import { videoClip } from "./videoClip.js";
import { videoWindow } from "./videoWindow.js";
import { pulseWave } from "./pulseWave.js";
import { radialBurst } from "./radialBurst.js";
import { toolboxSlide } from "./toolboxSlide.js";
import { iconCardGrid } from "./iconCardGrid.js";
import { codeBlock } from "./codeBlock.js";
import { horizontalBars } from "./horizontalBars.js";
import { quoteBlock } from "./quoteBlock.js";
import { vignette } from "./vignette.js";
import { ccFrame } from "./ccFrame.js";
import { ccBigNumber } from "./ccBigNumber.js";
import { ccPill } from "./ccPill.js";
import { ccNote } from "./ccNote.js";
import { ccDesc } from "./ccDesc.js";
import { markdownSlide } from "./markdownSlide.js";
import { lottieAnim } from "./lottieAnim.js";
import { assertSceneContract, assertNoDuplicateIds } from "./_contract.js";
import { META_TABLE, listSceneMeta } from "./meta/index.js";

export const RENDER_FNS = { auroraGradient, barChartReveal, circleRipple, codeBlock, cornerBadge, countdown, dataPulse, fluidBackground, glitchText, horizontalBars, htmlSlide, iconCardGrid, imageHero, videoClip, videoWindow, kineticHeadline, lineChart, lottieAnim, lowerThirdVelvet, markdownSlide, meshGrid, neonGrid, orbitRings, particleFlow, pixelRain, pulseWave, quoteBlock, radialBurst, shapeBurst, spotlightSweep, starfield, svgOverlay, textOverlay, toolboxSlide, vignette, ccFrame, ccBigNumber, ccPill, ccNote, ccDesc };

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
const PUBLIC_SCENE_IDS = SCENE_IDS;

export function getScene(id) {
  return REGISTRY.get(id);
}

export function listScenes() {
  return PUBLIC_SCENE_IDS.map((id) => REGISTRY.get(id).META);
}

export { META_TABLE, listSceneMeta };
