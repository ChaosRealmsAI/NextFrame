import impact from "../../behaviors/effects/impact.js";
// TODO: consider true stroke-dashoffset path-draw when shapes layer grows up
const meta = {
  id: "animatedCheck", ratio: "any", duration_hint: 2.5, type: "motion", category: "feedback",
  description: "Success confirm: warm wash + ring ripple + green disc with check + label (artisan rev)",
  params: [
    { name: "discColor", type: "color", default: "#2a8a4f" },
    { name: "checkColor", type: "color", default: "#f5ece0" },
    { name: "ringColor", type: "color", default: "#da7756" },
    { name: "washColor", type: "color", default: "#ffd1b8" },
    { name: "label", type: "string", default: "Done" },
    { name: "labelColor", type: "color", default: "#7a6a5e" },
  ],
  examples: [{}],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 360, height: 260 }) {
    const W = vp.width || 360, H = vp.height || 260, cx = W / 2, cy = H / 2 - 18;
    const disc = params.discColor ?? "#2a8a4f", discDim = "#17402a";
    const check = params.checkColor ?? "#f5ece0";
    const ring = params.ringColor ?? "#da7756";
    const wash = params.washColor ?? "#ffd1b8";
    const label = params.label ?? "Done";
    const labelColor = params.labelColor ?? "#7a6a5e";
    const unit = Math.min(W, H);
    const discR = unit * 0.22;
    const checkScale = (discR * 0.9) / 50; // check svg geometry spans ~100 units
    const washR = Math.max(W, H) * 0.58;
    return {
      duration: 2.5, size: [W, H],
      layers: [
        // 1. warm cream wash — subtle background glow
        { type: "shape", shape: "circle", at: [cx, cy], radius: washR, fill: wash,
          tracks: { opacity: [[0, 0], [0.5, 0.22, "outCubic"], [2.1, 0.22], [2.5, 0, "inCubic"]] } },

        // 2. ring ripple — 2 warm rings expanding outward
        { type: "ripple", at: [cx, cy], color: ring, strokeWidth: 2, count: 2,
          fromScale: discR / 50 * 0.85, maxScale: discR / 50 * 2.1,
          startAt: 0.55, duration: 1.0, opacity: 0.55 },

        // 3. outer settled ring — appears at large radius, stays
        { type: "ring", at: [cx, cy], radius: discR * 1.55, stroke: ring, strokeWidth: 1.5,
          tracks: {
            opacity: [[0, 0], [0.7, 0], [1.05, 0.7, "outCubic"], [2.1, 0.7], [2.5, 0, "inCubic"]],
            scale: [[0, 0.9], [1.05, 1.0, "outBack"]],
          } },

        // 4. drop-shadow wrapper — softens main disc into the canvas
        { type: "shape", shape: "shadow", at: [cx, cy], color: "#1a1614", intensity: 0.42, spread: 14,
          tracks: {
            opacity: [[0, 0], [0.35, 0], [0.65, 1, "outCubic"]],
            scale: [[0.35, 0.2], [0.7, 1.08, "outBack"], [0.95, 1.0, "inOutCubic"]],
          },
          children: [{ type: "shape", shape: "circle", at: [0, 0], radius: discR,
            tracks: { fill: [[0, discDim], [0.7, disc, "outCubic"]] } }] },

        // 5. the check mark itself — pops in after disc settles
        { type: "shape", shape: "check", at: [cx, cy], scale: [checkScale, checkScale], fill: check,
          tracks: {
            opacity: [[0, 0], [0.7, 0], [0.82, 1, "outCubic"]],
            scale: [[0.7, 0], [0.95, 1.22 * checkScale / checkScale, "outBack"], [1.15, 1.0 * checkScale / checkScale, "inOutCubic"]],
          },
          behaviors: [impact(0.82, 0.9, { scale: 1.12, stretch: 0.06 })] },

        // 6. label — fades up last
        { type: "shape", shape: "text", at: [cx, cy + discR + 40], text: label, fontSize: 22,
          font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
          fill: labelColor,
          tracks: {
            opacity: [[0, 0], [1.15, 0], [1.45, 1, "outCubic"], [2.2, 1], [2.5, 0, "inCubic"]],
            offset: [[1.15, [0, 6]], [1.45, [0, 0], "outCubic"]],
          } },
      ],
    };
  },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.5 ? "wash" : t < 0.7 ? "ripple" : t < 0.95 ? "disc" : t < 1.2 ? "check" : t < 1.45 ? "label" : "hold", params }; },
  sample() { return meta.examples[0]; },
};
