import { clamp01, joinTransforms, round } from "../shared.js";

// Shrinks content down while fading it out.
export function scaleOut(progress: number) {
  const p = clamp01(progress);
  const scale = 1 - p * 0.4;
  return {
    opacity: 1 - p,
    transform: joinTransforms(`scale(${round(scale)})`),
    transformOrigin: "50% 50%",
  };
}
