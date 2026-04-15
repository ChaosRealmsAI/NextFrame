import { clamp01, px } from "../shared.js";

// Resolves from a soft blur to crisp content.
export function blurIn(progress: number, opts: { blur?: number } = {}) {
  const p = clamp01(progress);
  const maxBlur = opts.blur ?? 20;
  const blur = maxBlur * (1 - p);
  return {
    opacity: p,
    filter: blur > 0.01 ? `blur(${px(blur)})` : "none",
  };
}
