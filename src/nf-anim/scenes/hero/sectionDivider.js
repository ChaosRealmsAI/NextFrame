import fadeIn from "../../behaviors/entrance/fadeIn.js";
import popIn from "../../behaviors/entrance/popIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
// TODO: replace scale-based line growth with stroke reveal if a line primitive lands
const meta = {
  id: "sectionDivider",
  ratio: "any",
  duration_hint: 2.2,
  type: "motion",
  category: "hero",
  description: "Animated divider with center label and drawn separator lines",
};
export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      S = Math.min(W, H),
      c = { i: "#1a1614", w: "#da7756", m: "#f5ece0", p: "#c4895d" },
      label = p.label ?? "Chapter One",
      gap = Math.min(W * 0.26, S * 0.34),
      lw = Math.max(40, (Math.min(W * 0.72, S * 0.95) - gap) / 2),
      y = H * 0.52,
      line = {
        shape: "capsule",
        width: lw,
        height: S * 0.014,
        fill: c.p,
        tracks: {
          scaleX: [
            [0, 0.03],
            [0.65, 1, "out"],
          ],
          opacity: [
            [0, 0.15],
            [0.16, 1, "out"],
          ],
        },
      };
    void host;
    void t;
    return {
      duration: 2.2,
      size: [W, H],
      layers: [
        { ...line, at: [W * 0.5 - (gap + lw) / 2, y] },
        { ...line, at: [W * 0.5 + (gap + lw) / 2, y] },
        {
          shape: "dot",
          at: [W * 0.5, y],
          radius: S * 0.012,
          fill: c.w,
          behaviors: [popIn(0.48, 0.45, { fromScale: 0.2, peakScale: 1.2 })],
        },
        {
          shape: "text",
          at: [W * 0.5, H * 0.44],
          text: label,
          fill: c.i,
          font: "Georgia, serif",
          fontSize: S * 0.055,
          weight: 700,
          letterSpacing: S * 0.0022,
          behaviors: [
            fadeIn(0.62, 0.35),
            slideInUp(0.62, 0.45, { distance: S * 0.02 }),
          ],
        },
        {
          shape: "text",
          at: [W * 0.5, H * 0.6],
          text: p.kicker ?? "transition",
          fill: c.p,
          font: "system-ui, sans-serif",
          fontSize: S * 0.024,
          weight: 600,
          letterSpacing: S * 0.003,
          behaviors: [fadeIn(0.8, 0.35)],
        },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.55 ? "draw" : t < 1 ? "label" : "settle",
      visible: true,
      params,
    };
  },
  sample() {
    return { label: "Chapter One", kicker: "transition" };
  },
};
