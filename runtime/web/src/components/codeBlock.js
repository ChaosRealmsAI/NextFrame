import {
  createRoot, createNode, smoothstep, toNumber,
  escapeHtml, normalizeLines, MONO_FONT_STACK,
} from '../core/scenes-v2-shared.js';

export default {
  id: "codeBlock",
  type: "dom",
  name: "Code Block (16:9)",
  category: "Typography",
  ratio: "16:9",
  tags: ["code", "terminal", "dev"],
  description: "暗色终端代码窗口，逐行淡入。1920x1080 专用",
  params: {
    code:     { type: "string", default: 'console.log("hello");', desc: "代码内容" },
    language: { type: "string", default: "",     desc: "语言标识" },
    fontSize: { type: "number", default: 22,     desc: "字号(px)" },
    title:    { type: "string", default: "",     desc: "窗口标题" },
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
      width:80%;background:#1e1e2e;border-radius:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;
    `);

    // title bar with traffic lights
    const titleBar = createNode("div", `
      display:flex;align-items:center;gap:8px;padding:14px 20px;
      background:#181825;
    `);
    const colors = ["#ff5f57", "#febc2e", "#28c840"];
    for (const c of colors) {
      titleBar.appendChild(createNode("span", `
        width:12px;height:12px;border-radius:50%;background:${c};
      `));
    }
    if (p.title) {
      const titleLabel = createNode("span", `
        margin-left:12px;font-family:${MONO_FONT_STACK};
        font-size:14px;color:rgba(255,255,255,0.5);
      `, p.title);
      titleBar.appendChild(titleLabel);
    }
    card.appendChild(titleBar);

    // code area
    const codeArea = createNode("div", `
      padding:24px 28px;font-family:${MONO_FONT_STACK};
      font-size:${toNumber(p.fontSize, 22)}px;line-height:1.6;
      color:#cdd6f4;white-space:pre;overflow:hidden;
    `);

    const lines = normalizeLines(p.code);
    const lineEls = [];
    for (const line of lines) {
      const el = createNode("div", "opacity:0;", "");
      el.innerHTML = escapeHtml(line) || "&nbsp;";
      codeArea.appendChild(el);
      lineEls.push(el);
    }

    card.appendChild(codeArea);
    root.appendChild(card);

    return { root, lineEls };
  },

  update(els, localT) {
    const { lineEls } = els;
    const stagger = 0.12;
    for (let i = 0; i < lineEls.length; i++) {
      const t = smoothstep(i * stagger + 0.2, i * stagger + 0.5, localT);
      lineEls[i].style.opacity = t;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
