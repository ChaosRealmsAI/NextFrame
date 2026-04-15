import { clamp01, inset } from "../shared.js";

// Reveals content from left to right with a clip mask.
export function wipeReveal(progress: number) {
  const p = clamp01(progress);
  return {
    opacity: 1,
    clipPath: inset(0, (1 - p) * 100, 0, 0),
  };
}
