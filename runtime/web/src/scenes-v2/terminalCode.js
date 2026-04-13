import {
  createRoot, createNode, smoothstep, toNumber,
  MONO_FONT_STACK, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

// terminalCode — 终端风格代码窗口，带标题栏三圆点 + JSON 语法高亮
// type: "dom"
// params: { title, lines: [{tokens:[{text,color}]}], lineHeight }

export default {
  id: "terminalCode",
  type: "dom",
  name: "Terminal Code Window",
  category: "Code",
  tags: ["terminal", "code", "monospace", "codeblock", "window", "programming"],
  description: "仿终端窗口样式的代码内容展示组件",
  params: {
    title:      { type: "string", default: "schema.json", desc: "窗口标题栏文字" },
    lines:      { type: "array",  default: [],             desc: "代码行数组（含 text/color）" },
    lineHeight: { type: "number", default: 1.75,           desc: "行高倍数", min: 1, max: 3 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const lineHeight = toNumber(params.lineHeight, 1.75);

    const root = createRoot(container, [
      "display:flex",
      "flex-direction:column",
      "padding:0",
    ].join(";"));

    // ── Window frame ─────────────────────────────────────────────────
    const win = createNode("div", [
      "background:#111111",
      "border-radius:16px",
      "box-shadow:0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
      "overflow:hidden",
      "width:100%",
      "height:100%",
      "display:flex",
      "flex-direction:column",
      "will-change:opacity,transform",
      "opacity:0",
    ].join(";"));

    // ── Title bar ────────────────────────────────────────────────────
    const titleBar = createNode("div", [
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:12px 16px",
      "background:#1a1a1a",
      "border-bottom:1px solid rgba(255,255,255,0.07)",
      "flex-shrink:0",
    ].join(";"));

    // Traffic lights
    const dots = [
      { color: "#ff5f56" },
      { color: "#ffbd2e" },
      { color: "#27c93f" },
    ];
    dots.forEach(({ color }) => {
      const dot = createNode("div", [
        `background:${color}`,
        "width:13px",
        "height:13px",
        "border-radius:50%",
        "flex-shrink:0",
      ].join(";"));
      titleBar.appendChild(dot);
    });

    // Spacer
    const spacer = createNode("div", "flex:1");
    titleBar.appendChild(spacer);

    // Title text
    const titleEl = createNode("span", [
      `font-family:${MONO_FONT_STACK}`,
      "font-size:13px",
      "color:rgba(255,255,255,0.45)",
      "letter-spacing:0.02em",
    ].join(";"), params.title || "");
    titleBar.appendChild(titleEl);

    const spacer2 = createNode("div", "flex:1");
    titleBar.appendChild(spacer2);

    win.appendChild(titleBar);

    // ── Code area ────────────────────────────────────────────────────
    const codeArea = createNode("div", [
      "padding:20px 24px",
      "flex:1",
      "overflow:hidden",
      "display:flex",
      "flex-direction:column",
      "justify-content:center",
      "gap:2px",
    ].join(";"));

    const lines = Array.isArray(params.lines) ? params.lines : [];
    const lineEls = lines.map((line, idx) => {
      const row = createNode("div", [
        "display:flex",
        "align-items:baseline",
        "will-change:opacity,transform",
        "opacity:0",
        "transform:translateX(-8px)",
      ].join(";"));

      // Line number
      const lineNum = createNode("span", [
        `font-family:${MONO_FONT_STACK}`,
        "font-size:14px",
        "color:rgba(255,255,255,0.2)",
        "min-width:32px",
        "text-align:right",
        "padding-right:16px",
        "user-select:none",
        "flex-shrink:0",
        `line-height:${lineHeight}`,
      ].join(";"), String(idx + 1));
      row.appendChild(lineNum);

      // Tokens
      const tokens = Array.isArray(line.tokens) ? line.tokens : [];
      tokens.forEach(({ text, color }) => {
        const span = createNode("span", [
          `font-family:${MONO_FONT_STACK}`,
          "font-size:17px",
          `color:${color || "rgba(245,236,224,0.85)"}`,
          "white-space:pre",
          `line-height:${lineHeight}`,
        ].join(";"), text || "");
        row.appendChild(span);
      });

      codeArea.appendChild(row);
      return row;
    });

    win.appendChild(codeArea);
    root.appendChild(win);

    return { root, win, lineEls };
  },

  update(els, localT, params) {
    const enterT = smoothstep(0, 0.06, localT);
    const exitT = 1 - smoothstep(0.88, 1, localT);
    const alpha = enterT * exitT;

    els.win.style.opacity = alpha;
    els.win.style.transform = `translateY(${(1 - enterT) * 20}px)`;

    const total = els.lineEls.length;
    const staggerEnd = Math.min(0.55, 0.1 + total * 0.06);

    els.lineEls.forEach((row, i) => {
      const lineStart = 0.06 + (i / Math.max(1, total)) * (staggerEnd - 0.06);
      const lineT = smoothstep(lineStart, lineStart + 0.08, localT);
      const a = lineT * exitT;
      row.style.opacity = a;
      row.style.transform = `translateX(${(1 - lineT) * -8}px)`;
    });
  },

  destroy(els) { els.root.remove(); },
};
