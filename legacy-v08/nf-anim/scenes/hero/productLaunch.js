import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInRight from "../../behaviors/entrance/slideInRight.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import springIn from "../../behaviors/entrance/springIn.js";
import float from "../../behaviors/continuous/float.js";
// TODO: revisit badge sizing if product names regularly exceed one line
const meta = {
  id: "productLaunch",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "hero",
  description: "Big product name, version badge, and launch tagline",
};
export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 0, height: 0 }) {
    const W = vp.width || 0,
      H = vp.height || 0,
      S = Math.min(W, H),
      c = { i: "#1a1614", w: "#da7756", m: "#f5ece0", p: "#c4895d" },
      product = p.product ?? "Aurora",
      version = p.version ?? "v1.0",
      tag = p.tagline ?? "Ship cinematic AI video from code",
      bx = Math.min(W * 0.73, W * 0.5 + S * 0.19);
    void host;
    void t;
    return {
      duration: 3,
      size: [W, H],
      layers: [
        {
          shape: "square",
          at: [W * 0.5, H * 0.44],
          size: S * 0.34,
          rotate: 45,
          fill: c.m,
          opacity: 0.24,
          behaviors: [
            fadeIn(0, 0.3),
            float(0.35, 5, { y: S * 0.014, tilt: 1.1 }),
          ],
        },
        {
          shape: "text",
          at: [W * 0.5, H * 0.45],
          text: product,
          fill: c.i,
          font: "Georgia, serif",
          fontSize: S * 0.14,
          weight: 700,
          behaviors: [
            springIn(0.05, 0.85, { fromScale: 0.78, overshoot: 1.08 }),
          ],
        },
        {
          shape: "capsule",
          at: [bx, H * 0.33],
          width: Math.min(W * 0.22, S * 0.28),
          height: S * 0.07,
          fill: c.w,
          behaviors: [slideInRight(0.28, 0.58, { distance: S * 0.12 })],
        },
        {
          shape: "text",
          at: [bx, H * 0.33],
          text: version,
          fill: c.m,
          font: "system-ui, sans-serif",
          fontSize: S * 0.03,
          weight: 700,
          letterSpacing: S * 0.0015,
          behaviors: [slideInRight(0.32, 0.55, { distance: S * 0.1 })],
        },
        {
          shape: "text",
          at: [W * 0.5, H * 0.61],
          text: tag,
          fill: c.p,
          font: "system-ui, sans-serif",
          fontSize: S * 0.033,
          weight: 600,
          behaviors: [slideInUp(0.55, 0.6, { distance: S * 0.03 })],
        },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.35 ? "product" : t < 1 ? "badge" : "tagline",
      visible: true,
      params,
    };
  },
  sample() {
    return {
      product: "Aurora",
      version: "v1.0",
      tagline: "Ship cinematic AI video from code",
    };
  },
};
