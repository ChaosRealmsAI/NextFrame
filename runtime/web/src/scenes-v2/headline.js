import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  normalizeArray, makeLinearGradient, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const DEFAULT_GRADIENT = ["#6ee7ff", "#a78bfa", "#f472b6"];

export default {
  id: "headline",
  type: "dom",
  name: "Kinetic Headline",
  category: "Typography",
  defaultParams: {
    text: "NEXTFRAME",
    subtitle: "AI Video Editor",
    fontSize: 72,
    gradient: DEFAULT_GRADIENT,
    stagger: 0.06,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center");
    const wordsWrap = createNode("div", "display:flex;flex-wrap:wrap;justify-content:center;gap:0 0.3em");
    const words = String(params.text || "NEXTFRAME").trim().split(/\s+/).filter(Boolean);
    const fontSize = toNumber(params.fontSize, 72);
    const grad = makeLinearGradient(normalizeArray(params.gradient, DEFAULT_GRADIENT));
    const spans = words.map((w) => {
      const span = createNode("span", [
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${fontSize}px`,
        "font-weight:900",
        "letter-spacing:-0.02em",
        `background:${grad}`,
        "-webkit-background-clip:text",
        "-webkit-text-fill-color:transparent",
        "background-clip:text",
        "will-change:transform,opacity",
        "display:inline-block",
        "opacity:0",
        "transform:translateY(30px)",
        `text-shadow:0 0 40px rgba(110,231,255,0.3)`,
      ].join(";"), w);
      wordsWrap.appendChild(span);
      return span;
    });
    root.appendChild(wordsWrap);
    const sub = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${Math.max(14, fontSize * 0.22)}px`,
      "font-weight:400",
      "color:rgba(255,255,255,0.55)",
      "letter-spacing:0.08em",
      "margin-top:0.6em",
      "will-change:opacity",
      "opacity:0",
    ].join(";"), params.subtitle || "");
    root.appendChild(sub);
    return { root, spans, sub };
  },

  update(els, localT, params) {
    const stagger = toNumber(params.stagger, 0.06);
    const exitStart = 0.85;
    const exitAlpha = 1 - smoothstep(exitStart, 1, localT);
    els.spans.forEach((span, i) => {
      const enterT = smoothstep(0.0 + i * stagger, 0.12 + i * stagger, localT);
      const progress = easeOutCubic(enterT);
      const y = (1 - progress) * 30;
      const alpha = progress * exitAlpha;
      span.style.opacity = alpha;
      span.style.transform = `translateY(${y}px)`;
    });
    const subEnter = smoothstep(0.1 + els.spans.length * stagger, 0.2 + els.spans.length * stagger, localT);
    els.sub.style.opacity = subEnter * exitAlpha;
  },

  destroy(els) { els.root.remove(); },
};
