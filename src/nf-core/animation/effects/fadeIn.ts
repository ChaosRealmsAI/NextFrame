import { clamp01 } from "../shared.js";

// Pure CSS fade-in.
export function fadeIn(progress: number) {
  return { opacity: clamp01(progress) };
}
