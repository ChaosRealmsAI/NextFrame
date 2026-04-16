import impact from "../../behaviors/effects/impact.js";

const meta = {
  id: "heartLike",
  ratio: "any",
  duration_hint: 2.5,
  type: "motion",
  category: "feedback",
  description: "Like reaction: gradient heart + glow + ripple + sparkle burst (artisan rev)",
  params: [
    { name: "heartColor", type: "color", default: "#ff5577" },
    { name: "glowColor",  type: "color", default: "#ffaaaa" },
    { name: "rippleColor", type: "color", default: "#ffd1de" },
    { name: "burstColor", type: "color", default: "#ffd166" },
  ],
  examples: [{}],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240, cx = W / 2, cy = H / 2;
    const heart = params.heartColor ?? "#ff5577";
    const heartDim = "#3a1a22";
    const glow = params.glowColor ?? "#ffaaaa";
    const ripple = params.rippleColor ?? "#ffd1de";
    const burst = params.burstColor ?? "#ffd166";
    const unit = Math.min(W, H);
    const heartScale = 0.55 * unit / 100;
    const haloR = unit * 0.22;
    const rippleR = unit * 0.45;
    const burstD = unit * 0.40;

    return {
      duration: 2.5, size: [W, H],
      layers: [
        // soft warm vignette wash (fades in)
        { type: "shape", shape: "circle", at: [cx, cy], radius: Math.max(W, H) * 0.55, fill: "#ffeedd",
          tracks: { opacity: [[0, 0], [0.3, 0.18, "out"], [2, 0.18], [2.5, 0, "in"]] } },

        // ripple — 3 thin warm rings expanding outward
        { type: "ripple", at: [cx, cy], color: ripple, strokeWidth: 1.5, count: 3,
          fromScale: rippleR / 50 * 0.6, maxScale: rippleR / 50 * 1.8,
          startAt: 0.42, duration: 1.1, opacity: 0.6 },

        // sparkle burst — 8 warm-gold particles fly outward beyond heart
        { type: "burst", at: [cx, cy], shape: "sparkle", color: burst, particles: 8,
          distance: burstD, radius: unit * 0.022,
          startAt: 0.5, duration: 0.8, opacity: 1.0 },

        // glow underlay — soft pink halo behind heart
        { type: "shape", shape: "circle", at: [cx, cy], radius: haloR, fill: glow,
          tracks: {
            opacity: [[0, 0], [0.3, 0.55, "outBack"], [0.7, 0.35, "inOut"], [2.5, 0, "in"]],
            scale: [[0, 0.6], [0.4, 1.15, "outBack"], [0.8, 1.0, "inOut"], [2.5, 1.0]],
          } },

        // heart — color fades from dim → bright pink, scales with impact
        { type: "shape", shape: "heart", at: [cx, cy], scale: [heartScale, heartScale],
          tracks: {
            // color interpolation: dim warm → bright pink (using new color interp!)
            fill: [[0, heartDim], [0.25, heart, "outBack"]],
          },
          behaviors: [impact(0, 1.4, { scale: 1.18, stretch: 0.12 })] },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.4 ? "anticipation" : t < 0.8 ? "burst" : t < 1.5 ? "settle" : "linger",
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
