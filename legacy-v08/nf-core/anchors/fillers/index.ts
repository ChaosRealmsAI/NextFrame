import tts from "./tts.ts";
import manual from "./manual.ts";
import code from "./code.ts";

export type FillerFn = (...args: unknown[]) => Promise<unknown> | unknown;

export const Fillers = new Map<string, FillerFn>();

export function registerFiller(name: string, fn: FillerFn): void {
  Fillers.set(name, fn);
}

export function runFiller<T>(name: string, ...args: unknown[]): T {
  const filler = Fillers.get(name);
  if (!filler) {
    throw new Error(`UNKNOWN_FILLER: filler "${name}" is not registered`);
  }
  return filler(...args) as T;
}

registerFiller("tts", tts);
registerFiller("manual", manual);
registerFiller("code", code);

export { default as ttsFiller } from "./tts.ts";
export { default as manualFiller } from "./manual.ts";
export { default as codeFiller } from "./code.ts";
