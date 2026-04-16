import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import drawIn from "../../behaviors/entrance/drawIn.js";
import nodeReveal from "../../behaviors/data/nodeReveal.js";
// TODO: revisit portrait spacing when more timeline scenes exist
const FALLBACK = [{ label: "Kickoff", detail: "Define the outcome" }, { label: "Build", detail: "Layer the main beats" }, { label: "Refine", detail: "Tighten pacing and polish" }, { label: "Launch", detail: "Ship the final cut" }];
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? { label: item.label || item.title || `Point ${i + 1}`, detail: item.detail || "Supporting note" } : { label: String(item || `Point ${i + 1}`), detail: "Supporting note" });
const meta = { id: "timelineFlow", ratio: "any", duration_hint: 3, type: "motion", category: "reveal", description: "Vertical timeline with dots, line segments, and labels appearing in sequence", params: [{ name: "items", type: "array", default: FALLBACK }, { name: "stagger", type: "number", default: 0.18 }], examples: [{ items: FALLBACK, stagger: 0.16 }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host; void t;
    const items = norm(params.items); const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.18; const W = vp.width || 1920; const H = vp.height || 1080;
    const x = W * 0.28; const left = W * 0.58; const top = H * 0.24; const step = items.length > 1 ? H * 0.5 / (items.length - 1) : 0; const layers = [];
    items.forEach((item, i) => {
      const y = top + i * step; const start = 0.22 + i * stagger;
      if (i) {
        const prevY = top + (i - 1) * step;
        layers.push({ type: "shape", shape: "line", at: [x, (prevY + y) / 2], points: [[0, -(y - prevY) / 2], [0, (y - prevY) / 2]], stroke: "#c88d68", strokeWidth: 8, behaviors: [drawIn(start - 0.08, 0.34)] });
      }
      layers.push({ type: "shape", shape: "dot", at: [x, y], radius: 18, fill: "#d97c58", behaviors: [popIn(start, 0.34), nodeReveal(start, 0.34, { data: items.slice(0, i + 1) })] });
      layers.push({ type: "shape", shape: "rect", at: [left, y], width: W * 0.32, height: 92, radius: 20, fill: "#fff8f1", stroke: "#dfbea9", strokeWidth: 3, behaviors: [slideInUp(start + 0.05, 0.42, { distance: 34 })] });
      layers.push({ type: "shape", shape: "text", at: [left, y - 16], text: item.label, fontSize: 28, font: "Avenir Next, system-ui, sans-serif", fill: "#2b1a13", behaviors: [slideInUp(start + 0.1, 0.38, { distance: 20 })] });
      layers.push({ type: "shape", shape: "text", at: [left, y + 16], text: item.detail, fontSize: 18, font: "Avenir Next, system-ui, sans-serif", fill: "#745a4d", behaviors: [slideInUp(start + 0.14, 0.36, { distance: 16 })] });
    });
    return { duration: Math.max(meta.duration_hint, +(1.15 + items.length * stagger + 0.85).toFixed(2)), size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    return { sceneId: meta.id, t, itemCount: items.length, stagger: Number.isFinite(params.stagger) ? params.stagger : 0.18, vp };
  },
  sample() {
    return { items: FALLBACK, stagger: 0.18 };
  },
};
