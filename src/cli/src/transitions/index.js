// Transition registry — cross-fade between overlapping clips.
// Each transition: apply(ctxOut, canvasA, canvasB, progress, width, height, params)

import { dissolve } from "./dissolve.js";
import { wipeLeft } from "./wipeLeft.js";
import { wipeUp } from "./wipeUp.js";
import { zoomIn } from "./zoomIn.js";

export const TRANSITION_TABLE = {
  dissolve: { id: "dissolve", description: "Opacity cross-fade",       params: [{ name: "dur", type: "number", default: 0.8 }] },
  wipeLeft: { id: "wipeLeft", description: "Left-to-right wipe",       params: [{ name: "dur", type: "number", default: 0.6 }] },
  wipeUp:   { id: "wipeUp",   description: "Bottom-to-top wipe",       params: [{ name: "dur", type: "number", default: 0.6 }] },
  zoomIn:   { id: "zoomIn",   description: "Zoom into next clip",      params: [{ name: "dur", type: "number", default: 0.5 }] },
};

export const TRANSITION_FNS = { dissolve, wipeLeft, wipeUp, zoomIn };
export const TRANSITION_IDS = Object.keys(TRANSITION_FNS);

export function getTransition(id) {
  if (!TRANSITION_FNS[id]) return null;
  return { id, apply: TRANSITION_FNS[id], META: TRANSITION_TABLE[id] };
}

export function listTransitions() {
  return TRANSITION_IDS.map((id) => TRANSITION_TABLE[id]);
}
