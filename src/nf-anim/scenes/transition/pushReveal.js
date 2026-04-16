// TODO: support richer from/to slot content beyond simple text placeholders
const meta = { id: "pushReveal", ratio: "any", duration_hint: 1.8, type: "motion", category: "transition", description: "Old content pushes out while new content slides in from the right", params: [{ name: "fromText", type: "string", default: "Old" }, { name: "toText", type: "string", default: "New" }, { name: "accentColor", type: "color", default: "#da7756" }], examples: [{ fromText: "Old Flow", toText: "New Flow", accentColor: "#da7756" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, cx = W / 2, cy = H / 2, fromText = params.fromText ?? "Old", toText = params.toText ?? "New", accentColor = params.accentColor ?? "#da7756";
    return { duration: 1.8, size: [W, H], layers: [
      { type: "rect", at: [cx, cy], width: W, height: H, fill: "#171311" },
      { type: "rect", at: [cx, cy], width: W * 0.76, height: H * 0.62, radius: 42, fill: "#2a201c", tracks: { x: [[0, 0], [1.8, -W * 1.05, "inOut"]] } },
      { type: "text", at: [cx, cy], text: fromText, fontSize: 116, font: "Avenir Next, Helvetica Neue, sans-serif", fill: "#f5ece0", tracks: { x: [[0, 0], [1.8, -W * 1.05, "inOut"]] } },
      { type: "rect", at: [cx, cy], width: W * 0.76, height: H * 0.62, radius: 42, fill: "#f5ece0", tracks: { x: [[0, W * 1.05], [1.8, 0, "inOut"]] } },
      { type: "text", at: [cx, cy], text: toText, fontSize: 116, font: "Avenir Next, Helvetica Neue, sans-serif", fill: "#1f1815", tracks: { x: [[0, W * 1.05], [1.8, 0, "inOut"]] } },
      { type: "rect", at: [cx, cy + H * 0.34], width: W * 0.22, height: 16, radius: 8, fill: accentColor, tracks: { x: [[0, 0], [1.8, -W * 0.08, "inOut"]], opacity: [[0, 0.7], [1.8, 1, "linear"]] } },
    ] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.9 ? "push" : "settle", params }; },
  sample() { return meta.examples[0]; },
};
