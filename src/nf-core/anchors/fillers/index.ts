import type { AnchorDict, AnchorEntry } from "../types.js";
import tts from "./tts.js";
import manual from "./manual.js";
import code from "./code.js";

export type FillerFn = (entry: AnchorEntry, dict: AnchorDict) => Promise<void> | void;

export const Fillers = new Map<string, FillerFn>();

export function registerFiller(name: string, fn: FillerFn) {
  Fillers.set(name, fn);
}

registerFiller("tts", tts);
registerFiller("manual", manual);
registerFiller("code", code);

export { default as ttsFiller } from "./tts.js";
export { default as manualFiller } from "./manual.js";
export { default as codeFiller } from "./code.js";
