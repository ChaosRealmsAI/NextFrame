// nf-core scene registry — imports from categorized subdirectories.
import { auroraGradient } from "./backgrounds/auroraGradient.js";
import { fluidBackground } from "./backgrounds/fluidBackground.js";
import { starfield } from "./backgrounds/starfield.js";
import { spotlightSweep } from "./backgrounds/spotlightSweep.js";
import { pixelRain } from "./backgrounds/pixelRain.js";
import { particleFlow } from "./backgrounds/particleFlow.js";
import { orbitRings } from "./backgrounds/orbitRings.js";

import { kineticHeadline } from "./typography/kineticHeadline.js";
import { glitchText } from "./typography/glitchText.js";
import { countdown } from "./typography/countdown.js";
import { textOverlay } from "./typography/textOverlay.js";
import { quoteBlock } from "./typography/quoteBlock.js";

import { barChartReveal } from "./data/barChartReveal.js";
import { lineChart } from "./data/lineChart.js";
import { dataPulse } from "./data/dataPulse.js";
import { pulseWave } from "./data/pulseWave.js";
import { horizontalBars } from "./data/horizontalBars.js";

import { imageHero } from "./media/imageHero.js";
import { videoClip } from "./media/videoClip.js";
import { videoWindow } from "./media/videoWindow.js";

import { lowerThirdVelvet } from "./overlays/lowerThirdVelvet.js";
import { cornerBadge } from "./overlays/cornerBadge.js";
import { vignette } from "./overlays/vignette.js";
import { codeBlock } from "./overlays/codeBlock.js";
import { iconCardGrid } from "./overlays/iconCardGrid.js";
import { svgOverlay } from "./overlays/svgOverlay.js";

import { neonGrid } from "./shapes/neonGrid.js";
import { meshGrid } from "./shapes/meshGrid.js";
import { circleRipple } from "./shapes/circleRipple.js";
import { shapeBurst } from "./shapes/shapeBurst.js";
import { radialBurst } from "./shapes/radialBurst.js";

import { htmlSlide } from "./browser/htmlSlide.js";
import { markdownSlide } from "./browser/markdownSlide.js";
import { lottieAnim } from "./browser/lottieAnim.js";

import { ccFrame } from "./series/ccFrame.js";
import { ccBigNumber } from "./series/ccBigNumber.js";
import { ccPill } from "./series/ccPill.js";
import { ccNote } from "./series/ccNote.js";
import { ccDesc } from "./series/ccDesc.js";
import { toolboxSlide } from "./series/toolboxSlide.js";

import { assertSceneContract, assertNoDuplicateIds } from "./_contract.js";
import { META_TABLE, listSceneMeta } from "./meta.js";

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

export function getScene(id) {
  return REGISTRY.get(id);
}

export function listScenes() {
  return SCENE_IDS.map((id) => REGISTRY.get(id).META);
}

export { META_TABLE, listSceneMeta };
