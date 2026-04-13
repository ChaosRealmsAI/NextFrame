import {
  createRoot, createNode, smoothstep, escapeHtml,
  toNumber, MONO_FONT_STACK, SANS_FONT_STACK,
} from '../core/shared/index.js';

export default {
  id: "codeBlock_portrait",
  type: "dom",
  name: "Code Block (9:16)",
  category: "Code",
  ratio: "9:16",
  tags: ["code", "programming", "portrait"],
  description: "竖屏代码块，全宽，圆角。1080x1920 专用",
  params: {
    code:     { type: "string", default: "console.log('hello');", desc: "代码内容" },
    language: { type: "string", default: "",                      desc: "语言标签" },
    fontSize: { type: "number", default: 18,                      desc: "代码字号(px)" },
    title:    { type: "string", default: "",                      desc: "顶部标题" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;width:1080px;height:1920px;padding:0 40px");

    const card = createNode("div", `
      width:100%;max-height:60%;overflow:hidden;
      background:rgba(20,20,30,0.9);border-radius:12px;
      border:1px solid rgba(255,255,255,0.08);
      opacity:0;transform:translateY(20px);
    `);

    if (p.title || p.language) {
      const header = createNode("div", `
        padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.08);
        font-family:${SANS_FONT_STACK};font-size:14px;font-weight:600;
        color:rgba(255,255,255,0.5);
      `, p.title || p.language);
      card.appendChild(header);
    }

    const pre = createNode("pre", `
      margin:0;padding:20px;overflow:auto;
      font-family:${MONO_FONT_STACK};font-size:${toNumber(p.fontSize, 18)}px;
      line-height:1.6;color:rgba(255,255,255,0.9);
      white-space:pre-wrap;word-break:break-all;
    `);
    pre.innerHTML = escapeHtml(String(p.code || ""));
    card.appendChild(pre);
    root.appendChild(card);

    return { root, card };
  },

  update(els, localT) {
    const t = smoothstep(0, 0.5, localT);
    els.card.style.opacity = t;
    els.card.style.transform = `translateY(${(1 - t) * 20}px)`;
  },

  destroy(els) {
    els.root.remove();
  },
};
