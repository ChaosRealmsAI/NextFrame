import {
  createRoot, createNode, smoothstep, easeOutCubic,
  toNumber, SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "numberCounter_43",
  type: "dom",
  name: "Number Counter (4:3)",
  category: "Data",
  ratio: "4:3",
  tags: ["number", "counter", "data", "ppt"],
  description: "4:3 PPT 居中大数字，从 0 滚到目标值。PPT 横屏专用",
  params: {
    value:  { type: "number", default: 1000,     desc: "目标数值" },
    prefix: { type: "string", default: "",       desc: "前缀(如 $)" },
    suffix: { type: "string", default: "",       desc: "后缀(如 %)" },
    label:  { type: "string", default: "Total",  desc: "底部标签" },
    color:  { type: "string", default: "#60a5fa", desc: "数字颜色" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const W = container.clientWidth;
    const H = container.clientHeight;
    const root = createRoot(container, `display:flex;flex-direction:column;align-items:center;justify-content:center;width:${W}px;height:${H}px`);

    const targetValue = toNumber(p.value, 1000);
    const color = p.color || "#60a5fa";

    const numberEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:100px;font-weight:800;
      color:${color};opacity:0;
      font-variant-numeric:tabular-nums;
    `, "0");

    const labelEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:26px;font-weight:400;
      color:rgba(255,255,255,0.6);margin-top:16px;opacity:0;
    `, p.label || "");

    root.appendChild(numberEl);
    root.appendChild(labelEl);

    return { root, numberEl, labelEl, targetValue, prefix: p.prefix || "", suffix: p.suffix || "" };
  },

  update(els, localT) {
    const { numberEl, labelEl, targetValue, prefix, suffix } = els;
    const t = smoothstep(0.2, 1.2, localT);
    const current = Math.round(easeOutCubic(t) * targetValue);

    numberEl.style.opacity = Math.min(t * 3, 1);
    numberEl.textContent = `${prefix}${current.toLocaleString()}${suffix}`;

    const lt = smoothstep(0.6, 1.0, localT);
    labelEl.style.opacity = lt;
  },

  destroy(els) {
    els.root.remove();
  },
};
