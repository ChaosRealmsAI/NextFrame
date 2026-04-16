import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";

const meta = {
  id: "quoteLarge",
  ratio: "any",
  duration_hint: 3.4,
  type: "motion",
  category: "hero",
  description: "Large italic serif quote + warm accent + attribution (artisan rev)",
  params: [
    { name: "quote", type: "string", default: "想法以帧的速度移动。" },
    { name: "attribution", type: "string", default: "— NextFrame Manifesto" },
  ],
  examples: [{ quote: "想法以帧的速度移动。", attribution: "— NextFrame Manifesto" }],
};

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const cx = W * 0.5;
    const palette = { ink: "#1a1614", warm: "#da7756", cream: "#f5ece0", muted: "#7a6a5e", soft: "#fffbeb" };
    const quote = p.quote ?? "想法以帧的速度移动。";
    const attribution = p.attribution ?? "— NextFrame Manifesto";

    return {
      duration: 3.4, size: [W, H],
      layers: [
        // ── soft cream wash background
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: palette.soft,
          tracks: { opacity: [[0, 0], [0.4, 1, "out"]] } },

        // ── giant left-quote glyph (decoration, very pale warm)
        { shape: "text", at: [W * 0.18, H * 0.42], text: "“",
          fill: palette.warm, font: "Georgia, serif", fontSize: S * 0.40, weight: 700,
          tracks: { opacity: [[0, 0], [0.4, 0.18, "out"]] } },

        // ── main quote text (large italic serif, ink)
        { shape: "text", at: [cx, H * 0.48], text: quote,
          fill: palette.ink, font: "Georgia, serif", fontSize: S * 0.10, weight: 600, style: "italic",
          letterSpacing: S * 0.001,
          tracks: { fill: [[0.4, palette.muted], [1.0, palette.ink, "out"]] },
          behaviors: [
            slideInUp(0.5, 0.9, { distance: S * 0.025 }),
            fadeIn(0.5, 0.6),
          ] },

        // ── warm orange accent line below quote (animated grow)
        { shape: "rect", at: [cx, H * 0.65], width: 1, height: 1.5,
          fill: palette.warm, opacity: 0.85,
          tracks: { width: [[1.4, 1], [1.8, S * 0.06, "outCubic"]] } },

        // ── attribution (small sans, muted)
        { shape: "text", at: [cx, H * 0.72], text: attribution,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.034, weight: 500,
          letterSpacing: S * 0.003,
          behaviors: [slideInUp(1.8, 0.7, { distance: S * 0.020 })] },

        // ── giant right-quote glyph (mirrored)
        { shape: "text", at: [W * 0.82, H * 0.55], text: "”",
          fill: palette.warm, font: "Georgia, serif", fontSize: S * 0.40, weight: 700,
          tracks: { opacity: [[0, 0], [2.5, 0.18, "out"]] } },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.5 ? "intro" : t < 1.4 ? "quote" : t < 1.8 ? "accent" : "attribution",
      visible: true,
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
