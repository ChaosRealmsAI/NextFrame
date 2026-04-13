import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const ALIGN = { left: "flex-start", center: "center", right: "flex-end" };

export default {
  id: "lowerThird",
  type: "dom",
  name: "Lower Third",
  category: "Overlay",
  defaultParams: {
    title: "John Doe",
    subtitle: "Creative Director",
    accentColor: "#6ee7ff",
    position: "left",
  },

  create(container, params) {
    const root = createRoot(container, [
      "display:flex",
      `justify-content:${ALIGN[params.position] || ALIGN.left}`,
      "align-items:flex-end",
      "padding:0 5% 8%",
    ].join(";"));
    const accent = params.accentColor || "#6ee7ff";
    const wrap = createNode("div", [
      "will-change:transform,opacity",
      "opacity:0",
      "transform:translateX(-40px)",
    ].join(";"));
    const bar = createNode("div", [
      `background:${accent}`,
      "height:3px",
      "width:0",
      "margin-bottom:8px",
      "border-radius:2px",
      `box-shadow:0 0 12px ${accent}66`,
      "will-change:width",
    ].join(";"));
    const title = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:24px",
      "font-weight:700",
      "color:rgba(255,255,255,0.95)",
      "letter-spacing:0.02em",
      "margin-bottom:2px",
    ].join(";"), params.title || "");
    const subtitle = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:14px",
      "font-weight:400",
      `color:${accent}`,
      "letter-spacing:0.06em",
      "opacity:0",
      "will-change:opacity",
    ].join(";"), params.subtitle || "");
    wrap.appendChild(bar);
    wrap.appendChild(title);
    wrap.appendChild(subtitle);
    root.appendChild(wrap);
    return { root, wrap, bar, subtitle };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const slideT = easeOutCubic(smoothstep(0, 0.12, localT));
    els.wrap.style.opacity = slideT * exitAlpha;
    els.wrap.style.transform = `translateX(${(1 - slideT) * -40}px)`;
    const barT = smoothstep(0.05, 0.15, localT);
    els.bar.style.width = `${barT * 60}px`;
    const subT = smoothstep(0.1, 0.18, localT);
    els.subtitle.style.opacity = subT * exitAlpha;
  },

  destroy(els) { els.root.remove(); },
};
