import { smoothstep, resolveSize, clamp, toNumber, toBoolean, easeOutCubic, SANS_FONT_STACK, MONO_FONT_STACK, getStageSize } from "../scenes-v2-shared.js";

const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

export default {
  id: "progressRing",
  type: "svg",
  name: "Progress Ring",
  category: "Numbers",
  tags: ["progress", "ring", "circle", "number", "percentage", "animated"],
  description: "Circular progress ring with animated arc growth and centered number counter",

  params: {
    progress:    { type: "number",  default: 85, min: 0, max: 100,   desc: "Progress value (0-100)" },
    color:       { type: "color",   default: "#4ade80",              desc: "Ring color" },
    label:       { type: "string",  default: "Quality",             desc: "Label below the number" },
    showPercent: { type: "boolean", default: true,                   desc: "Show percent symbol" },
    numberSize: { type: "number", default: 0.08, desc: "Number font size as a ratio of the short edge (or px/keyword)" },
    labelSize:  { type: "number", default: 0.025, desc: "Label font size as a ratio of the short edge (or px/keyword)" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const stage = getStageSize(container);
    const W = Math.max(container.clientWidth || stage.width, 1);
    const H = Math.max(container.clientHeight || stage.height, 1);
    const S = Math.min(stage.width || W, stage.height || H); // stage-based for stable font size

    const progress    = clamp(toNumber(params.progress, 85), 0, 100);
    const color       = params.color || this.params.color.default;
    const label       = params.label ?? this.params.label.default;
    const showPercent = toBoolean(params.showPercent, true);

    const radius   = S * 0.2;
    const lineW    = S * 0.015;
    const numberFs = resolveSize(params.numberSize, S, 0.08);
    const labelFs  = resolveSize(params.labelSize, S, 0.025);
    const cx = W / 2;
    const cy = H / 2;

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:hidden";
    container.appendChild(svg);

    // Background track
    const trackCircle = document.createElementNS(NS, "circle");
    trackCircle.setAttribute("cx", cx);
    trackCircle.setAttribute("cy", cy);
    trackCircle.setAttribute("r", radius);
    trackCircle.setAttribute("fill", "none");
    trackCircle.setAttribute("stroke", "rgba(255,255,255,0.08)");
    trackCircle.setAttribute("stroke-width", lineW);
    svg.appendChild(trackCircle);

    // Progress arc
    const circumference = TAU * radius;
    const arcCircle = document.createElementNS(NS, "circle");
    arcCircle.setAttribute("cx", cx);
    arcCircle.setAttribute("cy", cy);
    arcCircle.setAttribute("r", radius);
    arcCircle.setAttribute("fill", "none");
    arcCircle.setAttribute("stroke", color);
    arcCircle.setAttribute("stroke-width", lineW);
    arcCircle.setAttribute("stroke-linecap", "round");
    arcCircle.setAttribute("stroke-dasharray", circumference);
    arcCircle.setAttribute("stroke-dashoffset", circumference);
    arcCircle.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
    svg.appendChild(arcCircle);

    // Number text
    const numberTxt = document.createElementNS(NS, "text");
    numberTxt.setAttribute("x", cx);
    numberTxt.setAttribute("y", cy + numberFs * 0.1);
    numberTxt.setAttribute("text-anchor", "middle");
    numberTxt.setAttribute("dominant-baseline", "central");
    numberTxt.setAttribute("font-family", MONO_FONT_STACK);
    numberTxt.setAttribute("font-size", numberFs);
    numberTxt.setAttribute("font-weight", "800");
    numberTxt.setAttribute("fill", "#ffffff");
    numberTxt.textContent = "0";
    svg.appendChild(numberTxt);

    // Label text
    const labelTxt = document.createElementNS(NS, "text");
    labelTxt.setAttribute("x", cx);
    labelTxt.setAttribute("y", cy + radius + labelFs * 2.2);
    labelTxt.setAttribute("text-anchor", "middle");
    labelTxt.setAttribute("font-family", SANS_FONT_STACK);
    labelTxt.setAttribute("font-size", labelFs);
    labelTxt.setAttribute("font-weight", "600");
    labelTxt.setAttribute("fill", "rgba(200,210,230,0.7)");
    labelTxt.textContent = label;
    svg.appendChild(labelTxt);

    return { svg, arcCircle, numberTxt, circumference, progress, showPercent, color };
  },

  update(els, localT, _params) {
    const { arcCircle, numberTxt, circumference, progress, showPercent, color } = els;
    const t = easeOutCubic(clamp(localT / 1.4, 0, 1));

    const currentProgress = progress * t;
    const dashOffset = circumference * (1 - currentProgress / 100);
    arcCircle.setAttribute("stroke-dashoffset", dashOffset);

    const displayVal = Math.round(currentProgress);
    numberTxt.textContent = showPercent ? `${displayVal}%` : String(displayVal);

    // Glow pulse
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(localT * 3));
    arcCircle.setAttribute("filter", "none");
    arcCircle.style.filter = t > 0.5 ? `drop-shadow(0 0 ${6 * pulse}px ${color})` : "none";
  },

  destroy(els) {
    if (els.svg && els.svg.parentNode) {
      els.svg.parentNode.removeChild(els.svg);
    }
  },
};
