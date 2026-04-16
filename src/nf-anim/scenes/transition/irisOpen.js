// TODO: replace this fake iris with clipping once masks are part of the engine
const meta = {
  id: "irisOpen",
  ratio: "any",
  duration_hint: 1.6,
  type: "motion",
  category: "transition",
  description: "Center iris expands outward to reveal the next scene",
  params: [
    { name: "fromText", type: "string", default: "Before" },
    { name: "toText", type: "string", default: "After" },
    { name: "toColor", type: "color", default: "#f5ece0" },
  ],
  examples: [{ fromText: "Search", toText: "Result", toColor: "#f5ece0" }],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      R = Math.max(W, H),
      fromText = params.fromText ?? "Before",
      toText = params.toText ?? "After",
      toColor = params.toColor ?? "#f5ece0";
    return {
      duration: 1.6,
      size: [W, H],
      layers: [
        {
          type: "rect",
          at: [W / 2, H / 2],
          width: W,
          height: H,
          fill: "#211917",
        },
        {
          type: "text",
          at: [W / 2, H / 2],
          text: fromText,
          fontSize: 132,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#f5ece0",
          tracks: {
            opacity: [
              [0, 1],
              [0.64, 0, "out"],
            ],
          },
        },
        {
          type: "circle",
          at: [W / 2, H / 2],
          radius: R,
          fill: toColor,
          tracks: {
            scale: [
              [0, 0.02],
              [1.12, 1.05, "outExpo"],
              [1.6, 1.08],
            ],
            opacity: [
              [0, 1],
              [1.6, 1, "linear"],
            ],
          },
        },
        {
          type: "ring",
          at: [W / 2, H / 2],
          radius: 116,
          stroke: "#da7756",
          strokeWidth: 10,
          tracks: {
            scale: [
              [0, 0.2],
              [0.8, 1.2, "out"],
              [1.6, 1.35, "linear"],
            ],
            opacity: [
              [0, 0.9],
              [1.4, 0, "out"],
            ],
          },
        },
        {
          type: "text",
          at: [W / 2, H / 2],
          text: toText,
          fontSize: 132,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#1f1815",
          tracks: {
            opacity: [
              [0, 0],
              [0.64, 0],
              [1.2, 1, "out"],
            ],
          },
        },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.55 ? "seed" : t < 1.1 ? "open" : "resolved",
      params,
    };
  },
  sample() {
    return meta.examples[0];
  },
};
