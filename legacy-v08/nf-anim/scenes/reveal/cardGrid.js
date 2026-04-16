import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import nodeReveal from "../../behaviors/data/nodeReveal.js";
// TODO: adjust grid density if portrait presets need separate tuning
const FALLBACK = [
  { title: "Research", detail: "Inputs aligned" },
  { title: "Script", detail: "Narrative locked" },
  { title: "Design", detail: "Visual system ready" },
  { title: "Edit", detail: "Cuts refined" },
  { title: "Review", detail: "Notes resolved" },
  { title: "Ship", detail: "Export approved" },
];
const norm = (items) =>
  (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) =>
    typeof item === "object" && item
      ? {
          title: item.title || `Card ${i + 1}`,
          detail: item.detail || "Summary",
        }
      : { title: String(item || `Card ${i + 1}`), detail: "Summary" },
  );
const meta = {
  id: "cardGrid",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "reveal",
  description: "Grid of cards that pop in one after another",
  params: [
    { name: "items", type: "array", default: FALLBACK },
    { name: "cols", type: "number", default: 3 },
    { name: "stagger", type: "number", default: 0.14 },
  ],
  examples: [{ items: FALLBACK, cols: 3, stagger: 0.12 }],
};
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host;
    void t;
    const items = norm(params.items);
    const cols = Math.max(
      1,
      Math.min(items.length, Math.round(params.cols || 3)),
    );
    const rows = Math.ceil(items.length / cols);
    const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.14;
    const W = vp.width || 1920;
    const H = vp.height || 1080;
    const cellW = (W * 0.72) / cols;
    const cellH = (H * 0.56) / rows;
    const cardW = Math.min(280, cellW * 0.82);
    const cardH = Math.min(220, cellH * 0.78);
    const x0 = W * 0.5 - ((cols - 1) * cellW) / 2;
    const y0 = H * 0.5 - ((rows - 1) * cellH) / 2;
    const layers = [];
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * cellW;
      const y = y0 + row * cellH;
      const start = 0.2 + i * stagger;
      layers.push({
        id: `grid-card-${i}`,
        type: "shape",
        shape: "rect",
        at: [x, y],
        width: cardW,
        height: cardH,
        radius: 24,
        fill: "#fff8f1",
        stroke: "#d8b7a2",
        strokeWidth: 3,
        behaviors: [
          popIn(start, 0.42),
          nodeReveal(start, 0.42, { data: items.slice(0, i + 1) }),
        ],
      });
      layers.push({
        type: "shape",
        shape: "rect",
        at: [x, y - cardH * 0.28],
        width: cardW * 0.64,
        height: 12,
        radius: 6,
        fill: "#e2a983",
        behaviors: [slideInUp(start + 0.06, 0.34, { distance: 16 })],
      });
      layers.push({
        type: "shape",
        shape: "text",
        at: [x, y + 4],
        text: item.title,
        fontSize: Math.min(28, cardW * 0.13),
        font: "Avenir Next, system-ui, sans-serif",
        fill: "#2f1d15",
        behaviors: [slideInUp(start + 0.08, 0.4, { distance: 24 })],
      });
      layers.push({
        type: "shape",
        shape: "text",
        at: [x, y + cardH * 0.22],
        text: item.detail,
        fontSize: 18,
        font: "Avenir Next, system-ui, sans-serif",
        fill: "#72594d",
        behaviors: [slideInUp(start + 0.14, 0.38, { distance: 20 })],
      });
    });
    return {
      duration: Math.max(
        meta.duration_hint,
        +(1.05 + items.length * stagger + 0.75).toFixed(2),
      ),
      size: [W, H],
      layers,
    };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    const cols = Math.max(
      1,
      Math.min(items.length, Math.round(params.cols || 3)),
    );
    return {
      sceneId: meta.id,
      t,
      itemCount: items.length,
      cols,
      rows: Math.ceil(items.length / cols),
      vp,
    };
  },
  sample() {
    return { items: FALLBACK, cols: 3, stagger: 0.14 };
  },
};
