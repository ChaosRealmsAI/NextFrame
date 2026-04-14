import { clamp01, joinTransforms, px } from "../shared.js";

// Slides content in from the right while fading it up.
export function slideRight(progress, opts = {}) {
  const p = clamp01(progress);
  const distance = opts.distance ?? 40;
  return {
    opacity: p,
    transform: joinTransforms(`translate3d(${px(distance * (1 - p))}, 0, 0)`),
  };
}
