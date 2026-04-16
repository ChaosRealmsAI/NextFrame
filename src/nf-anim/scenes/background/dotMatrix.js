// TODO: add line/cluster variants if more ambient backgrounds are needed
const meta = {
  id: "dotMatrix",
  ratio: "any",
  duration_hint: 4,
  type: "motion",
  category: "background",
  description: "Animated dot grid with gentle loop-safe pulsing",
  params: [
    { name: "speed", type: "number", default: 1 },
    { name: "dotColor", type: "color", default: "#da7756" },
  ],
  examples: [{ speed: 1, dotColor: "#da7756" }],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      speed = Math.max(0.25, params.speed ?? 1),
      d = 4 / speed,
      dotColor = params.dotColor ?? "#da7756";
    const cols = Math.max(8, Math.round(W / 160)),
      rows = Math.max(5, Math.round(H / 160)),
      dots = [];
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        const x = (W * (col + 1)) / (cols + 1),
          y = (H * (row + 1)) / (rows + 1),
          p = ((row * 3 + col * 2) % 8) * d * 0.06;
        dots.push({
          type: "circle",
          at: [x, y],
          radius: Math.max(6, Math.min(W / cols, H / rows) * 0.06),
          fill: dotColor,
          tracks: {
            opacity: [
              [0, 0.14],
              [p, 0.14],
              [p + d * 0.18, 0.74, "out"],
              [p + d * 0.36, 0.14],
              [d, 0.14, "linear"],
            ],
            scale: [
              [0, 0.82],
              [p, 0.82],
              [p + d * 0.18, 1.18, "out"],
              [p + d * 0.36, 0.82],
              [d, 0.82, "linear"],
            ],
          },
        });
      }
    return {
      duration: d,
      size: [W, H],
      layers: [
        {
          type: "rect",
          at: [W / 2, H / 2],
          width: W,
          height: H,
          fill: "#181412",
        },
        ...dots,
      ],
    };
  },
  describe(t, params = {}) {
    return { sceneId: meta.id, phase: "loop", params };
  },
  sample() {
    return meta.examples[0];
  },
};
