import { clamp01, joinTransforms, round } from "../shared.js";

// Springy overshoot entrance tuned for DOM/SVG.
export function springIn(progress: any) {
  const p = clamp01(progress);
  const spring = 1 - Math.exp(-6 * p) * Math.cos(p * Math.PI * 4) * (1 - p);
  const scale = 0.5 + spring * 0.5;
  return {
    opacity: Math.min(1, p * 1.6),
    transform: joinTransforms(`scale(${round(scale)})`),
    transformOrigin: "50% 50%",
  };
}
