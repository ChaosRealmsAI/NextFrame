import shake from "../../behaviors/emphasis/shake.js";
// TODO: add glitch/error variants if the feedback catalog broadens
const meta = {
  id: "errorShake",
  ratio: "any",
  duration_hint: 2.0,
  type: "motion",
  category: "feedback",
  description: "Error alert: red cross with impact scale + shake + expanding warm-red ring ripple (artisan rev)",
  params: [
    { name: "crossColor", type: "color", default: "#c9302c" },
    { name: "haloColor",  type: "color", default: "#fde7e1" },
    { name: "rippleColor", type: "color", default: "#c9302c" },
    { name: "label", type: "string", default: "出错了" },
  ],
  examples: [{ crossColor: "#c9302c", haloColor: "#fde7e1", rippleColor: "#c9302c", label: "出错了" }],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240, cx = W / 2, cy = H * 0.44;
    const S = Math.min(W, H);
    const crossColor = params.crossColor ?? "#c9302c";
    const crossDim = "#3a1a17";
    const halo = params.haloColor ?? "#fde7e1";
    const ripple = params.rippleColor ?? "#c9302c";
    const label = params.label ?? "出错了";
    const crossScale = 0.34 * S / 100;
    const haloR = S * 0.22;
    const ringStart = S * 0.17;
    const ringEnd = S * 0.46;
    const dur = 2.0;

    return {
      duration: dur, size: [W, H],
      layers: [
        // cream warm background wash (fades in)
        { type: "shape", shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: "#f5ece0",
          tracks: { opacity: [[0, 0], [0.2, 1, "out"]] } },

        // red-halo soft circle behind cross (low opacity, gentle swell with the impact)
        { type: "shape", shape: "circle", at: [cx, cy], radius: haloR, fill: halo,
          tracks: {
            opacity: [[0, 0], [0.18, 0.55, "outBack"], [0.6, 0.38, "inOut"], [dur, 0.28, "inOut"]],
            scale: [[0, 0.55], [0.22, 1.12, "outBack"], [0.55, 1.0, "inOut"], [dur, 1.02]],
          } },

        // expanding warm-red ring — single impact ripple, expands once then fades
        { type: "shape", shape: "ring", at: [cx, cy], stroke: ripple, strokeWidth: 2.2,
          tracks: {
            radius: [[0, ringStart], [0.9, ringEnd, "outCirc"]],
            opacity: [[0, 0], [0.22, 0.75, "out"], [0.9, 0, "outExpo"]],
          } },

        // cross — warm red, dim→bright color fade, impact scale-in then shake (~3 oscillations)
        { type: "shape", shape: "cross", at: [cx, cy], scale: [crossScale, crossScale],
          behaviors: [shake(0.38, 0.65, { distance: S * 0.028 })],
          tracks: {
            fill: [[0, crossDim], [0.24, crossColor, "outBack"]],
            opacity: [[0, 0], [0.18, 1, "out"]],
            scale: [[0, 0.55], [0.22, 1.18, "outBack"], [0.42, 0.96, "inOut"], [0.6, 1.0, "inOut"]],
          } },

        // muted label below
        { type: "shape", shape: "text", at: [cx, H * 0.78], text: label,
          fill: "#7a5a52", font: "system-ui, -apple-system, sans-serif",
          fontSize: S * 0.052, weight: 500, letterSpacing: S * 0.006,
          tracks: { opacity: [[0, 0], [0.7, 0.9, "out"], [dur, 0.9]] } },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.22 ? "impact" : t < 0.6 ? "shake" : t < 1.0 ? "ripple" : "settle",
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
