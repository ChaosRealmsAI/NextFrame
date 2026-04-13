import {
  createRoot, createNode, smoothstep, easeOutCubic,
  SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "calloutCard_portrait",
  type: "dom",
  name: "Callout Card (9:16)",
  category: "Content",
  ratio: "9:16",
  tags: ["card", "callout", "portrait"],
  description: "竖屏卡片，emoji + 标题 + 描述。1080x1920 专用",
  params: {
    icon:        { type: "string", default: "💡",            desc: "emoji 图标" },
    title:       { type: "string", default: "Key Insight",   desc: "卡片标题" },
    description: { type: "string", default: "Details here.", desc: "描述文字" },
    bgColor:     { type: "string", default: "rgba(255,255,255,0.06)", desc: "卡片背景色" },
    borderColor: { type: "string", default: "rgba(255,255,255,0.12)", desc: "边框颜色" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;width:1080px;height:1920px;padding:0 60px");

    const card = createNode("div", `
      width:100%;padding:48px;border-radius:20px;
      background:${p.bgColor || "rgba(255,255,255,0.06)"};
      border:1px solid ${p.borderColor || "rgba(255,255,255,0.12)"};
      display:flex;flex-direction:column;align-items:center;gap:24px;
      opacity:0;transform:scale(0.95) translateY(20px);
    `);

    const iconEl = createNode("div", `
      font-size:56px;line-height:1;
    `, p.icon || "💡");
    card.appendChild(iconEl);

    const titleEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:40px;font-weight:700;
      color:rgba(255,255,255,0.95);text-align:center;line-height:1.3;
    `, p.title || "Key Insight");
    card.appendChild(titleEl);

    const descEl = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:28px;font-weight:400;
      color:rgba(255,255,255,0.7);text-align:center;line-height:1.6;
    `, p.description || "");
    card.appendChild(descEl);

    root.appendChild(card);
    return { root, card };
  },

  update(els, localT) {
    const t = easeOutCubic(smoothstep(0, 0.5, localT));
    els.card.style.opacity = t;
    const scale = 0.95 + t * 0.05;
    els.card.style.transform = `scale(${scale}) translateY(${(1 - t) * 20}px)`;
  },

  destroy(els) {
    els.root.remove();
  },
};
