import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "splitText",
  type: "dom",
  name: "Split Text",
  category: "Typography",
  defaultParams: {
    text: "CREATIVE",
    fontSize: 96,
    color: "#ffffff",
    splitDelay: 0.05,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;overflow:hidden");
    const fontSize = toNumber(params.fontSize, 96);
    const color = params.color || "#ffffff";
    const wrap = createNode("div", "position:relative;display:flex;flex-direction:column;align-items:center;gap:0");
    const topHalf = createNode("div", [
      "overflow:hidden",
      `height:${fontSize * 0.55}px`,
      "will-change:transform,opacity",
      "opacity:0",
    ].join(";"));
    const topText = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "font-weight:900",
      `color:${color}`,
      "letter-spacing:0.04em",
      "line-height:1",
    ].join(";"), params.text || "CREATIVE");
    topHalf.appendChild(topText);
    const bottomHalf = createNode("div", [
      "overflow:hidden",
      `height:${fontSize * 0.55}px`,
      "will-change:transform,opacity",
      "opacity:0",
    ].join(";"));
    const bottomText = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "font-weight:900",
      `color:${color}`,
      "letter-spacing:0.04em",
      "line-height:1",
      `margin-top:${-fontSize * 0.55}px`,
    ].join(";"), params.text || "CREATIVE");
    bottomHalf.appendChild(bottomText);
    wrap.appendChild(topHalf);
    wrap.appendChild(bottomHalf);
    root.appendChild(wrap);
    return { root, topHalf, bottomHalf };
  },

  update(els, localT, params) {
    const delay = toNumber(params.splitDelay, 0.05);
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const topT = easeOutCubic(smoothstep(0, 0.12, localT));
    const botT = easeOutCubic(smoothstep(delay, 0.12 + delay, localT));
    els.topHalf.style.opacity = topT * exitAlpha;
    els.topHalf.style.transform = `translateY(${(1 - topT) * -40}px)`;
    els.bottomHalf.style.opacity = botT * exitAlpha;
    els.bottomHalf.style.transform = `translateY(${(1 - botT) * 40}px)`;
  },

  destroy(els) { els.root.remove(); },
};
