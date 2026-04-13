import {
  createRoot, createNode, smoothstep, easeOutBack,
  SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "calloutCard",
  type: "dom",
  name: "Callout Card (16:9)",
  category: "Typography",
  ratio: "16:9",
  tags: ["card", "callout", "info"],
  description: "居中卡片标注，emoji + 标题 + 描述。1920x1080 专用",
  params: {
    icon:        { type: "string", default: "💡",                    desc: "emoji 图标" },
    title:       { type: "string", default: "Key Insight",           desc: "标题" },
    description: { type: "string", default: "Something noteworthy.", desc: "描述文字" },
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
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;width:1920px;height:1080px");

    const card = createNode("div", `
      display:flex;flex-direction:column;align-items:center;
      padding:60px 80px;border-radius:20px;max-width:900px;
      background:${p.bgColor || "rgba(255,255,255,0.06)"};
      border:1px solid ${p.borderColor || "rgba(255,255,255,0.12)"};
      opacity:0;transform:scale(0.9);
    `);

    const icon = createNode("div", `
      font-size:48px;margin-bottom:24px;
    `, p.icon || "");

    const title = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:36px;font-weight:700;
      color:#ffffff;margin-bottom:16px;text-align:center;
    `, p.title || "");

    const desc = createNode("div", `
      font-family:${SANS_FONT_STACK};font-size:24px;font-weight:400;
      color:rgba(255,255,255,0.7);text-align:center;line-height:1.6;
      max-width:700px;
    `, p.description || "");

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);
    root.appendChild(card);

    return { root, card };
  },

  update(els, localT) {
    const t = smoothstep(0.1, 0.6, localT);
    const scale = 0.9 + 0.1 * easeOutBack(t);
    els.card.style.opacity = t;
    els.card.style.transform = `scale(${Math.min(scale, 1.02)})`;
  },

  destroy(els) {
    els.root.remove();
  },
};
