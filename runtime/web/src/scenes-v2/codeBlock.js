import {
  MONO_FONT_STACK,
  SANS_FONT_STACK,
  createRoot,
  createNode,
  smoothstep,
  easeOutCubic,
  clamp,
  normalizeLines,
  escapeHtml,
  getStageSize,
} from "../scenes-v2-shared.js";

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "import", "export", "from", "default", "class", "new", "this", "async",
  "await", "try", "catch", "throw", "switch", "case", "break", "continue",
  "true", "false", "null", "undefined", "typeof", "instanceof", "in", "of",
  "def", "fn", "pub", "use", "mod", "struct", "enum", "impl", "trait", "self",
  "mut", "match", "loop", "type", "interface", "extends", "implements",
]);

function highlightLine(text) {
  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    const commentMatch = remaining.match(/^(\/\/.*)/);
    if (commentMatch) {
      tokens.push({ type: "comment", value: commentMatch[1] });
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    const stringMatch = remaining.match(/^("[^"]*"|'[^']*'|`[^`]*`)/);
    if (stringMatch) {
      tokens.push({ type: "string", value: stringMatch[1] });
      remaining = remaining.slice(stringMatch[1].length);
      continue;
    }

    const wordMatch = remaining.match(/^([a-zA-Z_$][\w$]*)/);
    if (wordMatch) {
      const word = wordMatch[1];
      const tokenType = KEYWORDS.has(word) ? "keyword" : "ident";
      tokens.push({ type: tokenType, value: word });
      remaining = remaining.slice(word.length);
      continue;
    }

    const numberMatch = remaining.match(/^(\d+\.?\d*)/);
    if (numberMatch) {
      tokens.push({ type: "number", value: numberMatch[1] });
      remaining = remaining.slice(numberMatch[1].length);
      continue;
    }

    tokens.push({ type: "plain", value: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

const TOKEN_COLORS = {
  keyword: "#ff7b72",
  string: "#a5d6a7",
  comment: "#6b7280",
  number: "#79c0ff",
  ident: "#e0e0e0",
  plain: "#d0d0d0",
};

export default {
  id: "codeBlock",
  type: "dom",
  name: "Code Block",
  category: "Code",
  tags: ["code", "terminal", "syntax", "highlight", "programming", "developer"],
  description: "Adaptive code display with dark terminal window, traffic light dots, and simple syntax highlighting",

  params: {
    code: { type: "string", default: "const greeting = \"Hello, world!\";\nconsole.log(greeting);", desc: "Code content" },
    language: { type: "string", default: "javascript", desc: "Language name for display" },
    fontSize: { type: "number", default: 0.02, desc: "Font size relative to short edge", min: 0.01, max: 0.04 },
    title: { type: "string", default: "main.js", desc: "Window title bar text" },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);
    const S = Math.min(W, H);

    const code = String(params.code || "");
    const title = String(params.title || "main.js");
    const fontSize = S * (params.fontSize || 0.02);
    const padding = S * 0.025;
    const borderRadius = S * 0.012;
    const dotSize = S * 0.008;

    const root = createRoot(container, [
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `padding:${Math.round(S * 0.04)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const window = createNode("div", [
      "background:rgba(17,17,27,0.95)",
      `border-radius:${Math.round(borderRadius)}px`,
      "box-shadow:0 8px 32px rgba(0,0,0,0.5),0 2px 8px rgba(0,0,0,0.3)",
      "overflow:hidden",
      "max-width:90%",
      "min-width:40%",
      "opacity:0",
      "will-change:opacity",
    ].join(";"));

    const titleBar = createNode("div", [
      "display:flex",
      "align-items:center",
      `gap:${Math.round(S * 0.006)}px`,
      `padding:${Math.round(S * 0.01)}px ${Math.round(padding)}px`,
      "background:rgba(30,30,46,0.9)",
      "border-bottom:1px solid rgba(255,255,255,0.06)",
    ].join(";"));

    const dotColors = ["#ff5f57", "#ffbd2e", "#28c840"];
    for (let d = 0; d < 3; d += 1) {
      const dot = createNode("span", [
        `width:${Math.round(dotSize)}px`,
        `height:${Math.round(dotSize)}px`,
        "border-radius:50%",
        `background:${dotColors[d]}`,
      ].join(";"));
      titleBar.appendChild(dot);
    }

    const titleText = createNode("span", [
      `font-size:${Math.round(fontSize * 0.8)}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:500",
      "color:rgba(255,255,255,0.4)",
      `margin-left:${Math.round(S * 0.01)}px`,
    ].join(";"), title);
    titleBar.appendChild(titleText);
    window.appendChild(titleBar);

    const codeArea = createNode("div", [
      `padding:${Math.round(padding)}px`,
      "overflow-x:auto",
    ].join(";"));

    const lines = normalizeLines(code);
    const lineEls = [];
    for (let i = 0; i < lines.length; i += 1) {
      const lineWrap = createNode("div", [
        "display:flex",
        `min-height:${Math.round(fontSize * 1.6)}px`,
        "align-items:center",
        "opacity:0",
        "will-change:opacity",
      ].join(";"));

      const lineNum = createNode("span", [
        `font-size:${Math.round(fontSize * 0.85)}px`,
        `font-family:${MONO_FONT_STACK}`,
        "color:rgba(255,255,255,0.2)",
        `min-width:${Math.round(fontSize * 2.5)}px`,
        "text-align:right",
        `margin-right:${Math.round(S * 0.012)}px`,
        "flex-shrink:0",
        "user-select:none",
      ].join(";"), String(i + 1));
      lineWrap.appendChild(lineNum);

      const lineContent = createNode("span", [
        `font-size:${Math.round(fontSize)}px`,
        `font-family:${MONO_FONT_STACK}`,
        "white-space:pre",
        "line-height:1.6",
      ].join(";"));

      const tokens = highlightLine(lines[i]);
      for (const token of tokens) {
        const tokenSpan = createNode("span", `color:${TOKEN_COLORS[token.type] || "#d0d0d0"}`, token.value);
        lineContent.appendChild(tokenSpan);
      }

      lineWrap.appendChild(lineContent);
      codeArea.appendChild(lineWrap);
      lineEls.push(lineWrap);
    }

    window.appendChild(codeArea);
    root.appendChild(window);

    return { root, window, lineEls, S };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const lineCount = els.lineEls.length;

    const windowEnter = easeOutCubic(smoothstep(0, 0.15, t));
    const windowExit = smoothstep(0.85, 1, t);
    els.window.style.opacity = String(windowEnter * (1 - windowExit));

    const staggerTotal = Math.min(0.5, lineCount * 0.02);
    for (let i = 0; i < lineCount; i += 1) {
      const lineStart = 0.1 + (i / Math.max(1, lineCount - 1)) * staggerTotal;
      const enterEnd = lineStart + 0.15;

      const enterProgress = easeOutCubic(smoothstep(lineStart, enterEnd, t));
      const exitProgress = smoothstep(0.85, 1, t);
      const opacity = enterProgress * (1 - exitProgress);

      els.lineEls[i].style.opacity = String(opacity);
    }
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
