import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import nodeReveal from "../../behaviors/data/nodeReveal.js";
// TODO: tune featureRow spacing against future gallery previews
const FALLBACK = [{ icon: "bolt", title: "Fast setup", description: "Start from a clean, guided flow." }, { icon: "sparkle", title: "Clear motion", description: "Reveal the main point in sequence." }, { icon: "leaf", title: "Low noise", description: "Keep the frame calm while details land." }];
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? { icon: item.icon || FALLBACK[i % FALLBACK.length].icon, title: item.title || `Feature ${i + 1}`, description: item.description || "Short supporting line" } : { icon: FALLBACK[i % FALLBACK.length].icon, title: String(item || `Feature ${i + 1}`), description: "Short supporting line" });
const meta = { id: "featureRow", ratio: "any", duration_hint: 2.8, type: "motion", category: "reveal", description: "Feature row with icon, title, and description revealed in a stagger", params: [{ name: "items", type: "array", default: FALLBACK }, { name: "stagger", type: "number", default: 0.18 }], examples: [{ items: FALLBACK, stagger: 0.16 }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host; void t;
    const items = norm(params.items); const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.18; const W = vp.width || 1920; const H = vp.height || 1080;
    const span = W / (items.length + 1); const cardW = Math.min(W * 0.23, span * 0.76); const cardH = Math.min(H * 0.34, 320); const layers = [];
    items.forEach((item, i) => {
      const start = 0.2 + i * stagger; const x = span * (i + 1); const y = H * 0.5;
      layers.push({ id: `feature-card-${i}`, type: "shape", shape: "rect", at: [x, y], width: cardW, height: cardH, radius: 26, fill: "#fff7ef", stroke: "#dfbda7", strokeWidth: 3, behaviors: [slideInUp(start, 0.55, { distance: 56 }), nodeReveal(start, 0.55, { data: items.slice(0, i + 1) })] });
      layers.push({ type: "shape", shape: "dot", at: [x, y - cardH * 0.22], radius: 28, fill: "#f5c7a0", behaviors: [popIn(start + 0.05, 0.4)] });
      layers.push({ type: "shape", shape: item.icon, at: [x, y - cardH * 0.22], scale: 0.34, fill: "#8e4626", behaviors: [popIn(start + 0.08, 0.36)] });
      layers.push({ type: "shape", shape: "text", at: [x, y + 12], text: item.title, fontSize: Math.min(34, cardW * 0.13), font: "Avenir Next, system-ui, sans-serif", fill: "#2d1c14", behaviors: [slideInUp(start + 0.12, 0.5, { distance: 30 })] });
      layers.push({ type: "shape", shape: "text", at: [x, y + 60], text: item.description, fontSize: Math.min(20, cardW * 0.08), font: "Avenir Next, system-ui, sans-serif", fill: "#785a4a", behaviors: [slideInUp(start + 0.18, 0.48, { distance: 24 })] });
    });
    return { duration: Math.max(meta.duration_hint, +(1.25 + items.length * stagger + 0.9).toFixed(2)), size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    return { sceneId: meta.id, t, itemCount: items.length, stagger: Number.isFinite(params.stagger) ? params.stagger : 0.18, vp };
  },
  sample() {
    return { items: FALLBACK, stagger: 0.18 };
  },
};
