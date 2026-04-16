import impact from "../../behaviors/effects/impact.js";
// TODO: diversify confetti shapes when the engine gets richer particle control
const meta = { id: "successConfetti", ratio: "any", duration_hint: 2.5, type: "motion", category: "feedback", description: "Confetti burst with check icon and Success! label", params: [{ name: "confettiColor", type: "color", default: "#ffb44d" }, { name: "checkColor", type: "color", default: "#f5ece0" }, { name: "label", type: "string", default: "Success!" }], examples: [{ confettiColor: "#ffb44d", checkColor: "#f5ece0", label: "Success!" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, cx = W / 2, cy = H / 2 - 24;
    const confettiColor = params.confettiColor ?? "#ffb44d", checkColor = params.checkColor ?? "#f5ece0", label = params.label ?? "Success!";
    return { duration: 2.5, size: [W, H], layers: [
      { type: "circle", at: [cx, cy], radius: 110, fill: "#2b221d", behaviors: [impact(0, 1.2, { scale: 1.06, stretch: 0.05 })] },
      { type: "burst", at: [cx, cy], shape: "sparkle", color: confettiColor, particles: 10, distance: 192, radius: 10, startAt: 0.14, duration: 0.9 },
      { type: "burst", at: [cx, cy], color: "#da7756", particles: 14, distance: 148, radius: 8, startAt: 0.2, duration: 0.78 },
      { type: "shape", shape: "check", at: [cx, cy], fill: checkColor, behaviors: [impact(0, 1.1, { scale: 1.18, stretch: 0.08 })] },
      { type: "text", at: [cx, cy + 166], text: label, fontSize: 66, font: "Avenir Next, Helvetica Neue, sans-serif", fill: confettiColor, tracks: { opacity: [[0.42, 0], [0.82, 1, "out"]], scale: [[0.42, 0.86], [0.82, 1, "outBack"]] } },
    ] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.25 ? "launch" : t < 1.1 ? "confetti" : "celebrate", params }; },
  sample() { return meta.examples[0]; },
};
