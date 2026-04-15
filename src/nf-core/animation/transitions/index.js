// Transition registry — pure CSS transitions between two overlapping layers.
// Each transition: apply(progress, opts) → { layerA, layerB }
import { dissolve } from "./dissolve.js";
import { wipeLeft } from "./wipeLeft.js";
import { wipeUp } from "./wipeUp.js";
import { wipeRight } from "./wipeRight.js";
import { wipeDown } from "./wipeDown.js";
import { zoomIn } from "./zoomIn.js";
import { fadeBlack } from "./fadeBlack.js";
import { fadeWhite } from "./fadeWhite.js";
import { irisOpen } from "./irisOpen.js";
import { irisClose } from "./irisClose.js";
import { slideLeft } from "./slideLeft.js";
import { slideRight } from "./slideRight.js";
import { push } from "./push.js";
export const TRANSITION_TABLE = {
    dissolve: { id: "dissolve", description: "Opacity cross-fade", params: [{ name: "dur", type: "number", default: 0.8 }] },
    wipeLeft: { id: "wipeLeft", description: "Left-to-right wipe", params: [{ name: "dur", type: "number", default: 0.6 }] },
    wipeUp: { id: "wipeUp", description: "Bottom-to-top wipe", params: [{ name: "dur", type: "number", default: 0.6 }] },
    wipeRight: { id: "wipeRight", description: "Right-to-left wipe", params: [{ name: "dur", type: "number", default: 0.6 }] },
    wipeDown: { id: "wipeDown", description: "Top-to-bottom wipe", params: [{ name: "dur", type: "number", default: 0.6 }] },
    zoomIn: { id: "zoomIn", description: "Zoom into next clip", params: [{ name: "dur", type: "number", default: 0.5 }] },
    fadeBlack: { id: "fadeBlack", description: "Fade through black", params: [{ name: "dur", type: "number", default: 1.0 }] },
    fadeWhite: { id: "fadeWhite", description: "Fade through white", params: [{ name: "dur", type: "number", default: 1.0 }] },
    irisOpen: { id: "irisOpen", description: "Circular iris open reveal", params: [{ name: "dur", type: "number", default: 0.6 }] },
    irisClose: { id: "irisClose", description: "Circular iris close reveal", params: [{ name: "dur", type: "number", default: 0.6 }] },
    slideLeft: { id: "slideLeft", description: "Slide in from left", params: [{ name: "dur", type: "number", default: 0.6 }] },
    slideRight: { id: "slideRight", description: "Slide in from right", params: [{ name: "dur", type: "number", default: 0.6 }] },
    push: { id: "push", description: "Push A out, B in from right", params: [{ name: "dur", type: "number", default: 0.6 }] },
};
export const TRANSITION_FNS = { dissolve, wipeLeft, wipeUp, wipeRight, wipeDown, zoomIn, fadeBlack, fadeWhite, irisOpen, irisClose, slideLeft, slideRight, push };
export const TRANSITION_IDS = Object.keys(TRANSITION_FNS);
export const TRANSITION_NAMES = [...TRANSITION_IDS];
export function getTransition(id) {
    const fns = TRANSITION_FNS;
    const table = TRANSITION_TABLE;
    if (!fns[id])
        return null;
    return { id, apply: fns[id], META: table[id] };
}
export function listTransitions() {
    const table = TRANSITION_TABLE;
    return TRANSITION_IDS.map((id) => table[id]);
}
