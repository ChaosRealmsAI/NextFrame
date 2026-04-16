import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import springIn from "../../behaviors/entrance/springIn.js";
import float from "../../behaviors/continuous/float.js";

const meta = {
  id: "brandReveal",
  ratio: "any",
  duration_hint: 3.2,
  type: "motion",
  category: "hero",
  description: "Brand lockup: monogram in ring + name + tagline + accent line (artisan rev)",
  params: [
    { name: "mark", type: "string", default: "NF" },
    { name: "brand", type: "string", default: "NextFrame" },
    { name: "subtitle", type: "string", default: "AI-native video engine" },
  ],
  examples: [{ mark: "NF", brand: "NextFrame", subtitle: "AI-native video engine" }],
};

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240, S = Math.min(W, H);
    const cx = W * 0.5;
    const palette = { ink: "#1a1614", warm: "#da7756", cream: "#f5ece0", muted: "#7a6a5e", soft: "#fffbeb" };
    const mark = p.mark ?? "NF";
    const brand = p.brand ?? "NextFrame";
    const subtitle = p.subtitle ?? "AI-native video engine";

    return {
      duration: 3.2, size: [W, H],
      layers: [
        // ── soft gradient wash background
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: palette.soft,
          tracks: { opacity: [[0, 0], [0.5, 1, "out"]] } },

        // ── decorative circle behind mark (filled, very soft)
        { shape: "circle", at: [cx, H * 0.34], radius: S * 0.18, fill: palette.warm,
          tracks: { opacity: [[0, 0], [0.3, 0.10, "out"]], scale: [[0, [0.4, 0.4]], [0.5, [1, 1], "outBack"]] } },

        // ── outer ring around mark
        { shape: "ring", at: [cx, H * 0.34], radius: S * 0.13,
          stroke: palette.warm, strokeWidth: S * 0.008,
          behaviors: [
            springIn(0.1, 0.75, { fromScale: 0.4, overshoot: 1.15 }),
            float(0.85, 6, { y: S * 0.008, tilt: 0.8 }),
          ] },

        // ── mark text (large serif, warm color)
        { shape: "text", at: [cx, H * 0.355], text: mark,
          fill: palette.warm, font: "Georgia, serif", fontSize: S * 0.09, weight: 700,
          tracks: { fill: [[0, palette.muted], [0.6, palette.warm, "out"]] },
          behaviors: [springIn(0.25, 0.85, { fromScale: 0.5, overshoot: 1.1 })] },

        // ── horizontal accent line beneath mark (animated grow)
        { shape: "rect", at: [cx, H * 0.49], width: 1, height: 1.5, fill: palette.warm, opacity: 0.7,
          tracks: { width: [[0.7, 1], [1.1, S * 0.08, "outCubic"]] } },

        // ── brand name (big serif, ink)
        { shape: "text", at: [cx, H * 0.58], text: brand,
          fill: palette.ink, font: "Georgia, serif", fontSize: S * 0.13, weight: 700,
          letterSpacing: S * 0.003,
          behaviors: [springIn(1.0, 0.85, { fromScale: 0.85, overshoot: 1.04 })] },

        // ── subtitle (sans, muted, slide up)
        { shape: "text", at: [cx, H * 0.72], text: subtitle,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.034, weight: 500,
          letterSpacing: S * 0.002,
          behaviors: [slideInUp(1.5, 0.7, { distance: S * 0.025 })] },

        // ── three small accent dots below
        { shape: "circle", at: [cx - S * 0.04, H * 0.83], radius: S * 0.008, fill: palette.warm, opacity: 0.6,
          behaviors: [fadeIn(2.0, 0.35)] },
        { shape: "circle", at: [cx, H * 0.83], radius: S * 0.008, fill: palette.warm, opacity: 0.6,
          behaviors: [fadeIn(2.1, 0.35)] },
        { shape: "circle", at: [cx + S * 0.04, H * 0.83], radius: S * 0.008, fill: palette.warm, opacity: 0.6,
          behaviors: [fadeIn(2.2, 0.35)] },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.5 ? "mark" : t < 1.5 ? "brand" : t < 2.0 ? "subtitle" : "complete",
      visible: true,
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
