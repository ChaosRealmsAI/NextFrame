import {
  createRoot, createNode, smoothstep, toNumber,
  SANS_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "subtitleBar_43",
  type: "dom",
  name: "Subtitle Bar (4:3)",
  category: "Typography",
  ratio: "4:3",
  tags: ["subtitle", "caption", "text", "ppt"],
  description: "4:3 PPT 底部居中字幕条，打字机效果。PPT 横屏专用",
  params: {
    text:     { type: "string", default: "Subtitle text here", desc: "字幕文字" },
    fontSize: { type: "number", default: 22,                   desc: "字号(px)" },
    bgColor:  { type: "string", default: "rgba(0,0,0,0.6)",   desc: "背景色" },
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
    const root = createRoot(container, `display:flex;align-items:flex-end;justify-content:center;width:${W}px;height:${H}px;padding-bottom:64px`);

    const bar = createNode("div", `
      padding:10px 24px;border-radius:8px;
      background:${p.bgColor || "rgba(0,0,0,0.6)"};
      backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      opacity:0;
    `);

    const textEl = createNode("span", `
      font-family:${SANS_FONT_STACK};font-size:${toNumber(p.fontSize, 22)}px;
      color:#ffffff;white-space:pre-wrap;
    `);

    bar.appendChild(textEl);
    root.appendChild(bar);

    const fullText = String(p.text || "");

    return { root, bar, textEl, fullText };
  },

  update(els, localT) {
    const { bar, textEl, fullText } = els;

    const barT = smoothstep(0.0, 0.3, localT);
    bar.style.opacity = barT;

    if (fullText.length > 0) {
      const charTime = 0.04;
      const startDelay = 0.3;
      const elapsed = Math.max(0, localT - startDelay);
      const charCount = Math.min(fullText.length, Math.floor(elapsed / charTime));
      textEl.textContent = fullText.slice(0, charCount);
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
