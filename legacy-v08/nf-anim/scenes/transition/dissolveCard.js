// TODO: move this to a real mask-based dissolve when SVG defs are available
const meta = {
  id: "dissolveCard",
  ratio: "any",
  duration_hint: 1.8,
  type: "motion",
  category: "transition",
  description: "Card dissolves away with a deterministic grain cloud reveal",
  params: [
    { name: "fromText", type: "string", default: "Card A" },
    { name: "toText", type: "string", default: "Card B" },
    { name: "grainColor", type: "color", default: "#da7756" },
  ],
  examples: [
    {
      fromText: "Quarterly Plan",
      toText: "Launch Ready",
      grainColor: "#da7756",
    },
  ],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      cx = W / 2,
      cy = H / 2,
      fromText = params.fromText ?? "Card A",
      toText = params.toText ?? "Card B",
      grainColor = params.grainColor ?? "#da7756";
    const grains = Array.from({ length: 24 }, (_, i) => {
      const col = i % 6,
        row = (i / 6) | 0,
        s = 0.16 + ((i * 7) % 9) * 0.08;
      return {
        type: "square",
        at: [cx - 200 + col * 80, cy - 120 + row * 80],
        size: 70,
        fill: grainColor,
        tracks: {
          opacity: [
            [0, 0],
            [s, 0],
            [s + 0.02, 0.92],
            [s + 0.52, 0, "outExpo"],
          ],
          scale: [
            [s, 0.45],
            [s + 0.08, 1.02, "outBack"],
            [s + 0.52, 0.6],
          ],
          y: [
            [s, 0],
            [s + 0.52, (row - 1.5) * 16, "out"],
          ],
        },
      };
    });
    return {
      duration: 1.8,
      size: [W, H],
      layers: [
        { type: "rect", at: [cx, cy], width: W, height: H, fill: "#181412" },
        {
          type: "rect",
          at: [cx, cy],
          width: 560,
          height: 360,
          radius: 38,
          fill: "#f5ece0",
          tracks: {
            opacity: [
              [0, 0.2],
              [0.9, 0.2],
              [1.3, 1, "out"],
            ],
          },
        },
        {
          type: "text",
          at: [cx, cy],
          text: toText,
          fontSize: 104,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#1f1815",
          tracks: {
            opacity: [
              [0, 0],
              [0.88, 0],
              [1.34, 1, "out"],
            ],
          },
        },
        {
          type: "rect",
          at: [cx, cy],
          width: 560,
          height: 360,
          radius: 38,
          fill: "#2a201c",
          tracks: {
            opacity: [
              [0, 1],
              [0.86, 0.96],
              [1.32, 0, "outExpo"],
            ],
          },
        },
        {
          type: "text",
          at: [cx, cy],
          text: fromText,
          fontSize: 104,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#f5ece0",
          tracks: {
            opacity: [
              [0, 1],
              [0.76, 0.88],
              [1.18, 0, "outExpo"],
            ],
          },
        },
        ...grains,
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.65 ? "hold" : t < 1.15 ? "dissolve" : "reveal",
      params,
    };
  },
  sample() {
    return meta.examples[0];
  },
};
