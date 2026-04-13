import { clamp, smoothstep, toNumber, normalizeArray } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default {
  id: "lineChart",
  type: "svg",
  name: "Line Chart",
  category: "Data Viz",
  defaultParams: {
    data: [20, 55, 35, 80, 50, 90, 65],
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    color: "#6ee7ff",
    strokeWidth: 3,
    showDots: true,
    showArea: true,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const data = normalizeArray(params.data, [20, 55, 35, 80, 50, 90, 65]);
    const labels = normalizeArray(params.labels, []);
    const color = params.color || "#6ee7ff";
    const sw = toNumber(params.strokeWidth, 3);
    const showDots = params.showDots !== false;
    const showArea = params.showArea !== false;

    const padL = 160, padR = 160, padT = 100, padB = 140;
    const chartW = 1920 - padL - padR;
    const chartH = 1080 - padT - padB;
    const maxVal = Math.max(...data, 1);
    const n = data.length;

    // grid
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      svg.appendChild(svgEl("line", {
        x1: String(padL), y1: String(y), x2: String(1920 - padR), y2: String(y),
        stroke: "rgba(255,255,255,0.08)", "stroke-width": "1",
      }));
    }

    // compute points
    const points = data.map((v, i) => ({
      x: padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2),
      y: padT + chartH - (v / maxVal) * chartH,
    }));
    const pointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");

    // gradient for area
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: "lineAreaGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    const stop1 = svgEl("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.3" });
    const stop2 = svgEl("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" });
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // area fill
    let area = null;
    if (showArea) {
      const baseY = padT + chartH;
      const areaD = `M${points[0].x},${baseY} ` +
        points.map((p) => `L${p.x},${p.y}`).join(" ") +
        ` L${points[n - 1].x},${baseY} Z`;
      area = svgEl("path", {
        d: areaD, fill: "url(#lineAreaGrad)", opacity: "0",
      });
      svg.appendChild(area);
    }

    // line
    const line = svgEl("polyline", {
      points: pointsStr, fill: "none", stroke: color,
      "stroke-width": String(sw), "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    svg.appendChild(line);

    // measure total length
    const totalLen = (() => {
      let len = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        len += Math.sqrt(dx * dx + dy * dy);
      }
      return len;
    })();
    line.setAttribute("stroke-dasharray", String(totalLen));
    line.setAttribute("stroke-dashoffset", String(totalLen));

    // dots
    const dots = [];
    if (showDots) {
      points.forEach((p) => {
        const c = svgEl("circle", {
          cx: String(p.x), cy: String(p.y), r: "6",
          fill: color, stroke: "#1a1a2e", "stroke-width": "2", opacity: "0",
        });
        svg.appendChild(c);
        dots.push(c);
      });
    }

    // labels
    labels.forEach((lbl, i) => {
      if (!points[i]) return;
      const txt = svgEl("text", {
        x: String(points[i].x), y: String(padT + chartH + 40),
        fill: "rgba(255,255,255,0.6)", "font-size": "20",
        "font-family": FONT, "text-anchor": "middle",
      });
      txt.textContent = lbl;
      svg.appendChild(txt);
    });

    return { svg, line, area, dots, totalLen };
  },

  update(els, localT) {
    const drawT = smoothstep(0, 1.5, localT);
    els.line.setAttribute("stroke-dashoffset", String(els.totalLen * (1 - drawT)));

    if (els.area) {
      els.area.setAttribute("opacity", String(clamp(drawT * 1.5, 0, 1)));
    }

    els.dots.forEach((dot, i) => {
      const threshold = (i / Math.max(els.dots.length - 1, 1)) * 1.5;
      const a = smoothstep(threshold, threshold + 0.2, localT);
      dot.setAttribute("opacity", String(a));
      const scale = 0.5 + a * 0.5;
      dot.setAttribute("r", String(6 * scale));
    });
  },

  destroy(els) { els.svg.remove(); },
};
