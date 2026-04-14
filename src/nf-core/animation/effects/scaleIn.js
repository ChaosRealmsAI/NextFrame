import { clamp01, joinTransforms, round } from "../shared.js";

// Grows content from a smaller scale while fading in.
export function scaleIn(progress) {
  const p = clamp01(progress);
  const scale = 0.6 + p * 0.4;
  return {
    opacity: p,
    transform: joinTransforms(`scale(${round(scale)})`),
    transformOrigin: "50% 50%",
  };
}
