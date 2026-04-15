import { clamp01, joinTransforms, round } from "../shared.js";

// Springy exit with a subtle overshoot before settling out.
export function springOut(progress) {
  const p = clamp01(progress);
  const spring = 1 - Math.exp(-6 * p) * Math.cos(p * Math.PI * 4) * (1 - p);
  const scale = 1.05 - spring * 0.45;
  return {
    opacity: 1 - p,
    transform: joinTransforms(`scale(${round(scale)})`),
    transformOrigin: "50% 50%",
  };
}
