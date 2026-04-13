import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  smoothstep,
  easeOutCubic,
  clamp,
  getSafeZone,
  getStageSize,
  resolveSize,
} from "../scenes-v2-shared.js";

export default {
  id: "quoteBlock",
  type: "dom",
  name: "Quote Block",
  category: "Typography",
  tags: ["text", "quote", "citation", "author", "blockquote", "inspiration"],
  description: "Adaptive quote block with large decorative quotation mark, citation text, and author attribution",

  params: {
    text: { type: "string", default: "Design is not just what it looks like. Design is how it works.", desc: "Quote text" },
    author: { type: "string", default: "Steve Jobs", desc: "Quote attribution" },
    fontSize: { type: "number", default: 0.03, desc: "Quote font size as a ratio of the short edge", min: 0.018, max: 0.06 },
    accentColor: { type: "string", default: "#a78bfa", desc: "Accent color for quotation mark and attribution" },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container, params) {
    const stage = getStageSize(container);
    const W = Math.max(container.clientWidth || stage.width, 1);
    const H = Math.max(container.clientHeight || stage.height, 1);
    const S = Math.min(stage.width || W, stage.height || H); // stage-based for stable font size
    const safeZone = getSafeZone(stage.width || W, stage.height || H);

    const text = String(params.text || "");
    const author = String(params.author || "");
    const fontSize = resolveSize(params.fontSize, S, 0.03);
    const quoteMarkSize = resolveSize(0.06, S, 0.06);
    const authorSize = resolveSize(0.02, S, 0.02);
    const accentColor = params.accentColor || "#a78bfa";
    const root = createRoot(container, [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      `padding:${Math.round(safeZone.top)}px ${Math.round(safeZone.right)}px ${Math.round(safeZone.bottom)}px ${Math.round(safeZone.left)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const quoteWrap = createNode("div", [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "max-width:70ch",
      "width:100%",
      "overflow:hidden",
      "text-align:center",
    ].join(";"));

    const quoteMark = createNode("div", [
      `font-size:${Math.round(quoteMarkSize)}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:900",
      `color:${accentColor}`,
      "line-height:1",
      "opacity:0",
      "will-change:opacity,transform",
      `margin-bottom:${Math.round(S * 0.015)}px`,
    ].join(";"), "\u201C");
    quoteWrap.appendChild(quoteMark);

    const quoteText = createNode("div", [
      `font-size:${Math.round(fontSize)}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:400",
      "font-style:italic",
      "color:rgba(255,255,255,0.9)",
      "line-height:1.6",
      "opacity:0",
      "will-change:opacity",
      "text-align:center",
      "max-width:100%",
      "overflow:hidden",
      "word-break:break-word",
      "overflow-wrap:break-word",
    ].join(";"), text);
    quoteWrap.appendChild(quoteText);

    let authorEl = null;
    if (author) {
      authorEl = createNode("div", [
        `font-size:${Math.round(authorSize)}px`,
        `font-family:${SANS_FONT_STACK}`,
        "font-weight:500",
        `color:${accentColor}`,
        `margin-top:${Math.round(S * 0.025)}px`,
        "opacity:0",
        "will-change:opacity",
        "letter-spacing:0.05em",
        "text-transform:uppercase",
        "max-width:100%",
        "overflow:hidden",
        "word-break:break-word",
        "overflow-wrap:break-word",
      ].join(";"), "\u2014 " + author);
      quoteWrap.appendChild(authorEl);
    }

    root.appendChild(quoteWrap);
    return { root, quoteMark, quoteText, authorEl, S };
  },

  update(els, localT, params) {
    const t = clamp(localT);

    const markEnter = easeOutCubic(smoothstep(0, 0.15, t));
    const markExit = smoothstep(0.85, 1, t);
    const markScale = 0.6 + markEnter * 0.4;
    els.quoteMark.style.opacity = String(markEnter * (1 - markExit));
    els.quoteMark.style.transform = `scale(${markScale})`;

    const textEnter = easeOutCubic(smoothstep(0.1, 0.3, t));
    const textExit = smoothstep(0.85, 1, t);
    els.quoteText.style.opacity = String(textEnter * (1 - textExit));

    if (els.authorEl) {
      const authorEnter = easeOutCubic(smoothstep(0.25, 0.4, t));
      const authorExit = smoothstep(0.85, 1, t);
      els.authorEl.style.opacity = String(authorEnter * (1 - authorExit));
    }
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
