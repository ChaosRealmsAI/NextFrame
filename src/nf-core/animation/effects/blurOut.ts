import { clamp01, px } from "../shared.js";

// Blurs content away while fading it out.
export function blurOut(progress: any, opts = {}) {
  const p = clamp01(progress);
  const maxBlur = opts.blur ?? 20;
  const blur = maxBlur * p;
  return {
    opacity: 1 - p,
    filter: blur > 0.01 ? `blur(${px(blur)})` : "none",
  };
}
