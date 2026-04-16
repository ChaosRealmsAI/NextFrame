import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import fadeOut from "../../behaviors/exit/fadeOut.js";
// TODO: switch the ghost layers to true blur when the SVG renderer supports it
const meta = {
  id: "quoteLarge",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "hero",
  description: "Large italic quote with soft blur-like settle and attribution",
};
export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      S = Math.min(W, H),
      c = { i: "#1a1614", w: "#da7756", m: "#f5ece0", p: "#c4895d" },
      quote = p.quote ?? "Ideas move at the speed of frames.",
      who = p.attribution ?? "NextFrame Manifesto",
      y = H * 0.46,
      dx = S * 0.012;
    void host;
    void t;
    return {
      duration: 3,
      size: [W, H],
      layers: [
        {
          shape: "text",
          at: [W * 0.5 - dx, y - dx],
          text: quote,
          fill: c.w,
          opacity: 0.28,
          font: "Georgia, serif",
          fontSize: S * 0.086,
          style: "italic",
          behaviors: [fadeIn(0, 0.18), fadeOut(0.18, 0.55)],
        },
        {
          shape: "text",
          at: [W * 0.5 + dx, y + dx],
          text: quote,
          fill: c.p,
          opacity: 0.24,
          font: "Georgia, serif",
          fontSize: S * 0.086,
          style: "italic",
          behaviors: [fadeIn(0, 0.18), fadeOut(0.22, 0.5)],
        },
        {
          shape: "text",
          at: [W * 0.5, y],
          text: quote,
          fill: c.i,
          font: "Georgia, serif",
          fontSize: S * 0.086,
          style: "italic",
          weight: 700,
          behaviors: [fadeIn(0.18, 0.65)],
        },
        {
          shape: "capsule",
          at: [W * 0.5, H * 0.64],
          width: Math.min(W * 0.26, S * 0.34),
          height: S * 0.016,
          fill: c.m,
          opacity: 0.95,
          behaviors: [fadeIn(0.72, 0.3)],
        },
        {
          shape: "text",
          at: [W * 0.5, H * 0.71],
          text: who,
          fill: c.p,
          font: "system-ui, sans-serif",
          fontSize: S * 0.03,
          weight: 600,
          letterSpacing: S * 0.0018,
          behaviors: [slideInUp(0.78, 0.55, { distance: S * 0.02 })],
        },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.35 ? "blur" : t < 1 ? "quote" : "attribution",
      visible: true,
      params,
    };
  },
  sample() {
    return {
      quote: "Ideas move at the speed of frames.",
      attribution: "NextFrame Manifesto",
    };
  },
};
