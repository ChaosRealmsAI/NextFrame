import { clamp01 } from "../shared.js";

// Pure CSS fade-out.
export function fadeOut(progress) {
  return { opacity: 1 - clamp01(progress) };
}
