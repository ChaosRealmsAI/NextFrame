import { clamp, easeOutBack, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';
const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// simple squarified treemap layout
function layoutTreemap(items, x, y, w, h, gap) {
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const rects = [];
  const sorted = items.map((it, i) => ({ ...it, idx: i })).sort((a, b) => b.value - a.value);
  let cx = x, cy = y, cw = w, ch = h;
  let remaining = total;

  for (let i = 0; i < sorted.length;) {
    const isHoriz = cw >= ch;
    let rowItems = [];
    let rowSum = 0;
    const side = isHoriz ? ch : cw;

    // greedily add items to current row
    for (let j = i; j < sorted.length; j++) {
      const trial = [...rowItems, sorted[j]];
      const trialSum = rowSum + sorted[j].value;
      const rowLen = (trialSum / remaining) * (isHoriz ? cw : ch);
      const worst = Math.max(...trial.map((it) => {
        const s = (it.value / trialSum) * side;
        return Math.max(rowLen / s, s / rowLen);
      }));
      if (rowItems.length > 0 && worst > Math.max(...rowItems.map((it) => {
        const s = (it.value / rowSum) * side;
        const rl = (rowSum / remaining) * (isHoriz ? cw : ch);
        return Math.max(rl / s, s / rl);
      }))) break;
      rowItems.push(sorted[j]);
      rowSum = trialSum;
      j; // eslint placeholder
    }

    if (rowItems.length === 0) { rowItems = [sorted[i]]; rowSum = sorted[i].value; }

    const rowLen = (rowSum / remaining) * (isHoriz ? cw : ch);
    let offset = 0;

    rowItems.forEach((it) => {
      const ratio = it.value / rowSum;
      const itemLen = ratio * side;
      const rx = isHoriz ? cx + offset : cx;
      const ry = isHoriz ? cy : cy + offset;
      const rw = isHoriz ? itemLen : rowLen;
      const rh = isHoriz ? rowLen : itemLen;
      rects.push({
        x: rx + gap / 2, y: ry + gap / 2,
        w: Math.max(0, rw - gap), h: Math.max(0, rh - gap),
        label: it.label, value: it.value, color: it.color, idx: it.idx,
      });
      offset += itemLen;
    });

    i += rowItems.length;
    remaining -= rowSum;
    if (isHoriz) { cx += rowLen; cw -= rowLen; }
    else { cy += rowLen; ch -= rowLen; }
  }

  return rects;
}

export default {
  id: "treeMap",
  type: "svg",
  name: "Tree Map",
  category: "Data Viz",
  defaultParams: {
    data: [
      { label: "Videos", value: 45, color: "#6ee7ff" },
      { label: "Images", value: 30, color: "#a78bfa" },
      { label: "Audio", value: 20, color: "#f472b6" },
      { label: "Docs", value: 15, color: "#fb923c" },
      { label: "Code", value: 12, color: "#4ade80" },
      { label: "Other", value: 8, color: "#fbbf24" },
    ],
    gap: 6,
    borderRadius: 6,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const raw = normalizeArray(params.data, []);
    const items = raw.map((d, i) => ({
      label: d.label || `Item ${i + 1}`,
      value: toNumber(d.value, 10),
      color: d.color || PALETTE[i % PALETTE.length],
    }));
    const gap = toNumber(params.gap, 6);
    const br = toNumber(params.borderRadius, 6);

    const pad = 100;
    const layout = layoutTreemap(items, pad, pad, 1920 - pad * 2, 1080 - pad * 2, gap);

    // shadow filter
    const defs = svgEl("defs");
    const filter = svgEl("filter", { id: "tmShadow", x: "-10%", y: "-10%", width: "120%", height: "120%" });
    filter.appendChild(svgEl("feDropShadow", { dx: "0", dy: "2", stdDeviation: "4", "flood-color": "rgba(0,0,0,0.3)" }));
    defs.appendChild(filter);
    svg.appendChild(defs);

    const blocks = layout.map((r) => {
      const g = svgEl("g", { transform: `translate(${r.x + r.w / 2}, ${r.y + r.h / 2}) scale(0)` });

      const rect = svgEl("rect", {
        x: String(-r.w / 2), y: String(-r.h / 2),
        width: String(r.w), height: String(r.h),
        rx: String(br), fill: r.color, opacity: "0.85",
        filter: "url(#tmShadow)",
      });
      g.appendChild(rect);

      // label if block is big enough
      if (r.w > 70 && r.h > 40) {
        const fontSize = Math.min(24, r.w / (r.label.length * 0.7), r.h / 2.5);
        const txt = svgEl("text", {
          x: "0", y: String(fontSize * 0.15),
          fill: "rgba(0,0,0,0.7)", "font-size": String(Math.max(12, fontSize)),
          "font-family": FONT, "font-weight": "600", "text-anchor": "middle",
        });
        txt.textContent = r.label;
        g.appendChild(txt);
      }

      svg.appendChild(g);
      return { g, cx: r.x + r.w / 2, cy: r.y + r.h / 2, idx: r.idx };
    });

    return { svg, blocks };
  },

  update(els, localT) {
    const stagger = 0.12;
    const dur = 0.6;

    els.blocks.forEach((b) => {
      const start = b.idx * stagger;
      const raw = clamp((localT - start) / dur, 0, 1);
      const scale = raw > 0 ? clamp(easeOutBack(raw), 0, 1.15) : 0;
      b.g.setAttribute("transform", `translate(${b.cx}, ${b.cy}) scale(${scale})`);
    });
  },

  destroy(els) { els.svg.remove(); },
};
