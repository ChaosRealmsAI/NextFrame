import rotate from "../../behaviors/continuous/rotate.js";
import drift from "../../behaviors/continuous/drift.js";
import breathe from "../../behaviors/continuous/breathe.js";
import orbit from "../../behaviors/continuous/orbit.js";

// TODO: promote the orbit-dot color cycle into a palette util if more scenes adopt it
const meta = {
  id: "showcaseD_abstractMotion",
  ratio: "any",
  duration_hint: 10,
  type: "motion",
  category: "hero",
  description: "Abstract gallery motion: 12-layer ADD/MULTIPLY composition — drifting gradient blob, breathing rotating rings, pulsing glow disc, staggered orbit dots color-cycling through warm→pink→gold, slow ribbon arcs. Loop-safe at 10s.",
  params: [
    { name: "label", type: "string", default: "nf-anim · v1.0" },
  ],
  examples: [{ label: "nf-anim · v1.0" }],
};

// Anthropic warm palette
const INK = "#1a1614", WARM = "#da7756", DEEP = "#b8593e", CREAM = "#f5ece0",
      SOFT = "#fffbeb", PINK = "#ff5577", GOLD = "#ffd166", MUTED = "#7a6a5e";
const DUR = 10;

// Deterministic orbit phase offsets (no Math.random — seeded by dot index)
const ORBIT_PHASE = [0.00, 0.17, 0.33, 0.50, 0.66, 0.83];
// Color cycle through palette, loop-safe (start == end)
const COLOR_CYCLE = (phase) => [
  [phase * DUR,               WARM, "inOutCubic"],
  [((phase + 0.25) % 1) * DUR, PINK, "inOutCubic"],
  [((phase + 0.5)  % 1) * DUR, GOLD, "inOutCubic"],
  [((phase + 0.75) % 1) * DUR, DEEP, "inOutCubic"],
  [DUR,                        WARM, "inOutCubic"],
].sort((a, b) => a[0] - b[0]);

