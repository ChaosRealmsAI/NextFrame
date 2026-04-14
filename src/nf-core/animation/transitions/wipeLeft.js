import { clamp01, inset } from "../shared.js";

// B reveals from the left while A is clipped away from the left.
export function wipeLeft(progress) {
  const p = clamp01(progress);
  return {
    layerA: { clipPath: inset(0, 0, 0, p * 100) },
    layerB: { clipPath: inset(0, (1 - p) * 100, 0, 0) },
  };
}
