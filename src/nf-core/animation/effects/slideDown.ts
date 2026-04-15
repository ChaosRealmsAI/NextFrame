import { clamp01, joinTransforms, px } from "../shared.js";

// Slides content downward while fading it out.
export function slideDown(progress: number, opts: { distance?: number } = {}) {
  const p = clamp01(progress);
  const distance = opts.distance ?? 40;
  return {
    opacity: 1 - p,
    transform: joinTransforms(`translate3d(0, ${px(distance * p)}, 0)`),
  };
}
