import { clamp01, joinTransforms, round } from "../shared.js";

// Pushes A out to the left while B enters from the right.
export function push(progress) {
  const p = clamp01(progress);
  return {
    layerA: { transform: joinTransforms(`translate3d(${round(-p * 100)}%, 0, 0)`) },
    layerB: { transform: joinTransforms(`translate3d(${round((1 - p) * 100)}%, 0, 0)`) },
  };
}
