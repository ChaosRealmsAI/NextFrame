const meta = {
  id: "loadingPulse",
  ratio: "any",
  duration_hint: 2.4,
  type: "motion",
  category: "feedback",
  description: "Three centered dots with stagger pulse + optional label (artisan rev)",
  params: [
    { name: "dotColor", type: "color", default: "#da7756" },
    { name: "label", type: "string", default: "正在加载" },
  ],
  examples: [{ dotColor: "#da7756", label: "正在加载" }],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const cx = W / 2;
    const cy = H * 0.46;
    const dotColor = params.dotColor ?? "#da7756";
    const label = params.label ?? "正在加载";
    const dotR = S * 0.038;
    const gap = S * 0.10;
    const dur = 2.4;

    // pulse track: dot starts faded, swells to full, fades back. Phase per dot 0/0.16/0.32s.
    const pulse = (phase) => ({
      opacity: [
        [0, 0.30],
        [phase, 0.30],
        [phase + 0.20, 1.0, "outBack"],
        [phase + 0.48, 0.30, "inOut"],
        [dur, 0.30, "linear"],
      ],
      scale: [
        [0, [0.7, 0.7]],
        [phase, [0.7, 0.7]],
        [phase + 0.20, [1.25, 1.25], "outBack"],
        [phase + 0.48, [0.7, 0.7], "inOut"],
        [dur, [0.7, 0.7], "linear"],
      ],
    });

    const dots = [-1, 0, 1].map((i) => ({
      shape: "circle",
      at: [cx + i * gap, cy],
      radius: dotR,
      fill: dotColor,
      tracks: pulse(i === -1 ? 0 : i === 0 ? 0.16 : 0.32),
    }));

    return {
      duration: dur,
      size: [W, H],
      layers: [
        // ── soft cream wash
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: "#fffbeb",
          tracks: { opacity: [[0, 0], [0.3, 1, "out"]] } },

        // ── ultra-soft pink halo behind dots (gentle pulse)
        { shape: "circle", at: [cx, cy], radius: S * 0.18, fill: "#ffd1b8",
          tracks: {
            opacity: [[0, 0], [0.4, 0.20, "out"], [dur * 0.5, 0.32, "inOut"], [dur, 0.20, "inOut"]],
            scale: [[0, [0.95, 0.95]], [dur * 0.5, [1.06, 1.06], "inOut"], [dur, [0.95, 0.95], "inOut"]],
          } },

        // ── the 3 pulsing dots
        ...dots,

        // ── label below
        { shape: "text", at: [cx, H * 0.78], text: label,
          fill: "#7a6a5e", font: "system-ui, sans-serif", fontSize: S * 0.040, weight: 500,
          letterSpacing: S * 0.005,
          tracks: { opacity: [[0, 0], [0.6, 0.85, "out"], [dur * 0.5, 1, "inOut"], [dur, 0.85, "inOut"]] } },
      ],
    };
  },
  describe(t, params = {}) {
    return { sceneId: meta.id, phase: "loop", params };
  },
  sample() { return meta.examples[0]; },
};
