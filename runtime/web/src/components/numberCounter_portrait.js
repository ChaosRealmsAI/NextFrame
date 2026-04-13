import {
  createRoot, createNode, smoothstep, easeOutCubic,
  toNumber, SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "numberCounter_portrait",
  type: "dom",
  name: "Number Counter (9:16)",
  category: "Data",
  ratio: "9:16",
  tags: ["number", "counter", "data", "portrait"],
  description: "竖屏大数字计数器，居中显示。1080x1920 专用",
  params: {
    value:  { type: "number", default: 100,       desc: "目标数值" },
    prefix: { type: "string", default: "",        desc: "前缀(如$)" },
    suffix: { type: "string", default: "",        desc: "后缀(如%)" },
    label:  { type: "string", default: "METRIC",  desc: "下方标签" },
    color:  { type: "string", default: "#a0c4ff", desc: "数字颜色" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;width:1080px;height:1920px");

    const numRow = createNode("div", `
      display:flex;align-items:baseline;justify-content:center;
      font-family:${SANS_FONT_STACK};font-weight:800;
      font-size:96px;line-height:1;
      color:${p.color || "#a0c4ff"};
    `);

    const prefixEl = p.prefix
      ? createNode("span", "font-size:56px;opacity:0.7;margin-right:8px", p.prefix)
      : null;
    const valueEl = createNode("span", "", "0");
    const suffixEl = p.suffix
      ? createNode("span", "font-size:56px;opacity:0.7;margin-left:8px", p.suffix)
      : null;

    if (prefixEl) numRow.appendChild(prefixEl);
    numRow.appendChild(valueEl);
    if (suffixEl) numRow.appendChild(suffixEl);
    root.appendChild(numRow);

    const labelEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:32px;font-weight:500;
      color:rgba(255,255,255,0.5);margin-top:24px;
      letter-spacing:0.1em;text-transform:uppercase;
    `, p.label || "METRIC");
    root.appendChild(labelEl);

    const targetValue = toNumber(p.value, 100);
    return { root, valueEl, labelEl, numRow, targetValue };
  },

  update(els, localT) {
    const { valueEl, numRow, labelEl, targetValue } = els;
    const t = easeOutCubic(smoothstep(0, 0.7, localT));
    const current = Math.round(t * targetValue);
    valueEl.textContent = String(current);

    const fadeIn = smoothstep(0, 0.3, localT);
    numRow.style.opacity = fadeIn;
    const labelT = smoothstep(0.3, 0.6, localT);
    labelEl.style.opacity = labelT;
  },

  destroy(els) {
    els.root.remove();
  },
};
