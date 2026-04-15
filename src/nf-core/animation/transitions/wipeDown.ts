import { clamp01, inset } from "../shared.js";

// B reveals from the top while A is clipped away from the top.
export function wipeDown(progress: number) {
  const p = clamp01(progress);
  return {
    layerA: { clipPath: inset(p * 100, 0, 0, 0) },
    layerB: { clipPath: inset(0, 0, (1 - p) * 100, 0) },
  };
}
