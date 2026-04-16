import { clamp01, round } from "../shared.js";
// Fades through black by dimming A, then brightening B from black.
export function fadeBlack(progress) {
    const p = clamp01(progress);
    if (p < 0.5) {
        const phase = p * 2;
        return {
            layerA: { opacity: 1, filter: `brightness(${round(1 - phase)})` },
            layerB: { opacity: 0, filter: "brightness(0)" },
        };
    }
    const phase = (p - 0.5) * 2;
    return {
        layerA: { opacity: 0, filter: "brightness(0)" },
        layerB: { opacity: 1, filter: `brightness(${round(phase)})` },
    };
}
