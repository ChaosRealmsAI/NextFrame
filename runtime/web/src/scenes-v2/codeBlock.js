import {
  createRoot, createNode, smoothstep, toNumber, lerp,
  normalizeLines, MONO_FONT_STACK, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const THEMES = {
  dark: { bg: "rgba(15,15,25,0.85)", text: "#e2e8f0", line: "rgba(255,255,255,0.15)", border: "rgba(255,255,255,0.08)" },
  light: { bg: "rgba(245,245,250,0.9)", text: "#1e293b", line: "rgba(0,0,0,0.2)", border: "rgba(0,0,0,0.1)" },
};

export default {
  id: "codeBlock",
  type: "dom",
  name: "Code Block",
  category: "Code",
  defaultParams: {
    code: 'function hello() {\n  console.log("Hello, world!");\n  return 42;\n}',
    language: "javascript",
    fontSize: 18,
    theme: "dark",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6% 8%");
    const theme = THEMES[params.theme] || THEMES.dark;
    const fontSize = toNumber(params.fontSize, 18);
    const card = createNode("div", [
      `background:${theme.bg}`,
      "border-radius:12px",
      `border:1px solid ${theme.border}`,
      "padding:20px 24px",
      "max-width:720px",
      "width:100%",
      "box-shadow:0 8px 32px rgba(0,0,0,0.3)",
      "will-change:opacity,transform",
      "opacity:0",
    ].join(";"));
    const header = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:12px",
      "font-weight:500",
      `color:${theme.line}`,
      "margin-bottom:12px",
      "letter-spacing:0.08em",
      "text-transform:uppercase",
    ].join(";"), params.language || "");
    card.appendChild(header);
    const lines = normalizeLines(params.code || "");
    const lineEls = lines.map((text, i) => {
      const row = createNode("div", [
        "display:flex",
        "gap:1em",
        "will-change:opacity",
        "opacity:0",
      ].join(";"));
      const num = createNode("span", [
        `font-family:${MONO_FONT_STACK}`,
        `font-size:${fontSize}px`,
        `color:${theme.line}`,
        "min-width:2em",
        "text-align:right",
        "user-select:none",
        "line-height:1.7",
      ].join(";"), String(i + 1));
      const code = createNode("span", [
        `font-family:${MONO_FONT_STACK}`,
        `font-size:${fontSize}px`,
        `color:${theme.text}`,
        "white-space:pre",
        "line-height:1.7",
      ].join(";"));
      row.appendChild(num);
      row.appendChild(code);
      card.appendChild(row);
      return { row, code, fullText: text };
    });
    root.appendChild(card);
    return { root, card, lineEls };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const cardT = smoothstep(0, 0.08, localT);
    els.card.style.opacity = cardT * exitAlpha;
    els.card.style.transform = `translateY(${(1 - cardT) * 15}px)`;
    const totalLines = els.lineEls.length;
    const typeWindow = 0.6 / Math.max(1, totalLines);
    els.lineEls.forEach((item, i) => {
      const lineStart = 0.06 + i * typeWindow;
      const lineEnd = lineStart + typeWindow * 1.5;
      const lineT = smoothstep(lineStart, lineEnd, localT);
      item.row.style.opacity = (lineT > 0 ? 1 : 0) * exitAlpha;
      const charCount = Math.round(lerp(0, item.fullText.length, lineT));
      item.code.textContent = item.fullText.slice(0, charCount);
    });
  },

  destroy(els) { els.root.remove(); },
};
