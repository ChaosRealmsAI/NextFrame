import { clamp01, joinTransforms, round } from "../shared.js";

// A punches forward and fades while B settles in behind it.
export function zoomIn(progress) {
  const p = clamp01(progress);
  return {
    layerA: {
      opacity: 1 - p,
      transform: joinTransforms(`scale(${round(1 + p * 0.28)})`),
      transformOrigin: "50% 50%",
    },
    layerB: {
      opacity: 0.4 + p * 0.6,
      transform: joinTransforms(`scale(${round(0.92 + p * 0.08)})`),
      transformOrigin: "50% 50%",
    },
  };
}
