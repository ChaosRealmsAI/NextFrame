import {
  createRoot, createNode, smoothstep,
  toNumber, SANS_FONT_STACK, makeLinearGradient,
} from '../core/scenes-v2-shared.js';

export default {
  id: "headline_portrait",
  type: "dom",
  name: "Headline (9:16)",
  category: "Typography",
  ratio: "9:16",
  tags: ["text", "title", "heading", "portrait"],
  description: "竖屏大标题，渐变色，逐字 stagger。1080x1920 专用",
  params: {
    text:     { type: "string", default: "HEADLINE", desc: "标题文字" },
    subtitle: { type: "string", default: "",         desc: "副标题" },
    fontSize: { type: "number", default: 56,         desc: "标题字号(px)" },
    gradient: { type: "array",  default: ["#ffffff", "#a0c4ff"], desc: "渐变色数组" },
    stagger:  { type: "number", default: 0.08,       desc: "逐字延迟(秒)" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:1080px;height:1920px;padding-top:480px");

    const titleRow = createNode("div", `
      display:flex;flex-wrap:wrap;justify-content:center;align-items:center;
      font-family:${SANS_FONT_STACK};font-weight:800;
      font-size:${toNumber(p.fontSize, 56)}px;line-height:1.3;
      max-width:90%;word-break:break-word;
    `);

    const text = String(p.text || "HEADLINE");
    const chars = [];
    for (const ch of text) {
      const span = createNode("span", `
        display:inline-block;opacity:0;transform:translateY(30px);
        background:${makeLinearGradient(p.gradient, ["#ffffff","#a0c4ff"])};
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;
      `, ch === " " ? "\u00A0" : ch);
      titleRow.appendChild(span);
      chars.push(span);
    }
    root.appendChild(titleRow);

    let subtitleEl = null;
    if (p.subtitle) {
      subtitleEl = createNode("div", `
        font-family:${SANS_FONT_STACK};font-size:28px;font-weight:400;
        color:rgba(255,255,255,0.7);margin-top:24px;opacity:0;
        text-align:center;max-width:90%;
      `, p.subtitle);
      root.appendChild(subtitleEl);
    }

    return { root, chars, subtitleEl, stagger: toNumber(p.stagger, 0.08) };
  },

  update(els, localT) {
    const { chars, subtitleEl, stagger } = els;
    for (let i = 0; i < chars.length; i++) {
      const t = smoothstep(i * stagger, i * stagger + 0.4, localT);
      chars[i].style.opacity = t;
      chars[i].style.transform = `translateY(${(1 - t) * 30}px)`;
    }
    if (subtitleEl) {
      const delay = chars.length * stagger + 0.2;
      const t = smoothstep(delay, delay + 0.5, localT);
      subtitleEl.style.opacity = t;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
