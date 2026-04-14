import {
  createRoot, createNode, smoothstep, easeOutCubic,
  toNumber, SANS_FONT_STACK,
} from '../core/shared/index.js';

export default {
  id: "numberCounter",
  type: "dom",
  name: "Number Counter (16:9)",
  category: "Data",
  ratio: "16:9",
  tags: ["number", "counter", "data", "stat"],
  description: "居中大数字，从 0 滚到目标值。1920x1080 专用",
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
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;width:1920px;height:1080px");

    const targetValue = toNumber(p.value, 1000);
    const color = p.color || "#60a5fa";

    const numberEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:120px;font-weight:800;
      color:${color};opacity:0;
      font-variant-numeric:tabular-nums;
    `, "0");

    const labelEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:28px;font-weight:400;
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
