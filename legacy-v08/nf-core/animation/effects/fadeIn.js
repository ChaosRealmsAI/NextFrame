import { clamp01 } from "../shared.js";

// Pure CSS fade-in.
export function fadeIn(progress) {
  return { opacity: clamp01(progress) };
}
