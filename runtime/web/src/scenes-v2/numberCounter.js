import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  clamp,
  easeOutCubic,
  smoothstep,
  toNumber,
  getSafeZone,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "numberCounter",
  type: "dom",
  name: "Number Counter",
  category: "Numbers",
  tags: ["number", "counter", "statistic", "data", "animation", "rollup"],
  description: "Large animated number counter that rolls from zero to the target value with optional prefix, suffix, and label.",

  params: {
    value:  { type: "number", default: 100, desc: "Target number value", min: 0, max: 999999999 },
    prefix: { type: "string", default: "", desc: "Text before the number (e.g. $)" },
    suffix: { type: "string", default: "", desc: "Text after the number (e.g. %)" },
    label:  { type: "string", default: "Total", desc: "Label text below the number" },
    color:  { type: "string", default: "#6ee7ff", desc: "Number text color" },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);
    const S = Math.min(W, H);
    const safeZone = getSafeZone(W, H);

    const color = String(params.color || "#6ee7ff");
    const label = String(params.label || "Total");
    const numberSize = Math.round(S * 0.1);
    const labelSize = Math.round(S * 0.025);

    const root = createRoot(container, [
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `padding:${Math.round(safeZone.top)}px ${Math.round(safeZone.right)}px ${Math.round(safeZone.bottom)}px ${Math.round(safeZone.left)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const wrap = createNode("div", [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "max-width:100%",
      `gap:${Math.round(S * 0.012)}px`,
    ].join(";"));

    const numberEl = createNode("div", [
      `font-size:${numberSize}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:900",
      `color:${color}`,
      "line-height:1",
      "font-variant-numeric:tabular-nums",
      "opacity:0",
      "will-change:opacity",
      "text-align:center",
      "word-break:break-word",
      "overflow-wrap:break-word",
    ].join(";"), "0");

    const labelEl = createNode("div", [
      `font-size:${labelSize}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:400",
      "color:rgba(255,255,255,0.6)",
      "text-transform:uppercase",
      "letter-spacing:0.1em",
      "opacity:0",
      "will-change:opacity",
      "text-align:center",
      "word-break:break-word",
      "overflow-wrap:break-word",
    ].join(";"), label);

    wrap.appendChild(numberEl);
    wrap.appendChild(labelEl);
    root.appendChild(wrap);

    return { root, numberEl, labelEl };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const target = toNumber(params.value, 100);
    const prefix = String(params.prefix || "");
    const suffix = String(params.suffix || "");

    const enterProgress = easeOutCubic(smoothstep(0, 0.15, t));
    const countProgress = easeOutCubic(smoothstep(0.05, 0.6, t));
    const exitProgress = smoothstep(0.85, 1, t);

    const opacity = enterProgress * (1 - exitProgress);
    const currentValue = Math.round(target * countProgress);

    const formatted = currentValue.toLocaleString("en-US");
    els.numberEl.textContent = `${prefix}${formatted}${suffix}`;
    els.numberEl.style.opacity = String(opacity);

    const labelEnter = easeOutCubic(smoothstep(0.1, 0.3, t));
    els.labelEl.style.opacity = String(labelEnter * (1 - exitProgress));
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
