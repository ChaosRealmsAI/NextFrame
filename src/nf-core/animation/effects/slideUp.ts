import { clamp01, joinTransforms, px } from "../shared.js";

// Slides content upward into place while fading it in.
export function slideUp(progress: number, opts: { distance?: number } = {}) {
  const p = clamp01(progress);
  const distance = opts.distance ?? 40;
  return {
    opacity: p,
    transform: joinTransforms(`translate3d(0, ${px(distance * (1 - p))}, 0)`),
  };
}
