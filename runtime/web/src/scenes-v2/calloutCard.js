import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  clamp,
  easeOutBack,
  smoothstep,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "calloutCard",
  type: "dom",
  name: "Callout Card",
  category: "Cards",
  tags: ["card", "callout", "icon", "title", "description", "scale"],
  description: "Adaptive callout card with icon, title, and description. Scale-in entrance with easeOutBack easing.",

  params: {
    icon:        { type: "string", default: "\u{1F680}", desc: "Emoji icon displayed at the top" },
    title:       { type: "string", default: "Feature", desc: "Card title text" },
    description: { type: "string", default: "Description text", desc: "Card body description" },
    bgColor:     { type: "string", default: "rgba(110,231,255,0.08)", desc: "Card background color" },
    borderColor: { type: "string", default: "#6ee7ff", desc: "Card border color" },
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

    const icon = String(params.icon || "\u{1F680}");
    const title = String(params.title || "Feature");
    const description = String(params.description || "Description text");
    const bgColor = String(params.bgColor || "rgba(110,231,255,0.08)");
    const borderColor = String(params.borderColor || "#6ee7ff");

    const iconSize = Math.round(S * 0.04);
    const titleSize = Math.round(S * 0.03);
    const descSize = Math.round(S * 0.02);
    const radius = Math.round(S * 0.015);
    const padding = Math.round(S * 0.025);
    const gap = Math.round(S * 0.012);

    const root = createRoot(container, "display:flex;align-items:center;justify-content:center");

    const card = createNode("div", [
      `background:${bgColor}`,
      `border:1px solid ${borderColor}`,
      `border-radius:${radius}px`,
      `padding:${padding}px`,
      "display:flex",
      "flex-direction:column",
      `gap:${gap}px`,
      `max-width:${Math.round(S * 0.4)}px`,
      "transform:scale(0)",
      "opacity:0",
      "will-change:transform,opacity",
    ].join(";"));

    const iconEl = createNode("div", [
      `font-size:${iconSize}px`,
      "line-height:1",
    ].join(";"), icon);

    const titleEl = createNode("div", [
      `font-size:${titleSize}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:700",
      "color:#ffffff",
      "line-height:1.3",
    ].join(";"), title);

    const descEl = createNode("div", [
      `font-size:${descSize}px`,
      `font-family:${SANS_FONT_STACK}`,
      "font-weight:400",
      "color:rgba(255,255,255,0.7)",
      "line-height:1.5",
    ].join(";"), description);

    card.appendChild(iconEl);
    card.appendChild(titleEl);
    card.appendChild(descEl);
    root.appendChild(card);

    return { root, card };
  },

  update(els, localT) {
    const t = clamp(localT);
    const enterProgress = easeOutBack(smoothstep(0, 0.4, t));
    const exitProgress = smoothstep(0.85, 1, t);

    const scale = enterProgress * (1 - exitProgress * 0.3);
    const opacity = enterProgress * (1 - exitProgress);

    els.card.style.transform = `scale(${scale})`;
    els.card.style.opacity = String(opacity);
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
