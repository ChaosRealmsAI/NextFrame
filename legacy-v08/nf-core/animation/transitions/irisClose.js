import { circle, clamp01 } from "../shared.js";
// Shrinks A into an iris while B takes over underneath.
export function irisClose(progress) {
    const p = clamp01(progress);
    return {
        layerA: { clipPath: circle((1 - p) * 75) },
        layerB: { opacity: 1 },
    };
}
