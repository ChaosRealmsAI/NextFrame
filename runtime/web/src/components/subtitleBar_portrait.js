import {
  createRoot, createNode, smoothstep,
  toNumber, SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "subtitleBar_portrait",
  type: "dom",
  name: "Subtitle Bar (9:16)",
  category: "Typography",
  ratio: "9:16",
  tags: ["subtitle", "text", "caption", "portrait"],
  description: "竖屏字幕条，底部居中，半透明背景。1080x1920 专用",
  params: {
    text:     { type: "string", default: "Subtitle text here", desc: "字幕文字" },
    fontSize: { type: "number", default: 24,                   desc: "字号(px)" },
    bgColor:  { type: "string", default: "rgba(0,0,0,0.6)",   desc: "背景色" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;align-items:flex-end;justify-content:center;width:1080px;height:1920px;padding-bottom:346px");

    const bar = createNode("div", `
      max-width:85%;padding:16px 32px;border-radius:12px;
      background:${p.bgColor || "rgba(0,0,0,0.6)"};
      font-family:${SANS_FONT_STACK};font-size:${toNumber(p.fontSize, 24)}px;
      font-weight:500;color:rgba(255,255,255,0.95);
      text-align:center;line-height:1.5;
      opacity:0;transform:translateY(10px);
    `, String(p.text || ""));

    root.appendChild(bar);
    return { root, bar };
  },

  update(els, localT) {
    const t = smoothstep(0, 0.3, localT);
    els.bar.style.opacity = t;
    els.bar.style.transform = `translateY(${(1 - t) * 10}px)`;
  },

  destroy(els) {
    els.root.remove();
  },
};
