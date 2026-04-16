import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
// TODO: revisit multiline text support once richer text shapes land
const FALLBACK = ["Frame the problem", "Reveal the signal", "Close with the action"];
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? item.text || item.label || `Item ${i + 1}` : String(item || `Item ${i + 1}`));
const meta = { id: "listStagger", ratio: "any", duration_hint: 2, type: "motion", category: "reveal", description: "Bullet list with each line sliding in on a direct stagger", params: [{ name: "items", type: "array", default: FALLBACK }, { name: "stagger", type: "number", default: 0.15 }], examples: [{ items: ["A", "B", "C", "D"], stagger: 0.12 }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host; void t;
    const items = norm(params.items); const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.15; const W = vp.width || 1920; const H = vp.height || 1080;
    const gap = Math.min(96, H * 0.11); const top = H * 0.32 - ((items.length - 1) * gap) / 2; const layers = [];
    items.forEach((item, i) => {
      const start = 0.28 + i * stagger; const y = top + i * gap;
      layers.push({ type: "shape", shape: "dot", at: [W * 0.22, y], radius: 16, fill: "#d97b57", behaviors: [popIn(start, 0.34)] });
      layers.push({ type: "shape", shape: "text", at: [W * 0.43, y + 2], text: item, fontSize: Math.min(34, W * 0.022), font: "Avenir Next, system-ui, sans-serif", fill: "#251913", behaviors: [slideInUp(start + 0.05, 0.46, { distance: 28 })] });
    });
    return { duration: Math.max(meta.duration_hint, +(0.95 + items.length * stagger + 0.6).toFixed(2)), size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    return { sceneId: meta.id, t, itemCount: items.length, stagger: Number.isFinite(params.stagger) ? params.stagger : 0.15, vp };
  },
  sample() {
    return { items: FALLBACK, stagger: 0.15 };
  },
};
