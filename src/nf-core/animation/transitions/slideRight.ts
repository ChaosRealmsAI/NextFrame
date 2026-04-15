import { clamp01, joinTransforms, round } from "../shared.js";

// Slides B in from the right over A.
export function slideRight(progress: number) {
  const p = clamp01(progress);
  return {
    layerA: { opacity: 1 },
    layerB: { transform: joinTransforms(`translate3d(${round((1 - p) * 100)}%, 0, 0)`) },
  };
}
