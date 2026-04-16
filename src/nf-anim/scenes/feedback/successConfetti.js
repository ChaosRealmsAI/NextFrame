import impact from "../../behaviors/effects/impact.js";
// TODO: support per-particle color tracks when engine allows color arrays on burst

const meta = {
  id: "successConfetti",
  ratio: "any",
  duration_hint: 2.5,
  type: "motion",
  category: "feedback",
  description: "Success beat: check mark + warm halo + ripple + confetti burst + label (artisan rev)",
  params: [
    { name: "checkColor",   type: "color",  default: "#da7756" },
    { name: "haloColor",    type: "color",  default: "#ffd1b8" },
    { name: "confettiColor",type: "color",  default: "#da7756" },
    { name: "sparkColor",   type: "color",  default: "#ff5577" },
    { name: "label",        type: "string", default: "Success!" },
  ],
  examples: [{}],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240, cx = W / 2, cy = H / 2 - H * 0.06;
    const check = params.checkColor   ?? "#da7756";
    const checkDim = "#3a2a22";
    const halo  = params.haloColor    ?? "#ffd1b8";
    const conf  = params.confettiColor?? "#da7756";
    const spark = params.sparkColor   ?? "#ff5577";
    const ink   = "#1a1614";
    const label = params.label ?? "Success!";
    const unit  = Math.min(W, H);
    const checkScale = 0.32 * unit / 100;
    const haloR    = unit * 0.26;
    const innerR   = unit * 0.18;
    const rippleR  = unit * 0.52;
    const confD    = unit * 0.42;
    const sparkD   = unit * 0.62;

    return {
      duration: 2.5, size: [W, H],
      layers: [
        // soft cream wash — stage lighting
        { type: "shape", shape: "circle", at: [cx, cy], radius: Math.max(W, H) * 0.6, fill: "#f5ece0",
          tracks: { opacity: [[0, 0], [0.35, 0.22, "out"], [2.1, 0.22], [2.5, 0, "in"]] } },

        // outer halo — warm peach glow, breathes with the check
        { type: "shape", shape: "circle", at: [cx, cy], radius: haloR, fill: halo,
          tracks: {
            opacity: [[0, 0], [0.28, 0.55, "outBack"], [0.9, 0.32, "inOut"], [2.5, 0, "in"]],
            scale:   [[0, 0.55], [0.32, 1.18, "outBack"], [0.9, 1.0, "inOut"], [2.5, 1.0]],
          } },

        // inner disc — cream plate under the check
        { type: "shape", shape: "circle", at: [cx, cy], radius: innerR, fill: "#fff4e6",
          tracks: {
            opacity: [[0, 0], [0.22, 0.9, "outBack"], [2.5, 0.9]],
            scale:   [[0, 0.4], [0.3, 1.08, "outBack"], [0.5, 1.0, "inOut"]],
          } },

        // ripple — three thin ink rings expanding outward
        { type: "ripple", at: [cx, cy], color: ink, strokeWidth: 1.4, count: 3,
          fromScale: rippleR / 50 * 0.55, maxScale: rippleR / 50 * 1.6,
          startAt: 0.38, duration: 1.0, opacity: 0.45 },

        // confetti — 12 rectangular chips in warm orange (rect reads width/height directly)
        { type: "burst", at: [cx, cy], shape: "rect", fill: conf,
          particles: 12, distance: confD, width: unit * 0.032, height: unit * 0.012, radius: unit * 0.002,
          startAt: 0.30, duration: 0.95, opacity: 1.0, seed: 7 },

        // sparkles — 8 pink-pop stars (sparkle is 100×100 internal, so scale down to ~7%)
        { type: "burst", at: [cx, cy], shape: "sparkle", fill: spark,
          particles: 8, distance: sparkD, scale: [0.12, 0.12],
          startAt: 0.46, duration: 1.0, opacity: 0.95, seed: 23 },

        // check mark — color fades dim → warm orange, with impact punch
        { type: "shape", shape: "check", at: [cx, cy], scale: [checkScale, checkScale],
          tracks: { fill: [[0, checkDim], [0.28, check, "outBack"]] },
          behaviors: [impact(0.04, 1.2, { scale: 1.22, stretch: 0.10 })] },

        // label — slides up with outBack, warm ink
        { shape: "text", at: [cx, cy + unit * 0.36], text: label,
          fontSize: unit * 0.11, font: "Avenir Next, Helvetica Neue, sans-serif",
          fill: ink, weight: 700, letterSpacing: unit * 0.003,
          tracks: {
            opacity: [[0.55, 0], [0.95, 1, "out"]],
            offset:  [[0.55, [0, unit * 0.06]], [0.95, [0, 0], "outBack"]],
          } },
      ],
    };
  },
  describe(t) {
    return { sceneId: meta.id, phase: t < 0.3 ? "rise" : t < 0.95 ? "burst" : t < 1.8 ? "settle" : "linger" };
  },
  sample() { return meta.examples[0]; },
};
