import popIn from "../../behaviors/entrance/popIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import nodeReveal from "../../behaviors/data/nodeReveal.js";
// TODO: expand this toward image-backed tiles once media shapes exist here
const FALLBACK = [{ fill: "#d97b57", label: "Warm" }, { fill: "#f1b787", label: "Signal" }, { fill: "#f7dfc7", label: "Soft" }, { fill: "#86b3a2", label: "Calm" }, { fill: "#5d7e8e", label: "Depth" }, { fill: "#2c4251", label: "Anchor" }];
const COLORS = FALLBACK.map((item) => item.fill);
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? { fill: item.fill || item.color || COLORS[i % COLORS.length], label: item.label || item.title || "" } : /^#|rgb|hsl/.test(String(item || "")) ? { fill: String(item), label: "" } : { fill: COLORS[i % COLORS.length], label: String(item || "") });
const meta = { id: "gridReveal", ratio: "any", duration_hint: 2.6, type: "motion", category: "reveal", description: "Color tile grid that reveals cell by cell with direct stagger timing", params: [{ name: "items", type: "array", default: FALLBACK }, { name: "cols", type: "number", default: 3 }, { name: "stagger", type: "number", default: 0.1 }], examples: [{ items: FALLBACK, cols: 3, stagger: 0.08 }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host; void t;
    const items = norm(params.items); const cols = Math.max(1, Math.min(items.length, Math.round(params.cols || 3))); const rows = Math.ceil(items.length / cols);
    const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.1; const W = vp.width || 1920; const H = vp.height || 1080;
    const cellW = W * 0.66 / cols; const cellH = H * 0.54 / rows; const tileW = cellW * 0.9; const tileH = cellH * 0.9; const x0 = W * 0.5 - ((cols - 1) * cellW) / 2; const y0 = H * 0.5 - ((rows - 1) * cellH) / 2; const layers = [];
    items.forEach((item, i) => {
      const col = i % cols; const row = Math.floor(i / cols); const x = x0 + col * cellW; const y = y0 + row * cellH; const start = 0.18 + i * stagger;
      layers.push({ id: `reveal-tile-${i}`, type: "shape", shape: "rect", at: [x, y], width: tileW, height: tileH, radius: 18, fill: item.fill, stroke: "#f6eee7", strokeWidth: 4, behaviors: [popIn(start, 0.34), nodeReveal(start, 0.34, { data: items.slice(0, i + 1) })] });
      if (!item.label) return;
      layers.push({ type: "shape", shape: "text", at: [x, y + tileH * 0.24], text: item.label, fontSize: Math.min(24, tileW * 0.11), font: "Avenir Next, system-ui, sans-serif", fill: "#fff7f2", behaviors: [slideInUp(start + 0.08, 0.3, { distance: 18 })] });
    });
    return { duration: Math.max(meta.duration_hint, +(0.95 + items.length * stagger + 0.65).toFixed(2)), size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items); const cols = Math.max(1, Math.min(items.length, Math.round(params.cols || 3)));
    return { sceneId: meta.id, t, itemCount: items.length, cols, rows: Math.ceil(items.length / cols), vp };
  },
  sample() {
    return { items: FALLBACK, cols: 3, stagger: 0.1 };
  },
};
