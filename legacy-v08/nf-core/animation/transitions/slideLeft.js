import { clamp01, joinTransforms, round } from "../shared.js";
// Slides B in from the left over A.
export function slideLeft(progress) {
    const p = clamp01(progress);
    return {
        layerA: { opacity: 1 },
        layerB: { transform: joinTransforms(`translate3d(${round((p - 1) * 100)}%, 0, 0)`) },
    };
}