// Static ribbon arc path (half-circle stroke, radius 1 — scaled per instance)
const ARC_D = "M -1 0 A 1 1 0 0 1 1 0";

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 480, height: 300 }) {
    const W = vp.width || 480, H = vp.height || 300, S = Math.min(W, H);
    const cx = W * 0.5, cy = H * 0.5;
    const label = p.label ?? "nf-anim · v1.0";
    const discR = S * 0.09;
    void host; void t;

    return {
      duration: DUR, size: [W, H],
      layers: [
        // 0) background gradient blob — radial warm→cream, drifts continuously top-left
        { shape: "circle", at: [W * 0.32, H * 0.30], radius: S * 0.85,
          fill: { type: "radial", cx: 0.5, cy: 0.5, r: 0.6,
                  stops: [{ offset: 0, color: "#ffe8d5" }, { offset: 0.5, color: CREAM }, { offset: 1, color: SOFT }] },
          opacity: 1.0,
          behaviors: [drift(0, DUR, { x: S * 0.06, y: S * 0.045 })] },

        // 1) soft warm halo wash behind center — continuous breathe (reads as painterly)
        { shape: "circle", at: [cx, cy], radius: S * 0.45, fill: WARM, opacity: 0.14,
          wrap: { glow: { color: WARM, intensity: 0.35, spread: 12 } },
          behaviors: [breathe(0, DUR, { scale: 0.10, opacity: 0.30 })] },

        // 2-4) three concentric rings — each: rotate + breathe + drift ADD-composed (MERGE_POLICY)
        { shape: "ring", at: [cx, cy], radius: S * 0.36, stroke: WARM, strokeWidth: S * 0.0035, opacity: 0.55,
          behaviors: [
            rotate(0, DUR, { angle: 360 }),
            breathe(0, DUR, { scale: 0.06, opacity: 0.18 }),
            drift(0, DUR, { x: S * 0.012, y: S * 0.010 }),
          ] },
        { shape: "ring", at: [cx, cy], radius: S * 0.26, stroke: DEEP, strokeWidth: S * 0.005, opacity: 0.65,
          behaviors: [
            rotate(0, DUR, { angle: -360 }),
            breathe(0, DUR, { scale: 0.09, opacity: 0.20 }),
            drift(0, DUR, { x: S * 0.018, y: S * 0.014 }),
          ] },
        { shape: "ring", at: [cx, cy], radius: S * 0.18, stroke: PINK, strokeWidth: S * 0.004, opacity: 0.55,
          behaviors: [
            rotate(0, DUR, { angle: 540 }),
            breathe(0, DUR, { scale: 0.12, opacity: 0.22 }),
          ] },

        // 5) central solid disc — continuous pulse + glow intensity track (color-interp)
        { shape: "circle", at: [cx, cy], radius: discR,
          fill: { type: "radial", cx: 0.4, cy: 0.4, r: 0.75,
                  stops: [{ offset: 0, color: WARM }, { offset: 1, color: DEEP }] },
          wrap: { glow: { color: WARM, intensity: 0.65, spread: 14 } },
          tracks: {
            // intensity-pulse via scale track (add-composes with breathe below)
            scale:   [[0, 1], [DUR * 0.25, 1.08, "inOutCubic"], [DUR * 0.5, 1], [DUR * 0.75, 1.05, "inOutCubic"], [DUR, 1, "linear"]],
          },
          behaviors: [breathe(0, DUR, { scale: 0.04, opacity: 0.10 })] },

        // 6) inner accent dot at center — slow rotate handle
        { shape: "dot", at: [cx, cy], radius: S * 0.012, fill: SOFT, opacity: 0.85,
          behaviors: [breathe(0, DUR, { scale: 0.25, opacity: 0.30 })] },

        // 7-12) six satellite orbit dots — staggered phase, spread 3 orbital radii, color-cycle
        //        orbit radii chosen so dots sit OUTSIDE disc+glow and BETWEEN rings
        ...ORBIT_PHASE.map((phase, i) => {
          const radius = S * (0.20 + (i % 3) * 0.065);   // ~0.20, 0.265, 0.33
          const dotR   = S * (0.013 + (i % 2) * 0.006);
          const shift  = phase * DUR;
          return {
            shape: "dot", at: [cx, cy], radius: dotR, fill: WARM, opacity: 0.95,
            wrap: { glow: { color: GOLD, intensity: 0.6, spread: 8 } },
            tracks: { fill: COLOR_CYCLE(phase) },
            behaviors: [orbit(-shift, DUR, { radius })],
          };
        }),

        // 13-14) two ribbon arcs — half-circle paths, counter-rotating at gallery radii
        { shape: "path", at: [cx, cy], path: ARC_D, scale: [S * 0.46, S * 0.46],
          fill: "none", stroke: GOLD, strokeWidth: 2.5, opacity: 0.7,
          wrap: { glow: { color: GOLD, intensity: 0.35, spread: 6 } },
          behaviors: [rotate(0, DUR, { angle: 360 })] },
        { shape: "path", at: [cx, cy], path: ARC_D, scale: [S * 0.40, S * 0.40], rotate: 35,
          fill: "none", stroke: PINK, strokeWidth: 2, opacity: 0.65,
          wrap: { glow: { color: PINK, intensity: 0.30, spread: 5 } },
          behaviors: [rotate(0, DUR, { angle: -360 })] },

        // 15) corner label — static, quiet
        { shape: "text", at: [W - S * 0.04, H - S * 0.035], text: label,
          fill: MUTED, font: "system-ui, sans-serif", fontSize: S * 0.028, weight: 500, letterSpacing: S * 0.002,
          anchor: "end", opacity: 0.75 },
      ],
    };
  },
  describe(t, params = {}) {
    const phase = t < DUR * 0.25 ? "rise" : t < DUR * 0.5 ? "expand" : t < DUR * 0.75 ? "settle" : "return";
    return { sceneId: meta.id, phase, visible: true, loop: true, params };
  },
  sample() { return meta.examples[0]; },
};
