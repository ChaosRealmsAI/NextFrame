import impact from "../../behaviors/effects/impact.js";
// TODO: tune heartLike pacing once richer scene recipes land
const meta = { id: "heartLike", ratio: "any", duration_hint: 2.5, type: "motion", category: "feedback", description: "Like reaction: heart impact + ripple + sparkle burst", params: [{ name: "heartColor", type: "color", default: "#da7756" }, { name: "rippleColor", type: "color", default: "#ff9ab8" }, { name: "burstColor", type: "color", default: "#ffb44d" }], examples: [{ heartColor: "#da7756", rippleColor: "#ff9ab8", burstColor: "#ffb44d" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, cx = W / 2, cy = H / 2;
    const heartColor = params.heartColor ?? "#da7756", rippleColor = params.rippleColor ?? "#ff9ab8", burstColor = params.burstColor ?? "#ffb44d";
    return { duration: 2.5, size: [W, H], layers: [
      { type: "circle", at: [cx, cy], radius: 112, fill: "#2a201c", opacity: 0.92, behaviors: [impact(0, 1.2, { scale: 1.05, stretch: 0.06 })] },
      { type: "ripple", at: [cx, cy], color: rippleColor, strokeWidth: 6, count: 3, fromScale: 0.7, maxScale: 4, startAt: 0.38, duration: 0.9 },
      { type: "burst", at: [cx, cy], shape: "sparkle", color: burstColor, particles: 8, distance: 168, radius: 10, startAt: 0.46, duration: 0.7 },
      { type: "shape", shape: "heart", at: [cx, cy], fill: heartColor, behaviors: [impact(0, 1.5, { scale: 1.22, stretch: 0.14 })] },
    ] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.45 ? "impact" : t < 1.2 ? "burst" : "settle", params }; },
  sample() { return meta.examples[0]; },
};
