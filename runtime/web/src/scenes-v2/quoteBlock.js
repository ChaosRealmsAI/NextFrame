import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  SERIF_FONT_STACK, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "quoteBlock",
  type: "dom",
  name: "Quote Block",
  category: "Typography",
  defaultParams: {
    text: "Design is not just what it looks like. Design is how it works.",
    author: "Steve Jobs",
    fontSize: 32,
    accentColor: "#a78bfa",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8% 12%");
    const fontSize = toNumber(params.fontSize, 32);
    const accent = params.accentColor || "#a78bfa";
    const quoteOpen = createNode("div", [
      `font-size:${fontSize * 2.5}px`,
      `font-family:${SERIF_FONT_STACK}`,
      `color:${accent}`,
      "line-height:1",
      "will-change:opacity,transform",
      "opacity:0",
      `text-shadow:0 0 30px ${accent}44`,
    ].join(";"), "\u201C");
    const body = createNode("div", [
      `font-family:${SERIF_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "font-weight:400",
      "font-style:italic",
      "color:rgba(255,255,255,0.9)",
      "line-height:1.6",
      "text-align:center",
      "max-width:680px",
      "letter-spacing:0.01em",
      "will-change:opacity,transform",
      "opacity:0",
    ].join(";"), params.text || "");
    const authorEl = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${Math.max(13, fontSize * 0.45)}px`,
      "font-weight:500",
      "color:rgba(255,255,255,0.5)",
      "margin-top:1.2em",
      "letter-spacing:0.1em",
      "text-transform:uppercase",
      "will-change:opacity",
      "opacity:0",
    ].join(";"), params.author ? `\u2014 ${params.author}` : "");
    root.appendChild(quoteOpen);
    root.appendChild(body);
    root.appendChild(authorEl);
    return { root, quoteOpen, body, authorEl };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const qT = easeOutCubic(smoothstep(0, 0.1, localT));
    els.quoteOpen.style.opacity = qT * exitAlpha;
    els.quoteOpen.style.transform = `scale(${0.6 + 0.4 * qT})`;
    const bT = easeOutCubic(smoothstep(0.05, 0.15, localT));
    els.body.style.opacity = bT * exitAlpha;
    els.body.style.transform = `translateY(${(1 - bT) * 20}px)`;
    const aT = smoothstep(0.12, 0.22, localT);
    els.authorEl.style.opacity = aT * exitAlpha;
  },

  destroy(els) { els.root.remove(); },
};
