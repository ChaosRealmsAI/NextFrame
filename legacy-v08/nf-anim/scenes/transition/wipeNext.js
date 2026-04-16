// TODO: replace text placeholders with slot-aware scene composition later
const meta = {
  id: "wipeNext",
  ratio: "any",
  duration_hint: 1.6,
  type: "motion",
  category: "transition",
  description: "Solid color wipe carries a scene change from left to right",
  params: [
    { name: "fromText", type: "string", default: "FROM" },
    { name: "toText", type: "string", default: "TO" },
    { name: "wipeColor", type: "color", default: "#da7756" },
  ],
  examples: [{ fromText: "Overview", toText: "Details", wipeColor: "#da7756" }],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      fromText = params.fromText ?? "FROM",
      toText = params.toText ?? "TO",
      wipeColor = params.wipeColor ?? "#da7756";
    return {
      duration: 1.6,
      size: [W, H],
      layers: [
        {
          type: "rect",
          at: [W / 2, H / 2],
          width: W,
          height: H,
          fill: "#231b18",
        },
        {
          type: "text",
          at: [W / 2, H / 2],
          text: fromText,
          fontSize: 138,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#f5ece0",
          tracks: {
            opacity: [
              [0, 1],
              [0.86, 0, "inOut"],
            ],
          },
        },
        {
          type: "rect",
          at: [W / 2, H / 2],
          width: W,
          height: H,
          fill: "#f5ece0",
          tracks: {
            opacity: [
              [0, 0],
              [0.7, 0],
              [1.02, 1, "out"],
            ],
          },
        },
        {
          type: "text",
          at: [W / 2, H / 2],
          text: toText,
          fontSize: 138,
          font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: "#1f1815",
          tracks: {
            opacity: [
              [0, 0],
              [0.76, 0],
              [1.12, 1, "out"],
            ],
          },
        },
        {
          type: "rect",
          at: [W / 2, H / 2],
          width: W * 1.08,
          height: H * 1.08,
          fill: wipeColor,
          tracks: {
            x: [
              [0, -W * 1.08],
              [0.82, 0, "inOut"],
              [1.6, W * 1.08, "inOut"],
            ],
          },
        },
      ],
    };
  },
  describe(t, params = {}) {
    return { sceneId: meta.id, phase: t < 0.8 ? "wipe-in" : "reveal", params };
  },
  sample() {
    return meta.examples[0];
  },
};
