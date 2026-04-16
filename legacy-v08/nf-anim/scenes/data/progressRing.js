import countUp from "../../behaviors/data/countUp.js";
import pieFill from "../../behaviors/data/pieFill.js";
import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";

const meta = {
  id: "progressRing",
  ratio: "any",
  duration_hint: 2.6,
  type: "motion",
  category: "data",
  description: "Circular progress ring with countUp inside (artisan rev — anthropic warm)",
  params: [
    { name: "value", type: "number", default: 86 },
    { name: "label", type: "string", default: "上线就绪度" },
    { name: "suffix", type: "string", default: "" },
  ],
  examples: [{ value: 86, label: "上线就绪度", suffix: "" }],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const cx = W / 2;
    const cy = H * 0.46;
    const palette = { ink: "#1a1614", warm: "#da7756", warmDeep: "#b8593e", cream: "#f5ece0", muted: "#7a6a5e", soft: "#fffbeb", trackBg: "#e8d8c4" };
    const value = Math.max(0, Math.min(100, Number(params.value ?? 86)));
    const label = params.label ?? "上线就绪度";
    const suffix = params.suffix ?? "";

    const ringR = S * 0.18;
    const stroke = S * 0.04;

    return {
      duration: 2.6, size: [W, H],
      layers: [
        // ── soft cream wash background
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: palette.soft,
          tracks: { opacity: [[0, 0], [0.3, 1, "out"]] } },

        // ── outer faint ring (track background)
        { shape: "ring", at: [cx, cy], radius: ringR,
          stroke: palette.trackBg, strokeWidth: stroke,
          behaviors: [fadeIn(0.1, 0.5)] },

        // ── filled progress arc using pieFill (warm orange)
        { shape: "pie", at: [cx, cy], value, radius: ringR, fill: palette.warm,
          tracks: { fill: [[0.2, palette.warmDeep], [1.0, palette.warm, "out"]] },
          behaviors: [pieFill(0.3, 1.4, { percent: value })] },

        // ── inner soft cream disk that masks center (creates ring effect)
        { shape: "circle", at: [cx, cy], radius: ringR - stroke / 2 - 1, fill: palette.soft,
          behaviors: [fadeIn(0.1, 0.4)] },

        // ── center percent number (countUp 0 → value)
        { shape: "text", at: [cx, cy + S * 0.005], suffix: "%",
          decimals: 0, fill: palette.ink,
          font: "Inter, system-ui, sans-serif", fontSize: S * 0.10, weight: 800,
          tracks: { fill: [[0.3, palette.muted], [1.5, palette.ink, "out"]] },
          behaviors: [
            countUp(0.3, 1.4, { from: 0, value, easing: "outCubic" }),
          ] },

        // ── tiny suffix text below number (optional)
        ...(suffix ? [{
          shape: "text", at: [cx, cy + S * 0.075], text: suffix,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.025, weight: 500,
          behaviors: [fadeIn(1.6, 0.5)],
        }] : []),

        // ── small accent dot above label (anchor)
        { shape: "circle", at: [cx, H * 0.78 - S * 0.022], radius: S * 0.008, fill: palette.warm,
          behaviors: [fadeIn(1.7, 0.4)] },

        // ── label below ring
        { shape: "text", at: [cx, H * 0.82], text: label,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.040, weight: 500,
          letterSpacing: S * 0.003,
          behaviors: [slideInUp(1.75, 0.6, { distance: S * 0.025 })] },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.3 ? "intro" : t < 1.7 ? "filling" : "settle",
      visible: true,
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
