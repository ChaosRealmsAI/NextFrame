// TODO: support alternate loading glyph layouts if product needs them
const meta = { id: "loadingPulse", ratio: "any", duration_hint: 2.4, type: "motion", category: "feedback", description: "Pulsing dot trio with optional loading label", params: [{ name: "dotColor", type: "color", default: "#da7756" }, { name: "label", type: "string", default: "Loading" }], examples: [{ dotColor: "#da7756", label: "Loading" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, d = 2.4, cx = W / 2, cy = H / 2 - 10, dotColor = params.dotColor ?? "#da7756", label = params.label ?? "Loading";
    const pulse = (phase) => ({ opacity: [[0, 0.28], [phase, 0.28], [phase + 0.24, 1], [phase + 0.52, 0.28], [d, 0.28, "linear"]], scale: [[0, 0.72], [phase, 0.72], [phase + 0.24, 1.12, "out"], [phase + 0.52, 0.72], [d, 0.72, "linear"]] });
    const dots = [-54, 0, 54].map((x, i) => ({ type: "dot", at: [cx + x, cy], fill: dotColor, radius: 22, tracks: pulse(i * 0.18) }));
    return { duration: d, size: [W, H], layers: [{ type: "capsule", at: [cx, cy], width: 248, height: 108, fill: "#211a17" }, ...dots, ...(label ? [{ type: "text", at: [cx, cy + 116], text: label, fontSize: 54, font: "Avenir Next, Helvetica Neue, sans-serif", fill: "#f5ece0", tracks: { opacity: [[0, 0.62], [d / 2, 1], [d, 0.62, "linear"]] } }] : [])] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: "loop", params }; },
  sample() { return meta.examples[0]; },
};
