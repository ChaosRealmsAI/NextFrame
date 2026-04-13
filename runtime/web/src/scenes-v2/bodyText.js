import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  smoothstep,
  easeOutCubic,
  clamp,
  normalizeLines,
  getSafeZone,
  getStageSize,
  resolveSize,
} from "../scenes-v2-shared.js";

export default {
  id: "bodyText",
  type: "dom",
  name: "Body Text",
  category: "Typography",
  tags: ["text", "paragraph", "body", "fade", "stagger", "reading"],
  description: "Adaptive paragraph text with multi-line support and per-line stagger fade-in entrance",

  params: {
    text: { type: "string", default: "Your text here.\nSecond line of text.", desc: "Body text, newlines split into lines" },
    fontSize: { type: "number", default: 0.028, desc: "Font size as a ratio of the short edge", min: 0.015, max: 0.06 },
    color: { type: "string", default: "#f0f0f0", desc: "Text color" },
    lineHeight: { type: "number", default: 1.6, desc: "Line height multiplier", min: 1, max: 3 },
    stagger: { type: "number", default: 0.06, desc: "Stagger delay per line (in localT units)", min: 0.01, max: 0.3 },
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
    const fontSize = resolveSize(params.fontSize, S, 0.028);
    const color = params.color || "#f0f0f0";
    const lineHeight = params.lineHeight || 1.6;
    const lines = normalizeLines(text).filter((line) => line.trim().length > 0);

    const root = createRoot(container, [
      "display:flex",
      "flex-direction:column",
      "justify-content:center",
      `padding:${Math.round(safeZone.top)}px ${Math.round(safeZone.right)}px ${Math.round(safeZone.bottom)}px ${Math.round(safeZone.left)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const lineEls = [];
    for (let i = 0; i < lines.length; i += 1) {
      const lineEl = createNode("div", [
        `font-size:${Math.round(fontSize)}px`,
        `font-family:${SANS_FONT_STACK}`,
        "font-weight:400",
        `color:${color}`,
        `line-height:${lineHeight}`,
        "opacity:0",
        "will-change:opacity",
        "width:min(100%, 80ch)",
        "max-width:100%",
        "overflow:hidden",
        "word-break:break-word",
        "overflow-wrap:break-word",
      ].join(";"), lines[i]);
      root.appendChild(lineEl);
      lineEls.push(lineEl);
    }

    return { root, lineEls, S };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const staggerDelay = params.stagger || 0.06;
    const lineCount = els.lineEls.length;

    for (let i = 0; i < lineCount; i += 1) {
      const lineStart = i * staggerDelay * 0.3;
      const enterEnd = lineStart + 0.3;
      const exitStart = 0.8;

      const enterProgress = easeOutCubic(smoothstep(lineStart, Math.min(enterEnd, 0.3), t));
      const exitProgress = smoothstep(exitStart, 1, t);
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
