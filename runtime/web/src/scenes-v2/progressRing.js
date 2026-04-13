import { clamp, easeOutCubic, toNumber } from "../scenes-v2-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, "SF Pro Display", sans-serif';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export default {
  id: "progressRing",
  type: "svg",
  name: "Progress Ring",
  category: "Data Viz",
  defaultParams: {
    progress: 75,
    color: "#6ee7ff",
    bgColor: "rgba(255,255,255,0.08)",
    strokeWidth: 28,
    label: "Progress",
    showPercent: true,
  },

  create(container, params) {
    const svg = svgEl("svg", {
      viewBox: "0 0 1920 1080",
      style: "position:absolute;inset:0;width:100%;height:100%",
    });
    container.appendChild(svg);

    const color = params.color || "#6ee7ff";
    const bgColor = params.bgColor || "rgba(255,255,255,0.08)";
    const sw = toNumber(params.strokeWidth, 28);
    const progress = clamp(toNumber(params.progress, 75), 0, 100);
    const showPercent = params.showPercent !== false;
    const label = params.label || "";

    const cx = 960, cy = 500, r = 260;
    const circumference = 2 * Math.PI * r;

    // glow filter
    const defs = svgEl("defs");
    const filter = svgEl("filter", { id: "ringGlow", x: "-30%", y: "-30%", width: "160%", height: "160%" });
    const blur = svgEl("feGaussianBlur", { stdDeviation: "6", result: "blur" });
    const merge = svgEl("feMerge");
    const m1 = svgEl("feMergeNode", { in: "blur" });
    const m2 = svgEl("feMergeNode", { in: "SourceGraphic" });
    merge.appendChild(m1);
    merge.appendChild(m2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // bg ring
    svg.appendChild(svgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(r),
      fill: "none", stroke: bgColor, "stroke-width": String(sw),
    }));

    // progress arc
    const arc = svgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(r),
      fill: "none", stroke: color, "stroke-width": String(sw),
      "stroke-linecap": "round",
      "stroke-dasharray": String(circumference),
      "stroke-dashoffset": String(circumference),
      transform: `rotate(-90 ${cx} ${cy})`,
      filter: "url(#ringGlow)",
    });
    svg.appendChild(arc);

    // percent text
    const pctText = svgEl("text", {
      x: String(cx), y: String(cy + 20),
      fill: "rgba(255,255,255,0.95)", "font-size": "96",
      "font-family": FONT, "font-weight": "700",
      "text-anchor": "middle", opacity: "0",
    });
    pctText.textContent = "0%";
    svg.appendChild(pctText);

    // label
    const lblText = svgEl("text", {
      x: String(cx), y: String(cy + 70),
      fill: "rgba(255,255,255,0.5)", "font-size": "28",
      "font-family": FONT, "font-weight": "400",
      "text-anchor": "middle", opacity: "0",
    });
    lblText.textContent = label;
    svg.appendChild(lblText);

    return { svg, arc, pctText, lblText, circumference, progress, showPercent };
  },

  update(els, localT) {
    const raw = clamp(localT / 1.8, 0, 1);
    const t = easeOutCubic(raw);
    const curProgress = els.progress * t;
    const offset = els.circumference * (1 - curProgress / 100);
    els.arc.setAttribute("stroke-dashoffset", String(offset));

    if (els.showPercent) {
      els.pctText.textContent = `${Math.round(curProgress)}%`;
      els.pctText.setAttribute("opacity", String(clamp(raw * 3, 0, 1)));
    }
    els.lblText.setAttribute("opacity", String(clamp((raw - 0.2) * 3, 0, 1)));
  },

  destroy(els) { els.svg.remove(); },
};
