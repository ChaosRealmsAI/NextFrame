import { clamp01 } from "../shared.js";
// Cross-fade between the outgoing and incoming layers.
export function dissolve(progress) {
    const p = clamp01(progress);
    return {
        layerA: { opacity: 1 - p },
        layerB: { opacity: p },
    };
}
