import {
  createRoot, createNode, smoothstep, easeOutCubic,
  toNumber, normalizeArray, SANS_FONT_STACK,
} from '../core/shared/index.js';

export default {
  id: "featureGrid_portrait",
  type: "dom",
  name: "Feature Grid (9:16)",
  category: "Content",
  ratio: "9:16",
  tags: ["grid", "feature", "card", "portrait"],
  description: "竖屏功能网格，2x2，每格 icon+标题+描述。1080x1920 专用",
  params: {
    features: {
      type: "array",
      default: [
        { icon: "🚀", title: "Fast", desc: "Blazing speed" },
        { icon: "🔒", title: "Secure", desc: "End-to-end" },
        { icon: "🎨", title: "Beautiful", desc: "Pixel perfect" },
        { icon: "⚡", title: "Efficient", desc: "Low overhead" },
      ],
      desc: "功能数组 [{icon,title,desc}]",
    },
    columns: { type: "number", default: 2, desc: "列数" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;width:1080px;height:1920px;padding:0 60px");

    const cols = toNumber(p.columns, 2);
    const grid = createNode("div", `
      display:grid;grid-template-columns:repeat(${cols}, 1fr);
      gap:24px;width:100%;
    `);

    const features = normalizeArray(p.features, []);
    const cells = [];

    for (const feat of features) {
      const cell = createNode("div", `
        display:flex;flex-direction:column;align-items:center;
        padding:32px 16px;border-radius:16px;
        background:rgba(255,255,255,0.04);
        border:1px solid rgba(255,255,255,0.08);
        opacity:0;transform:scale(0.9);
      `);

      const iconEl = createNode("div", "font-size:48px;line-height:1;margin-bottom:16px", feat.icon || "");
      const titleEl = createNode("div", `
        font-family:${SANS_FONT_STACK};font-size:32px;font-weight:700;
        color:rgba(255,255,255,0.95);text-align:center;margin-bottom:8px;
      `, feat.title || "");
      const descEl = createNode("div", `
        font-family:${SANS_FONT_STACK};font-size:22px;font-weight:400;
        color:rgba(255,255,255,0.6);text-align:center;line-height:1.4;
      `, feat.desc || "");

      cell.appendChild(iconEl);
      cell.appendChild(titleEl);
      cell.appendChild(descEl);
      grid.appendChild(cell);
      cells.push(cell);
    }

    root.appendChild(grid);
    return { root, cells };
  },

  update(els, localT) {
    const { cells } = els;
    for (let i = 0; i < cells.length; i++) {
      const delay = 0.05 + i * 0.1;
      const t = easeOutCubic(smoothstep(delay, delay + 0.4, localT));
      cells[i].style.opacity = t;
      cells[i].style.transform = `scale(${0.9 + t * 0.1})`;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
