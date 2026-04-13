import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  normalizeArray, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "bulletList",
  type: "dom",
  name: "Bullet List",
  category: "Typography",
  defaultParams: {
    items: ["First point", "Second point", "Third point"],
    fontSize: 28,
    bulletColor: "#a78bfa",
    stagger: 0.08,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;justify-content:center;padding:8% 12%");
    const items = normalizeArray(params.items, ["Item"]);
    const fontSize = toNumber(params.fontSize, 28);
    const bulletColor = params.bulletColor || "#a78bfa";
    const rows = items.map((text) => {
      const row = createNode("div", [
        "display:flex",
        "align-items:flex-start",
        "gap:0.6em",
        "margin-bottom:0.7em",
        "will-change:transform,opacity",
        "opacity:0",
        "transform:translateX(-30px)",
      ].join(";"));
      const dot = createNode("span", [
        `width:10px`,
        `height:10px`,
        `min-width:10px`,
        `border-radius:50%`,
        `background:${bulletColor}`,
        `margin-top:${fontSize * 0.35}px`,
        `box-shadow:0 0 12px ${bulletColor}66`,
      ].join(";"));
      const label = createNode("span", [
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${fontSize}px`,
        "font-weight:500",
        "color:rgba(255,255,255,0.92)",
        "line-height:1.5",
        "letter-spacing:0.01em",
      ].join(";"), text);
      row.appendChild(dot);
      row.appendChild(label);
      root.appendChild(row);
      return row;
    });
    return { root, rows };
  },

  update(els, localT, params) {
    const stagger = toNumber(params.stagger, 0.08);
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    els.rows.forEach((row, i) => {
      const enterT = smoothstep(0.02 + i * stagger, 0.12 + i * stagger, localT);
      const progress = easeOutCubic(enterT);
      const x = (1 - progress) * -30;
      const alpha = progress * exitAlpha;
      row.style.opacity = alpha;
      row.style.transform = `translateX(${x}px)`;
    });
  },

  destroy(els) { els.root.remove(); },
};
