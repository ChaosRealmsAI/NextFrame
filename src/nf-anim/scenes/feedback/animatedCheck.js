import impact from "../../behaviors/effects/impact.js";
import pulse from "../../behaviors/emphasis/pulse.js";
// TODO: swap to a true path-draw check when stroke rendering grows up
const meta = {
  id: "animatedCheck",
  ratio: "any",
  duration_hint: 2.2,
  type: "motion",
  category: "feedback",
  description: "Check mark reveal with ring pulse and success label",
  params: [
    { name: "checkColor", type: "color", default: "#f5ece0" },
    { name: "ringColor", type: "color", default: "#da7756" },
    { name: "label", type: "string", default: "COMPLETE" },
  ],
  examples: [
    { checkColor: "#f5ece0", ringColor: "#da7756", label: "COMPLETE" },
  ],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      cx = W / 2,
      cy = H / 2 - 36;
    const checkColor = params.checkColor ?? "#f5ece0",
      ringColor = params.ringColor ?? "#da7756",
      label = params.label ?? "COMPLETE";
    return {
      duration: 2.2,
      size: [W, H],
      layers: [
        { type: "circle", at: [cx, cy], radius: 98, fill: "#241c18" },
        {
          type: "ring",
          at: [cx, cy],
          radius: 104,
          stroke: ringColor,
          strokeWidth: 12,
          behaviors: [pulse(0.16, 1.2, { scale: 1.1, floorOpacity: 0.58 })],
        },
        {
          type: "ripple",
          at: [cx, cy],
          color: ringColor,
          strokeWidth: 5,
          count: 1,
          fromScale: 1,
          maxScale: 2.4,
          startAt: 0.3,
          duration: 0.8,
        },
        {
          type: "shape",
          shape: "check",
          at: [cx, cy],
          fill: checkColor,
          behaviors: [impact(0, 1.2, { scale: 1.16, stretch: 0.08 })],
        },
        {
          type: "text",
          at: [cx, cy + 156],
          text: label,
          fontSize: 64,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: ringColor,
          tracks: {
            opacity: [
              [0.45, 0],
              [0.82, 1, "out"],
            ],
            scale: [
              [0.45, 0.88],
              [0.82, 1, "outBack"],
            ],
          },
        },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.4 ? "draw" : t < 1 ? "pulse" : "hold",
      params,
    };
  },
  sample() {
    return meta.examples[0];
  },
};
