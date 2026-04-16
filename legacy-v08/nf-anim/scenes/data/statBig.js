import countUp from "../../behaviors/data/countUp.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import fadeIn from "../../behaviors/entrance/fadeIn.js";

const meta = {
  id: "statBig",
  ratio: "any",
  duration_hint: 3.0,
  type: "motion",
  category: "data",
  description: "1 hero stat + 3 supporting KPIs in cards (artisan rev — anthropic warm)",
  params: [
    { name: "data", type: "array", default: [
      { label: "营收", value: 128, suffix: "M" },
      { label: "同比增长", value: 42, suffix: "%" },
      { label: "转化率", value: 18, suffix: "%" },
      { label: "NPS", value: 74, suffix: "" },
    ] },
  ],
  examples: [{
    data: [
      { label: "营收", value: 128, suffix: "M" },
      { label: "同比增长", value: 42, suffix: "%" },
      { label: "转化率", value: 18, suffix: "%" },
      { label: "NPS", value: 74, suffix: "" },
    ],
  }],
};

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const data = (p.data ?? meta.examples[0].data).slice(0, 4);
    const main = data[0];
    const rest = data.slice(1, 4);
    const palette = { ink: "#1a1614", warm: "#da7756", warmDeep: "#b8593e", cream: "#f5ece0", muted: "#7a6a5e", soft: "#fffbeb", card: "#fff5e8" };
    const cx = W * 0.5;

    const layers = [
      // ── soft cream wash background
      { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: palette.soft,
        tracks: { opacity: [[0, 0], [0.3, 1, "out"]] } },

      // ── small accent dot above main label
      { shape: "circle", at: [cx, H * 0.18], radius: S * 0.012, fill: palette.warm,
        behaviors: [popIn(0.15, 0.4, { fromScale: 0, peakScale: 1.4 })] },

      // ── main label "营收"
      { shape: "text", at: [cx, H * 0.225], text: main.label,
        fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.034, weight: 500,
        letterSpacing: S * 0.005,
        behaviors: [slideInUp(0.20, 0.5, { distance: S * 0.015 })] },

      // ── massive main value (countUp)
      { shape: "text", at: [cx, H * 0.42], suffix: main.suffix ?? "",
        decimals: 0, fill: palette.ink,
        font: "Inter, system-ui, sans-serif", fontSize: S * 0.32, weight: 800,
        tracks: { fill: [[0, palette.muted], [0.9, palette.ink, "out"]] },
        behaviors: [
          countUp(0.35, 1.4, { from: 0, value: main.value, easing: "outCubic" }),
          popIn(0.35, 0.5, { fromScale: 0.85, peakScale: 1.02 }),
        ] },

      // ── warm divider line
      { shape: "rect", at: [cx, H * 0.56], width: 1, height: 1.5,
        fill: palette.warm, opacity: 0.7,
        tracks: { width: [[1.4, 1], [1.7, S * 0.1, "outCubic"]] } },
    ];

    // ── 3 small KPI cards below
    const cardW = W * 0.26;
    const cardH = S * 0.20;
    const cardY = H * 0.78;
    const colors = [palette.warm, "#c4895d", palette.warmDeep];
    rest.forEach((kpi, i) => {
      const x = cx + (i - 1) * (cardW + S * 0.02);
      const start = 1.7 + i * 0.12;
      // card bg
      layers.push({ shape: "rect", at: [x, cardY], width: cardW, height: cardH,
        radius: S * 0.022, fill: palette.card, opacity: 0.92,
        behaviors: [slideInUp(start, 0.55, { distance: S * 0.025 }), fadeIn(start, 0.4)] });
      // top accent line
      layers.push({ shape: "rect", at: [x, cardY - cardH * 0.45], width: cardW * 0.94, height: 1.5,
        fill: colors[i], opacity: 0.85,
        behaviors: [fadeIn(start + 0.05, 0.35)] });
      // value (countUp)
      layers.push({ shape: "text", at: [x, cardY - S * 0.005], suffix: kpi.suffix ?? "",
        decimals: 0, fill: colors[i],
        font: "Inter, system-ui, sans-serif", fontSize: S * 0.075, weight: 800,
        behaviors: [countUp(start + 0.1, 0.7, { from: 0, value: kpi.value, easing: "outCubic" })] });
      // label
      layers.push({ shape: "text", at: [x, cardY + S * 0.06], text: kpi.label,
        fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.026, weight: 500,
        letterSpacing: S * 0.003,
        behaviors: [fadeIn(start + 0.15, 0.4)] });
    });

    return { duration: 3.0, size: [W, H], layers };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.35 ? "label" : t < 1.7 ? "main" : t < 2.5 ? "kpis" : "settle",
      visible: true,
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
