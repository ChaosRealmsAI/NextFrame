import {
  createRoot, createNode, smoothstep, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "marquee",
  type: "dom",
  name: "Marquee",
  category: "Typography",
  defaultParams: {
    text: "BREAKING NEWS — NEXTFRAME AI VIDEO EDITOR",
    fontSize: 24,
    speed: 100,
    color: "#fff",
    bgColor: "rgba(0,0,0,0.6)",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:flex-end;padding-bottom:60px");
    const fontSize = toNumber(params.fontSize, 24);
    const bgColor = params.bgColor || "rgba(0,0,0,0.6)";
    const color = params.color || "#fff";

    const bar = createNode("div", [
      "width:100%;overflow:hidden;position:relative",
      `background:${bgColor}`,
      "padding:12px 0",
      "backdrop-filter:blur(8px)",
      "will-change:opacity;opacity:0",
    ].join(";"));

    // Duplicate text for seamless loop
    const fullText = String(params.text || "MARQUEE");
    const repeated = `${fullText}    \u2014    ${fullText}    \u2014    `;
    const textEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "font-weight:600",
      `color:${color}`,
      "white-space:nowrap",
      "display:inline-block",
      "will-change:transform",
      "letter-spacing:0.02em",
    ].join(";"), repeated);

    bar.appendChild(textEl);
    root.appendChild(bar);
    return { root, bar, textEl };
  },

  update(els, localT, params) {
    const fadeIn = smoothstep(0, 0.08, localT);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);
    els.bar.style.opacity = fadeIn * fadeOut;

    const speed = toNumber(params.speed, 100);
    // localT is 0~1; map to pixel offset
    const totalDuration = 1; // the full 0~1 range
    const pixelOffset = localT * speed * 10; // scale up for visible movement
    // Loop by using modulo of half the text width (since we duplicated)
    const textWidth = els.textEl.offsetWidth * 0.5;
    const offset = textWidth > 0 ? pixelOffset % textWidth : pixelOffset;
    els.textEl.style.transform = `translateX(${-offset}px)`;
  },

  destroy(els) { els.root.remove(); },
};
