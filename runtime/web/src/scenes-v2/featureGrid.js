import {
  createRoot, createNode, smoothstep, easeOutCubic, clamp,
  toNumber, resolveSize, getStageSize, SANS_FONT_STACK,
  normalizeArray, shrinkTextToFit,
} from "../scenes-v2-shared.js";

export default {
  id: "featureGrid",
  type: "dom",
  name: "Feature Grid",
  category: "Cards",
  tags: ["grid", "features", "2x2", "cards", "emoji", "layout", "product"],
  description: "2x2 feature cards — each card has an emoji icon, title and description line",

  params: {
    icons:       { type: "array",  default: ["⚡", "🎯", "🛡️", "📊"], desc: "Emoji icons (4 items)" },
    titles:      { type: "array",  default: ["Fast", "Precise", "Secure", "Analytics"], desc: "Card titles" },
    descs:       { type: "array",  default: ["10x speed", "Zero errors", "End-to-end", "Real-time"], desc: "Card descriptions" },
    iconSize:    { type: "number", default: 0.06,  desc: "Emoji icon size (ratio or px or keyword)", min: 0.03, max: 0.12 },
    titleSize:   { type: "number", default: 0.035, desc: "Title font size as a ratio of the short edge (or px/keyword)", min: 0.015, max: 0.08 },
    descSize:    { type: "number", default: 0.022, desc: "Desc font size as a ratio of the short edge (or px/keyword)", min: 0.01, max: 0.05 },
    bgColor:     { type: "string", default: "rgba(255,255,255,0.05)", desc: "Card background" },
    accentColor: { type: "string", default: "#a78bfa", desc: "Title accent color" },
    gap:         { type: "number", default: 0.02, desc: "Grid gap (ratio of S)", min: 0, max: 0.08 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const stage = getStageSize(container);
    const W = container.clientWidth || stage.width;
    const H = container.clientHeight || stage.height;
    const S = Math.min(stage.width || W, stage.height || H);

    const icons  = normalizeArray(params.icons,  this.params.icons.default);
    const titles = normalizeArray(params.titles, this.params.titles.default);
    const descs  = normalizeArray(params.descs,  this.params.descs.default);

    const iconFs  = resolveSize(params.iconSize,  S, 0.06);
    const titleFs = resolveSize(params.titleSize, S, 0.035);
    const descFs  = resolveSize(params.descSize,  S, 0.022);
    const gap     = toNumber(params.gap, 0.02) * S;
    const bgColor = params.bgColor     || "rgba(255,255,255,0.05)";
    const accent  = params.accentColor || "#a78bfa";
    const pad     = S * 0.025;

    const root = createRoot(container,
      "display:flex;align-items:center;justify-content:center;"
    );

    const grid = createNode("div");
    grid.style.cssText = [
      "display:grid",
      "grid-template-columns:1fr 1fr",
      "grid-template-rows:1fr 1fr",
      `gap:${gap}px`,
      "width:90%",
      "height:90%",
    ].join(";");
    root.appendChild(grid);

    const cells = [];

    for (let i = 0; i < 4; i++) {
      const cell = createNode("div");
      cell.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "align-items:flex-start",
        "justify-content:center",
        `padding:${pad}px`,
        `background:${bgColor}`,
        `border-radius:${S * 0.015}px`,
        "border:1px solid rgba(255,255,255,0.08)",
        "will-change:opacity,transform",
        "opacity:0",
        "transform:scale(0.92)",
        "overflow:hidden",
        "max-width:100%",
      ].join(";");

      const iconEl = createNode("div");
      iconEl.style.cssText = [
        `font-size:${iconFs}px`,
        `line-height:1`,
        `margin-bottom:${S * 0.01}px`,
        "max-width:100%",
        "overflow:hidden",
      ].join(";");
      iconEl.textContent = String(icons[i] ?? "✦");

      const titleEl = createNode("div");
      titleEl.style.cssText = [
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${titleFs}px`,
        `color:${accent}`,
        "font-weight:700",
        "line-height:1.2",
        `margin-bottom:${S * 0.006}px`,
        "word-break:break-word",
        "overflow-wrap:break-word",
        "overflow:hidden",
        "max-width:100%",
      ].join(";");
      titleEl.textContent = String(titles[i] ?? "");

      const descEl = createNode("div");
      descEl.style.cssText = [
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${descFs}px`,
        "color:rgba(200,210,230,0.65)",
        "font-weight:400",
        "line-height:1.4",
        "max-width:100%",
        "overflow:hidden",
        "display:-webkit-box",
        "-webkit-line-clamp:2",
        "-webkit-box-orient:vertical",
        "overflow-wrap:break-word",
        "word-break:break-word",
      ].join(";");
      descEl.textContent = String(descs[i] ?? "");

      cell.appendChild(iconEl);
      cell.appendChild(titleEl);
      cell.appendChild(descEl);
      grid.appendChild(cell);
      shrinkTextToFit(titleEl, { container: cell, minFontSize: Math.round(S * 0.02) });
      cells.push({ cell, iconEl, titleEl, descEl });
    }

    return { root, cells };
  },

  update(els, localT, params) {
    // DOM: localT is 0~1 normalized
    const { cells } = els;
    const stagger = 0.1;

    for (let i = 0; i < 4; i++) {
      const delay = i * stagger;
      const t = clamp((localT - delay) / 0.3, 0, 1);
      const enter = easeOutCubic(t);
      const exit  = smoothstep(1, 0.88, localT);
      const alpha = enter * exit;
      cells[i].cell.style.opacity   = String(alpha);
      cells[i].cell.style.transform = `scale(${0.92 + 0.08 * enter})`;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
