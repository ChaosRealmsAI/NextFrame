import {
  createRoot, createNode, smoothstep,
  toNumber, normalizeArray, SANS_FONT_STACK,
} from '../core/shared/index.js';

export default {
  id: "bulletList_43",
  type: "dom",
  name: "Bullet List (4:3)",
  category: "Typography",
  ratio: "4:3",
  tags: ["list", "bullet", "text", "ppt"],
  description: "4:3 PPT 左对齐要点列表，逐条滑入。PPT 横屏专用",
  params: {
    items:       { type: "array",  default: ["Point one", "Point two", "Point three"], desc: "列表项数组" },
    fontSize:    { type: "number", default: 26,       desc: "字号(px)" },
    bulletColor: { type: "string", default: "#60a5fa", desc: "圆点颜色" },
    stagger:     { type: "number", default: 0.1,      desc: "逐条延迟(秒)" },
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
    const root = createRoot(container, `display:flex;flex-direction:column;justify-content:center;width:${W}px;height:${H}px;padding-left:160px`);

    const items = normalizeArray(p.items, ["Point one", "Point two", "Point three"]);
    const fontSize = toNumber(p.fontSize, 26);
    const bulletColor = p.bulletColor || "#60a5fa";
    const rows = [];

    for (const text of items) {
      const row = createNode("div", `
        display:flex;align-items:center;gap:16px;
        margin-bottom:24px;opacity:0;transform:translateX(-40px);
      `);
      const dot = createNode("span", `
        width:12px;height:12px;border-radius:50%;flex-shrink:0;
        background:${bulletColor};
      `);
      const label = createNode("span", `
        font-family:${SANS_FONT_STACK};font-size:${fontSize}px;
        color:rgba(255,255,255,0.9);line-height:1.5;
      `, text);
      row.appendChild(dot);
      row.appendChild(label);
      root.appendChild(row);
      rows.push(row);
    }

    return { root, rows, stagger: toNumber(p.stagger, 0.1) };
  },

  update(els, localT) {
    const { rows, stagger } = els;
    for (let i = 0; i < rows.length; i++) {
      const t = smoothstep(i * stagger, i * stagger + 0.4, localT);
      rows[i].style.opacity = t;
      rows[i].style.transform = `translateX(${(1 - t) * -40}px)`;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
