import { clamp01, round } from "../shared.js";

// Fades through a bright white flash using desaturation and exposure.
export function fadeWhite(progress: number) {
  const p = clamp01(progress);

  if (p < 0.5) {
    const phase = p * 2;
    return {
      layerA: {
        opacity: 1,
        filter: `grayscale(${round(phase)}) brightness(${round(1 + phase * 1.8)}) contrast(${round(1 - phase * 0.15)})`,
      },
      layerB: { opacity: 0, filter: "grayscale(1) brightness(2.8) contrast(0.85)" },
    };
  }

  const phase = (p - 0.5) * 2;
  return {
    layerA: { opacity: 0, filter: "grayscale(1) brightness(2.8) contrast(0.85)" },
    layerB: {
      opacity: 1,
      filter: `grayscale(${round(1 - phase)}) brightness(${round(2.8 - phase * 1.8)}) contrast(${round(0.85 + phase * 0.15)})`,
    },
  };
}
