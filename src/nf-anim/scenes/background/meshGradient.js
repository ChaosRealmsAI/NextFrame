// TODO: convert these warm blobs to true gradient meshes if defs/filters arrive
const meta = { id: "meshGradient", ratio: "any", duration_hint: 6, type: "motion", category: "background", description: "Slow flowing warm mesh-style background built from loop-safe translucent blobs", params: [{ name: "speed", type: "number", default: 1 }, { name: "baseColor", type: "color", default: "#1a1614" }], examples: [{ speed: 1, baseColor: "#1a1614" }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0, H = vp.height || 0, speed = Math.max(0.25, params.speed ?? 1), d = 6 / speed, baseColor = params.baseColor ?? "#1a1614";
    const loop = (a, b = -a) => [[0, 0], [d * 0.25, a], [d * 0.5, 0], [d * 0.75, b], [d, 0, "linear"]];
    return { duration: d, size: [W, H], layers: [
      { type: "rect", at: [W / 2, H / 2], width: W, height: H, fill: baseColor },
      { type: "circle", at: [W * 0.28, H * 0.34], radius: W * 0.34, fill: "#da775644", tracks: { x: loop(W * 0.04), y: loop(-H * 0.03, H * 0.02), scale: [[0, 1], [d / 2, 1.08], [d, 1, "linear"]] } },
      { type: "circle", at: [W * 0.74, H * 0.58], radius: W * 0.3, fill: "#f5ece026", tracks: { x: loop(-W * 0.05, W * 0.03), y: loop(H * 0.02, -H * 0.04), scale: [[0, 1], [d / 2, 0.94], [d, 1, "linear"]] } },
      { type: "circle", at: [W * 0.48, H * 0.76], radius: W * 0.26, fill: "#ffb44d20", tracks: { x: loop(W * 0.03, -W * 0.02), y: loop(H * 0.03, -H * 0.02), scale: [[0, 1], [d / 2, 1.06], [d, 1, "linear"]] } },
    ] };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: "loop", params }; },
  sample() { return meta.examples[0]; },
};
