import popIn from "../../behaviors/entrance/popIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import countUp from "../../behaviors/data/countUp.js";
import pulse from "../../behaviors/emphasis/pulse.js";
// TODO: add richer formatting once the numeric text primitive supports locale presets
const meta = { id: "statHero", ratio: "any", duration_hint: 3, type: "motion", category: "hero", description: "Massive count-up stat with label and trend arrow" };
export default { ...meta,
  render(host, t, p = {}, vp = { width: 0, height: 0 }) { const W = vp.width || 0, H = vp.height || 0, S = Math.min(W, H), c = { i: "#1a1614", w: "#da7756", m: "#f5ece0", p: "#c4895d" }, v = Number(p.value ?? 47), unit = p.unit ?? "%", label = p.label ?? "用户增长", trend = p.trend ?? "up", rot = trend === "down" ? 90 : trend === "flat" ? 0 : -90, fill = trend === "flat" ? c.p : c.w; void host; void t; return { duration: 3, size: [W, H], layers: [
    { shape: "circle", at: [W * 0.5, H * 0.48], radius: S * 0.24, fill: c.m, opacity: 0.28, behaviors: [popIn(0, 0.55, { fromScale: 0.3, peakScale: 1.06 })] },
    { shape: "arrow", at: [W * 0.5 - S * 0.17, H * 0.36], rotate: rot, fill, scale: S / 1200, behaviors: [popIn(0.68, 0.5, { fromScale: 0.2, peakScale: 1.18 }), pulse(1.35, 1.1, { scale: 1.07, floorOpacity: 0.96 })] },
    { shape: "text", at: [W * 0.5, H * 0.49], prefix: "", suffix: unit, decimals: Number.isInteger(v) ? 0 : 1, fill: c.i, font: "Georgia, serif", fontSize: S * 0.24, weight: 700, behaviors: [countUp(0, 1.25, { from: 0, value: v }), popIn(0, 0.6, { fromScale: 0.72, peakScale: 1.04 })] },
    { shape: "capsule", at: [W * 0.5, H * 0.62], width: Math.min(W * 0.34, S * 0.48), height: S * 0.06, fill: c.m, opacity: 0.9, behaviors: [slideInUp(1.05, 0.5, { distance: S * 0.025 })] },
    { shape: "text", at: [W * 0.5, H * 0.62], text: label, fill: c.p, font: "system-ui, sans-serif", fontSize: S * 0.03, weight: 600, behaviors: [slideInUp(1.1, 0.55, { distance: S * 0.028 })] },
  ] }; },
  describe(t, params = {}) { return { sceneId: meta.id, phase: t < 1.2 ? "counting" : t < 2 ? "label" : "settle", visible: true, params }; },
  sample() { return { value: 1247, unit: "", label: "新增用户", trend: "up" }; } };
