import { bounce } from "../../engine/keyframes.js";
import { clamp01, joinTransforms, round } from "../shared.js";

// Bounce-in entrance with an elastic scale.
export function bounceIn(progress: any) {
  const p = clamp01(progress);
  const bounceProgress = bounce(p);
  const scale = 0.35 + bounceProgress * 0.65;
  return {
    opacity: Math.min(1, p * 1.5),
    transform: joinTransforms(`scale(${round(scale)})`),
    transformOrigin: "50% 50%",
  };
}
