// nf-core scene registry — 5 representative scenes.
import { auroraGradient } from "./backgrounds/auroraGradient.js";
import { kineticHeadline } from "./typography/kineticHeadline.js";
import { barChartReveal } from "./data/barChartReveal.js";
import { circleRipple } from "./shapes/circleRipple.js";
import { lowerThirdVelvet } from "./overlays/lowerThirdVelvet.js";
import { assertSceneContract, assertNoDuplicateIds } from "./_contract.js";
import { META_TABLE, listSceneMeta } from "./meta.js";

export const RENDER_FNS = { auroraGradient, barChartReveal, circleRipple, kineticHeadline, lowerThirdVelvet };

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
