import { clamp01, joinTransforms, px } from "../shared.js";

// Slides content in from the left while fading it up.
export function slideLeft(progress: number, opts: { distance?: number } = {}) {
  const p = clamp01(progress);
  const distance = opts.distance ?? 40;
  return {
    opacity: p,
    transform: joinTransforms(`translate3d(${px(-distance * (1 - p))}, 0, 0)`),
  };
}
