import {
  createRoot, createNode, smoothstep, lerp, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "subtitleBar",
  type: "dom",
  name: "Subtitle Bar",
  category: "Overlay",
  defaultParams: {
    text: "This is a subtitle that types in character by character.",
    fontSize: 22,
    bgColor: "rgba(0,0,0,0.7)",
    textColor: "#ffffff",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:flex-end;justify-content:center;padding-bottom:8%");
    const fontSize = toNumber(params.fontSize, 22);
    const bar = createNode("div", [
      `background:${params.bgColor || "rgba(0,0,0,0.7)"}`,
      "padding:12px 28px",
      "border-radius:8px",
      "max-width:80%",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "will-change:opacity",
      "opacity:0",
    ].join(";"));
    const textEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "font-weight:400",
      `color:${params.textColor || "#ffffff"}`,
      "line-height:1.5",
      "letter-spacing:0.01em",
    ].join(";"));
    const cursor = createNode("span", [
      "display:inline-block",
      "width:2px",
      `height:${fontSize}px`,
      `background:${params.textColor || "#ffffff"}`,
      "margin-left:2px",
      "vertical-align:text-bottom",
      "will-change:opacity",
    ].join(";"));
    bar.appendChild(textEl);
    bar.appendChild(cursor);
    root.appendChild(bar);
    const fullText = String(params.text || "");
    return { root, bar, textEl, cursor, fullText };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const barT = smoothstep(0, 0.06, localT);
    els.bar.style.opacity = barT * exitAlpha;
    const typeT = smoothstep(0.04, 0.7, localT);
    const charCount = Math.round(lerp(0, els.fullText.length, typeT));
    els.textEl.textContent = els.fullText.slice(0, charCount);
    const blink = Math.sin(localT * 80) > 0 ? 1 : 0.2;
    els.cursor.style.opacity = typeT < 1 ? blink : 0;
  },

  destroy(els) { els.root.remove(); },
};
