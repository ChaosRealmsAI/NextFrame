import { clamp01 } from "../shared.js";

// Pure CSS fade-out.
export function fadeOut(progress: number) {
  return { opacity: 1 - clamp01(progress) };
}
