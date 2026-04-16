import shake from "../../behaviors/emphasis/shake.js";
// TODO: add glitch/error variants if the feedback catalog broadens
const meta = { id: "errorShake", ratio: "any", duration_hint: 2, type: "motion", category: "feedback", description: "Cross icon with red alert color, shake, and ERROR label", params: [{ name: "errorColor", type: "color", default: "#ef6b63" }, { name: "labelColor", type: "color", default: "#f5ece0" }, { name: "label", type: "string", default: "ERROR" }], examples: [{ errorColor: "#ef6b63", labelColor: "#f5ece0", label: "ERROR" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, cx = W / 2, cy = H / 2 - 40;
    const errorColor = params.errorColor ?? "#ef6b63", labelColor = params.labelColor ?? "#f5ece0", label = params.label ?? "ERROR";
    return { duration: 2, size: [W, H], layers: [
      { type: "circle", at: [cx, cy], radius: 104, fill: "#2a1716", tracks: { opacity: [[0, 0.8], [2, 0.8, "linear"]] }, behaviors: [shake(0.18, 0.72, { distance: 22 })] },
      { type: "shape", shape: "cross", at: [cx, cy], fill: errorColor, behaviors: [shake(0.18, 0.72, { distance: 22 })], tracks: { scale: [[0, 0.7], [0.2, 1.08, "outBack"], [0.5, 1]], opacity: [[0, 0], [0.16, 1, "out"]] } },
      { type: "text", at: [cx, cy + 154], text: label, fontSize: 70, font: "Avenir Next, Helvetica Neue, sans-serif", fill: labelColor, behaviors: [shake(0.28, 0.7, { distance: 16 })], tracks: { opacity: [[0.22, 0], [0.46, 1, "out"]] } },
    ] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.3 ? "alert" : t < 1 ? "shake" : "hold", params }; },
  sample() { return meta.examples[0]; },
};
