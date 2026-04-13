import { clamp, easeOutBack, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';
const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default {
  id: "barChart",
  type: "svg",
  name: "Bar Chart",
  category: "Data Viz",
  defaultParams: {
    data: [85, 45, 70, 55, 90, 35],
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    colors: PALETTE,
    barWidth: 80,
    gap: 30,
    showLabels: true,
    showValues: true,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const data = normalizeArray(params.data, [85, 45, 70, 55, 90, 35]);
    const labels = normalizeArray(params.labels, []);
    const colors = normalizeArray(params.colors, PALETTE);
    const barW = toNumber(params.barWidth, 80);
    const gap = toNumber(params.gap, 30);
    const showLabels = params.showLabels !== false;
    const showValues = params.showValues !== false;
    const maxVal = Math.max(...data, 1);

    const padL = 160, padR = 160, padT = 120, padB = 140;
    const chartW = 1920 - padL - padR;
    const chartH = 1080 - padT - padB;
    const totalBarW = data.length * barW + (data.length - 1) * gap;
    const offsetX = padL + (chartW - totalBarW) / 2;

    // grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      svg.appendChild(svgEl("line", {
        x1: padL, y1: y, x2: 1920 - padR, y2: y,
        stroke: "rgba(255,255,255,0.08)", "stroke-width": "1",
      }));
    }

    // baseline
    svg.appendChild(svgEl("line", {
      x1: padL, y1: padT + chartH, x2: 1920 - padR, y2: padT + chartH,
      stroke: "rgba(255,255,255,0.2)", "stroke-width": "2",
    }));

    const bars = [];
    const valueTxts = [];
    const labelTxts = [];

    data.forEach((val, i) => {
      const x = offsetX + i * (barW + gap);
      const fullH = (val / maxVal) * chartH;
      const color = colors[i % colors.length];

      const rect = svgEl("rect", {
        x: String(x), y: String(padT + chartH),
        width: String(barW), height: "0",
        rx: "4", fill: color, opacity: "0.9",
      });
      svg.appendChild(rect);
      bars.push({ rect, fullH, val });

      if (showValues) {
        const txt = svgEl("text", {
          x: String(x + barW / 2), y: String(padT + chartH),
          fill: "rgba(255,255,255,0.85)", "font-size": "22",
          "font-family": FONT, "font-weight": "600",
          "text-anchor": "middle", opacity: "0",
        });
        txt.textContent = String(val);
        svg.appendChild(txt);
        valueTxts.push(txt);
      }

      if (showLabels && labels[i]) {
        const lbl = svgEl("text", {
          x: String(x + barW / 2), y: String(padT + chartH + 40),
          fill: "rgba(255,255,255,0.6)", "font-size": "20",
          "font-family": FONT, "text-anchor": "middle",
        });
        lbl.textContent = labels[i];
        svg.appendChild(lbl);
        labelTxts.push(lbl);
      }
    });

    return { svg, bars, valueTxts, labelTxts, chartH, padT };
  },

  update(els, localT, params) {
    const stagger = 0.12;
    const dur = 0.8;

    els.bars.forEach((b, i) => {
      const start = i * stagger;
      const raw = clamp((localT - start) / dur, 0, 1);
      const t = raw > 0 ? easeOutBack(raw) : 0;
      const h = b.fullH * clamp(t, 0, 1.15);
      const y = els.padT + els.chartH - h;
      b.rect.setAttribute("y", String(y));
      b.rect.setAttribute("height", String(Math.max(0, h)));

      if (els.valueTxts[i]) {
        els.valueTxts[i].setAttribute("y", String(y - 12));
        els.valueTxts[i].setAttribute("opacity", String(clamp(raw * 3, 0, 1)));
      }
    });
  },

  destroy(els) { els.svg.remove(); },
};
