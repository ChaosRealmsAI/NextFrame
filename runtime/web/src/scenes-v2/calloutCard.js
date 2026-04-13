import {
  createRoot, createNode, smoothstep, easeOutBack, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "calloutCard",
  type: "dom",
  name: "Callout Card",
  category: "Overlay",
  defaultParams: {
    icon: "\uD83D\uDE80",
    title: "Launch Ready",
    description: "Everything is set up and ready to go. Just hit publish.",
    bgColor: "rgba(30,30,50,0.85)",
    borderColor: "#a78bfa",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center");
    const border = params.borderColor || "#a78bfa";
    const card = createNode("div", [
      `background:${params.bgColor || "rgba(30,30,50,0.85)"}`,
      `border:1px solid ${border}33`,
      "border-radius:16px",
      "padding:32px 36px",
      "max-width:420px",
      "width:85%",
      `box-shadow:0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${border}11`,
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)",
      "will-change:transform,opacity",
      "opacity:0",
      "transform:scale(0.8)",
    ].join(";"));
    const iconEl = createNode("div", [
      "font-size:40px",
      "margin-bottom:14px",
      "line-height:1",
    ].join(";"), params.icon || "\uD83D\uDE80");
    const titleEl = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:22px",
      "font-weight:700",
      "color:rgba(255,255,255,0.95)",
      "margin-bottom:8px",
      "letter-spacing:0.01em",
    ].join(";"), params.title || "");
    const descEl = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:15px",
      "font-weight:400",
      "color:rgba(255,255,255,0.6)",
      "line-height:1.6",
    ].join(";"), params.description || "");
    card.appendChild(iconEl);
    card.appendChild(titleEl);
    card.appendChild(descEl);
    root.appendChild(card);
    return { root, card };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const enterT = smoothstep(0, 0.12, localT);
    const scale = 0.8 + 0.2 * easeOutBack(enterT);
    els.card.style.opacity = enterT * exitAlpha;
    els.card.style.transform = `scale(${scale})`;
  },

  destroy(els) { els.root.remove(); },
};
