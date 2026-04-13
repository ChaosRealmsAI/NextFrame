import { clamp, easeOutCubic, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';
const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default {
  id: "horizontalBars",
  type: "svg",
  name: "Horizontal Bar Chart",
  category: "Data Viz",
  defaultParams: {
    data: [90, 72, 65, 50, 38, 25],
    labels: ["React", "Python", "Rust", "Go", "Swift", "Kotlin"],
    colors: PALETTE,
    height: 44,
    gap: 20,
    showValues: true,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const data = normalizeArray(params.data, [90, 72, 65, 50, 38, 25]);
    const labels = normalizeArray(params.labels, []);
    const colors = normalizeArray(params.colors, PALETTE);
    const barH = toNumber(params.height, 44);
    const gap = toNumber(params.gap, 20);
    const showValues = params.showValues !== false;
    const maxVal = Math.max(...data, 1);

    const labelW = 200;
    const padL = 200, padR = 200, padT = 100;
    const chartW = 1920 - padL - labelW - padR;
    const totalH = data.length * barH + (data.length - 1) * gap;
    const offsetY = padT + (880 - totalH) / 2;

    const bars = [];
    const valTxts = [];

    data.forEach((val, i) => {
      const y = offsetY + i * (barH + gap);
      const fullW = (val / maxVal) * chartW;
      const color = colors[i % colors.length];

      // label
      if (labels[i]) {
        const lbl = svgEl("text", {
          x: String(padL - 16), y: String(y + barH / 2 + 6),
          fill: "rgba(255,255,255,0.7)", "font-size": "22",
          "font-family": FONT, "text-anchor": "end",
        });
        lbl.textContent = labels[i];
        svg.appendChild(lbl);
      }

      // bg track
      svg.appendChild(svgEl("rect", {
        x: String(padL), y: String(y),
        width: String(chartW), height: String(barH),
        rx: "4", fill: "rgba(255,255,255,0.04)",
      }));

      // bar
      const rect = svgEl("rect", {
        x: String(padL), y: String(y),
        width: "0", height: String(barH),
        rx: "4", fill: color, opacity: "0.9",
      });
      svg.appendChild(rect);
      bars.push({ rect, fullW, val });

      // value text
      if (showValues) {
        const txt = svgEl("text", {
          x: String(padL + 8), y: String(y + barH / 2 + 6),
          fill: "rgba(255,255,255,0.85)", "font-size": "18",
          "font-family": FONT, "font-weight": "600", opacity: "0",
        });
        txt.textContent = String(val);
        svg.appendChild(txt);
        valTxts.push(txt);
      }
    });

    return { svg, bars, valTxts, padL };
  },

  update(els, localT) {
    const stagger = 0.1;
    const dur = 0.7;

    els.bars.forEach((b, i) => {
      const start = i * stagger;
      const raw = clamp((localT - start) / dur, 0, 1);
      const t = easeOutCubic(raw);
      const w = b.fullW * t;
      b.rect.setAttribute("width", String(Math.max(0, w)));

      if (els.valTxts[i]) {
        els.valTxts[i].setAttribute("x", String(els.padL + w + 12));
        els.valTxts[i].setAttribute("opacity", String(clamp((raw - 0.3) * 3, 0, 1)));
      }
    });
  },

  destroy(els) { els.svg.remove(); },
};
