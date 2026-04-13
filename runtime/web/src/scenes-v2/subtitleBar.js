import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  clamp,
  smoothstep,
  toNumber,
  getSafeZone,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "subtitleBar",
  type: "dom",
  name: "Subtitle Bar",
  category: "Overlay",
  tags: ["subtitle", "caption", "text", "overlay", "typewriter", "bottom"],
  description: "Bottom-centered subtitle bar with semi-transparent background and character-by-character typewriter entrance effect.",

  params: {
    text:     { type: "string", default: "Subtitle text", desc: "Subtitle content" },
    fontSize: { type: "number", default: 0.025, desc: "Font size relative to short edge", min: 0.01, max: 0.06 },
    bgColor:  { type: "string", default: "rgba(0,0,0,0.6)", desc: "Background color of the subtitle bar" },
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
    const safeZone = getSafeZone(W, H);

    const text = String(params.text || "Subtitle text");
    const fontRatio = toNumber(params.fontSize, 0.025);
    const fontSize = Math.round(S * fontRatio);
    const bgColor = String(params.bgColor || "rgba(0,0,0,0.6)");
    const radius = Math.round(S * 0.008);
    const padding = Math.round(S * 0.012);
    const root = createRoot(container, [
      "display:flex",
      "align-items:flex-end",
      "justify-content:center",
      `padding:${Math.round(safeZone.top)}px ${Math.round(safeZone.right)}px ${Math.round(safeZone.bottom)}px ${Math.round(safeZone.left)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const bar = createNode("div", [
      `background:${bgColor}`,
      `border-radius:${radius}px`,
      `padding:${padding}px ${Math.round(padding * 1.5)}px`,
      `font-size:${fontSize}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:400",
      "color:#ffffff",
      "line-height:1.5",
      "text-align:center",
      "max-width:100%",
      "word-break:break-word",
      "overflow-wrap:break-word",
      "opacity:0",
      "will-change:opacity",
    ].join(";"));

    const textEl = createNode("span", "", "");
    bar.appendChild(textEl);
    root.appendChild(bar);

    return { root, bar, textEl, fullText: text };
  },

  update(els, localT) {
    const t = clamp(localT);
    const text = els.fullText;
    const len = text.length;

    const barEnter = smoothstep(0, 0.08, t);
    const exitProgress = smoothstep(0.9, 1, t);
    els.bar.style.opacity = String(barEnter * (1 - exitProgress));

    const typeStart = 0.05;
    const typeEnd = 0.7;
    const typeProgress = clamp((t - typeStart) / (typeEnd - typeStart));
    const visibleChars = Math.round(len * typeProgress);

    els.textEl.textContent = text.slice(0, visibleChars);
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
