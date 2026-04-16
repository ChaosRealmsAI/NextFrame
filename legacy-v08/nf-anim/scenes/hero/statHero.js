import popIn from "../../behaviors/entrance/popIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import countUp from "../../behaviors/data/countUp.js";

const meta = {
  id: "statHero",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "hero",
  description: "Massive countUp stat with eyebrow + label + arrow (artisan rev)",
  params: [
    { name: "value", type: "number", default: 1247 },
    { name: "unit", type: "string", default: "" },
    { name: "eyebrow", type: "string", default: "本周关键指标" },
    { name: "label", type: "string", default: "新增用户" },
    { name: "delta", type: "string", default: "+47%" },
    { name: "trend", type: "enum", default: "up" },
  ],
  examples: [{ value: 1247, eyebrow: "本周关键指标", label: "新增用户", delta: "+47%" }],
};

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240, S = Math.min(W, H);
    const cx = W * 0.5, cy = H * 0.5;
    const palette = { ink: "#1a1614", warm: "#da7756", cream: "#f5ece0", muted: "#7a6a5e", accent: "#ff5c33" };
    const value = Number(p.value ?? 1247);
    const unit = p.unit ?? "";
    const eyebrow = p.eyebrow ?? "本周关键指标";
    const label = p.label ?? "新增用户";
    const delta = p.delta ?? "+47%";
    const trend = p.trend ?? "up";
    const arrowRot = trend === "down" ? 90 : trend === "flat" ? 0 : -90;

    return {
      duration: 3, size: [W, H],
      layers: [
        // ── soft cream wash background block (anthropic warm)
        { shape: "rect", at: [cx, cy], width: W, height: H, fill: palette.cream,
          tracks: { opacity: [[0, 0], [0.4, 1, "out"]] } },

        // ── eyebrow bar (small uppercase + accent dot)
        { shape: "circle", at: [cx - S * 0.18, cy - S * 0.30], radius: S * 0.014, fill: palette.warm,
          behaviors: [popIn(0.2, 0.4, { fromScale: 0, peakScale: 1.4 })] },
        { shape: "text", at: [cx - S * 0.16, cy - S * 0.295], text: eyebrow,
          fill: palette.warm, font: "system-ui, sans-serif", fontSize: S * 0.030, weight: 600,
          behaviors: [slideInUp(0.25, 0.5, { distance: S * 0.02 })] },

        // ── main stat number (massive, ink color, countUp)
        { shape: "text", at: [cx, cy + S * 0.02], prefix: "", suffix: unit,
          decimals: 0, fill: palette.ink,
          font: "Inter, system-ui, sans-serif", fontSize: S * 0.32, weight: 800,
          tracks: { fill: [[0, palette.muted], [0.7, palette.ink, "out"]] },
          behaviors: [
            countUp(0.45, 1.6, { from: 0, value, easing: "outCubic" }),
            popIn(0.45, 0.5, { fromScale: 0.85, peakScale: 1.02 }),
          ] },

        // ── divider line (grows from center)
        { shape: "rect", at: [cx, cy + S * 0.18], width: S * 0.04, height: 1,
          fill: palette.warm, opacity: 0.6,
          tracks: { width: [[1.7, S * 0.04], [2.0, S * 0.16, "outCubic"]] } },

        // ── label below
        { shape: "text", at: [cx, cy + S * 0.24], text: label,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.038, weight: 500,
          behaviors: [slideInUp(2.0, 0.6, { distance: S * 0.025 })] },

        // ── delta in bottom right corner (small, warm, with arrow)
        { shape: "arrow", at: [W - S * 0.16, H - S * 0.10], rotate: arrowRot,
          fill: palette.warm, scale: S / 3200,
          behaviors: [popIn(2.3, 0.4, { fromScale: 0, peakScale: 1.3 })] },
        { shape: "text", at: [W - S * 0.10, H - S * 0.095], text: delta,
          fill: palette.warm, font: "system-ui, sans-serif", fontSize: S * 0.034, weight: 700,
          behaviors: [slideInUp(2.35, 0.5, { distance: S * 0.02 })] },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.4 ? "intro" : t < 1.6 ? "counting" : t < 2.0 ? "delta" : "label",
      visible: true,
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
