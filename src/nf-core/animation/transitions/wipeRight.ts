import { clamp01, inset } from "../shared.js";

// B reveals from the right while A is clipped away from the right.
export function wipeRight(progress: any) {
  const p = clamp01(progress);
  return {
    layerA: { clipPath: inset(0, p * 100, 0, 0) },
    layerB: { clipPath: inset(0, 0, 0, (1 - p) * 100) },
  };
}
