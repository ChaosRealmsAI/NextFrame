import {
  createRoot, createNode, smoothstep, easeOutCubic, clamp,
  toNumber, resolveSize, getStageSize, SANS_FONT_STACK, MONO_FONT_STACK,
  normalizeArray, shrinkTextToFit,
} from "../scenes-v2-shared.js";

export default {
  id: "statsRow",
  type: "dom",
  name: "Stats Row",
  category: "Numbers",
  tags: ["stats", "numbers", "data", "metrics", "kpi", "row", "horizontal"],
  description: "3-5 big numbers in a horizontal row, each with a label below — ideal for KPI slides",

  params: {
    values:    { type: "array",  default: ["12M", "98%", "4.9★"],     desc: "Stat values (3-5 items)" },
    labels:    { type: "array",  default: ["Users", "Uptime", "Rating"], desc: "Stat labels" },
    colors:    { type: "array",  default: ["#6ee7ff", "#a78bfa", "#ffd93d"], desc: "Value colors" },
    valueSize: { type: "number", default: 0.09,  desc: "Value font size as a ratio of the short edge (or px/keyword)", min: 0.04, max: 0.15 },
    labelSize: { type: "number", default: 0.025, desc: "Label font size as a ratio of the short edge (or px/keyword)", min: 0.01, max: 0.06 },
    bgColor:   { type: "string", default: "rgba(255,255,255,0.04)", desc: "Card background color" },
    gap:       { type: "number", default: 0.03, desc: "Gap between cards (ratio of S)", min: 0, max: 0.1 },
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

    const values = normalizeArray(params.values, this.params.values.default);
    const labels = normalizeArray(params.labels, this.params.labels.default);
    const colors = normalizeArray(params.colors, this.params.colors.default);
    const count  = Math.min(Math.max(values.length, 1), 5);

    const valueFs = resolveSize(params.valueSize, S, 0.09);
    const labelFs = resolveSize(params.labelSize, S, 0.025);
    const gap     = toNumber(params.gap, 0.03) * S;
    const bgColor = params.bgColor || "rgba(255,255,255,0.04)";

    const root = createRoot(container,
      "display:flex;align-items:center;justify-content:center;"
    );

    const row = createNode("div");
    row.style.cssText = [
      "display:flex",
      "flex-direction:row",
      "align-items:stretch",
      `gap:${gap}px`,
      "width:90%",
      "height:80%",
    ].join(";");
    root.appendChild(row);

    const cards = [];

    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length] || "#6ee7ff";

      const card = createNode("div");
      card.style.cssText = [
        "flex:1",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        `background:${bgColor}`,
        `border-radius:${S * 0.015}px`,
        `border:1px solid rgba(255,255,255,0.08)`,
        "max-width:100%",
        "overflow:hidden",
        "will-change:opacity,transform",
        "opacity:0",
        `transform:translateY(${S * 0.02}px)`,
      ].join(";");

      const valEl = createNode("div");
      valEl.style.cssText = [
        `font-family:${MONO_FONT_STACK}`,
        `font-size:${valueFs}px`,
        `color:${color}`,
        "font-weight:800",
        "line-height:1.1",
        "letter-spacing:-0.02em",
        "text-align:center",
        "max-width:100%",
        "overflow:hidden",
        "word-break:break-word",
        "overflow-wrap:break-word",
      ].join(";");
      valEl.textContent = String(values[i] ?? "");

      const labelEl = createNode("div");
      labelEl.style.cssText = [
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${labelFs}px`,
        `color:rgba(200,210,230,0.7)`,
        "font-weight:500",
        "text-align:center",
        "letter-spacing:0.04em",
        "text-transform:uppercase",
        `margin-top:${S * 0.008}px`,
        "max-width:100%",
        "overflow:hidden",
        "word-break:break-word",
        "overflow-wrap:break-word",
      ].join(";");
      labelEl.textContent = String(labels[i] ?? "");

      card.appendChild(valEl);
      card.appendChild(labelEl);
      row.appendChild(card);
      shrinkTextToFit(valEl, { container: card, minFontSize: Math.round(S * 0.02) });
      shrinkTextToFit(labelEl, { container: card, minFontSize: Math.round(S * 0.02) });
      cards.push({ card, valEl, labelEl });
    }

    return { root, cards, count };
  },

  update(els, localT, params) {
    // DOM: localT is 0~1 normalized
    const { cards, count } = els;
    const stagger = 0.08;

    for (let i = 0; i < count; i++) {
      const delay = i * stagger;
      const t = clamp((localT - delay) / 0.25, 0, 1);
      const enter = easeOutCubic(t);
      const exit  = smoothstep(1, 0.88, localT);
      const alpha = enter * exit;
      const S_card = 20; // relative translate reference
      cards[i].card.style.opacity  = String(alpha);
      cards[i].card.style.transform = `translateY(${(1 - enter) * S_card}px)`;
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
