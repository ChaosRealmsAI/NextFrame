import fadeIn from "../../behaviors/entrance/fadeIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import springIn from "../../behaviors/entrance/springIn.js";
import float from "../../behaviors/continuous/float.js";
// TODO: refine typographic treatments once the broader hero system lands
const meta = { id: "brandReveal", ratio: "any", duration_hint: 2.8, type: "motion", category: "hero", description: "Logo mark with dramatic brand lockup and subtitle" };
export default { ...meta,
  render(host, t, p = {}, vp = { width: 0, height: 0 }) { const W = vp.width || 0, H = vp.height || 0, S = Math.min(W, H), c = { i: "#1a1614", w: "#da7756", m: "#f5ece0", p: "#c4895d" }, mark = p.mark ?? "NF", brand = p.brand ?? "NextFrame", sub = p.subtitle ?? "AI-native video engine"; void host; void t; return { duration: 2.8, size: [W, H], layers: [
    { shape: "ring", at: [W * 0.5, H * 0.33], radius: S * 0.1, stroke: c.p, strokeWidth: S * 0.012, behaviors: [fadeIn(0, 0.3), float(0.3, 4, { y: S * 0.012, tilt: 1.2 })] },
    { shape: "text", at: [W * 0.5, H * 0.33], text: mark, fill: c.w, font: "Georgia, serif", fontSize: S * 0.085, weight: 700, behaviors: [springIn(0, 0.75, { fromScale: 0.45, overshoot: 1.15 })] },
    { shape: "text", at: [W * 0.5, H * 0.49], text: brand, fill: c.i, font: "Georgia, serif", fontSize: S * 0.13, weight: 700, letterSpacing: S * 0.0035, behaviors: [springIn(0.18, 0.85, { fromScale: 0.82, overshoot: 1.06 })] },
    { shape: "capsule", at: [W * 0.5, H * 0.62], width: Math.min(W * 0.48, S * 0.62), height: S * 0.07, fill: c.m, opacity: 0.95, behaviors: [fadeIn(0.45, 0.45)] },
    { shape: "text", at: [W * 0.5, H * 0.62], text: sub, fill: c.p, font: "system-ui, sans-serif", fontSize: S * 0.03, weight: 600, letterSpacing: S * 0.0018, behaviors: [slideInUp(0.52, 0.6, { distance: S * 0.03 })] },
  ] }; },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 0.4 ? "mark" : t < 1.15 ? "lockup" : "settled", visible: true, params }; },
  sample() { return { mark: "NF", brand: "NextFrame", subtitle: "AI-native video engine" }; } };
