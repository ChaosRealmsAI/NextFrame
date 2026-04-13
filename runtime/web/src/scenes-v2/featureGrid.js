import {
  createRoot, createNode, smoothstep, easeOutBack, toNumber,
  normalizeArray, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const DEFAULT_FEATURES = [
  { icon: "\u26a1", title: "Fast", desc: "Lightning speed rendering" },
  { icon: "\ud83c\udfa8", title: "Beautiful", desc: "Stunning visual quality" },
  { icon: "\ud83e\udde0", title: "Smart", desc: "AI-powered editing" },
  { icon: "\ud83d\udd12", title: "Secure", desc: "Your data stays yours" },
];

export default {
  id: "featureGrid",
  type: "dom",
  name: "Feature Grid",
  category: "Layout",
  defaultParams: {
    features: DEFAULT_FEATURES,
    columns: 2,
    stagger: 0.05,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;padding:40px");
    const features = normalizeArray(params.features, DEFAULT_FEATURES);
    const cols = toNumber(params.columns, 2);

    const grid = createNode("div", [
      "display:grid",
      `grid-template-columns:repeat(${cols}, 1fr)`,
      "gap:20px;max-width:680px;width:100%",
    ].join(";"));

    const cards = features.map((f) => {
      const card = createNode("div", [
        "background:rgba(255,255,255,0.05)",
        "border:1px solid rgba(255,255,255,0.1)",
        "border-radius:14px;padding:24px",
        "will-change:transform,opacity;opacity:0",
        "transform:scale(0.7)",
        "backdrop-filter:blur(4px)",
      ].join(";"));

      const icon = createNode("div", [
        "font-size:32px;margin-bottom:10px",
      ].join(";"), f.icon || "");
      const title = createNode("div", [
        `font-family:${SANS_FONT_STACK}`,
        "font-size:18px;font-weight:700;color:#fff",
        "margin-bottom:6px",
      ].join(";"), f.title || "");
      const desc = createNode("div", [
        `font-family:${SANS_FONT_STACK}`,
        "font-size:13px;color:rgba(255,255,255,0.55)",
        "line-height:1.4",
      ].join(";"), f.desc || "");

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(desc);
      grid.appendChild(card);
      return card;
    });

    root.appendChild(grid);
    return { root, cards };
  },

  update(els, localT, params) {
    const stagger = toNumber(params.stagger, 0.05);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);

    els.cards.forEach((card, i) => {
      const start = 0.03 + i * stagger;
      const enterT = smoothstep(start, start + 0.12, localT);
      const scale = 0.7 + easeOutBack(enterT) * 0.3;
      const alpha = enterT * fadeOut;
      card.style.opacity = alpha;
      card.style.transform = `scale(${scale})`;
    });
  },

  destroy(els) { els.root.remove(); },
};
