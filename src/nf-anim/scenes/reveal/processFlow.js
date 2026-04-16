import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import drawIn from "../../behaviors/entrance/drawIn.js";
import nodeReveal from "../../behaviors/data/nodeReveal.js";
// TODO: refine long-label handling once text layout primitives improve
const FALLBACK = [{ title: "Collect", detail: "Gather the core inputs" }, { title: "Shape", detail: "Turn them into a clear story" }, { title: "Deliver", detail: "Land the output in one pass" }];
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? { title: item.title || `Step ${i + 1}`, detail: item.detail || "Supporting note" } : { title: String(item || `Step ${i + 1}`), detail: "Supporting note" });
const meta = { id: "processFlow", ratio: "any", duration_hint: 3, type: "motion", category: "reveal", description: "Step boxes connected by arrows that draw on between stages", params: [{ name: "items", type: "array", default: FALLBACK }, { name: "stagger", type: "number", default: 0.22 }], examples: [{ items: FALLBACK, stagger: 0.2 }] };
export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 0, height: 0 }) {
    void host; void t;
    const items = norm(params.items); const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.22; const W = vp.width || 1920; const H = vp.height || 1080;
    const span = W / (items.length + 1); const boxW = Math.min(260, span * 0.66); const boxH = Math.min(190, H * 0.22); const y = H * 0.5; const layers = [];
    items.forEach((item, i) => {
      const start = 0.22 + i * stagger; const x = span * (i + 1);
      layers.push({ id: `process-box-${i}`, type: "shape", shape: "rect", at: [x, y], width: boxW, height: boxH, radius: 24, fill: i % 2 ? "#fff8ef" : "#f7eadf", stroke: "#d6b29a", strokeWidth: 3, behaviors: [popIn(start, 0.46), nodeReveal(start, 0.46, { data: items.slice(0, i + 1) })] });
      layers.push({ type: "shape", shape: "text", at: [x, y - boxH * 0.2], text: `Step ${i + 1}`, fontSize: 18, font: "Avenir Next, system-ui, sans-serif", fill: "#9a5a38", behaviors: [slideInUp(start + 0.05, 0.42, { distance: 24 })] });
      layers.push({ type: "shape", shape: "text", at: [x, y + 4], text: item.title, fontSize: Math.min(30, boxW * 0.16), font: "Avenir Next, system-ui, sans-serif", fill: "#2b1b13", behaviors: [slideInUp(start + 0.1, 0.44, { distance: 26 })] });
      layers.push({ type: "shape", shape: "text", at: [x, y + boxH * 0.22], text: item.detail, fontSize: 18, font: "Avenir Next, system-ui, sans-serif", fill: "#72594b", behaviors: [slideInUp(start + 0.16, 0.44, { distance: 22 })] });
      if (i === items.length - 1) return;
      const nextX = span * (i + 2); const left = x + boxW * 0.56; const right = nextX - boxW * 0.56; const mid = (left + right) / 2; const reveal = start + 0.2;
      layers.push({ type: "shape", shape: "line", at: [mid, y], points: [[-(right - left) / 2, 0], [(right - left) / 2, 0]], stroke: "#be7a57", strokeWidth: 10, behaviors: [drawIn(reveal, 0.42)] });
      layers.push({ type: "shape", shape: "arrow", at: [right - 18, y], scale: 0.28, fill: "#be7a57", behaviors: [popIn(reveal + 0.28, 0.26)] });
    });
    return { duration: Math.max(meta.duration_hint, +(1.3 + items.length * stagger + 1).toFixed(2)), size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    return { sceneId: meta.id, t, stepCount: items.length, stagger: Number.isFinite(params.stagger) ? params.stagger : 0.22, vp };
  },
  sample() {
    return { items: FALLBACK, stagger: 0.22 };
  },
};
