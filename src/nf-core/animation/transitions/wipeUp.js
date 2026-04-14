import { clamp01, inset } from "../shared.js";

// B reveals from the bottom while A is clipped away from the bottom.
export function wipeUp(progress) {
  const p = clamp01(progress);
  return {
    layerA: { clipPath: inset(0, 0, p * 100, 0) },
    layerB: { clipPath: inset((1 - p) * 100, 0, 0, 0) },
  };
}
