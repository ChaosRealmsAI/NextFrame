import { circle, clamp01 } from "../shared.js";

// Reveals B through an expanding iris over A.
export function irisOpen(progress: any) {
  const p = clamp01(progress);
  return {
    layerA: { opacity: 1 },
    layerB: { clipPath: circle(p * 75) },
  };
}
