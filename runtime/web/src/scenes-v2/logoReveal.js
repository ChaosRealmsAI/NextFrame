import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
} from "../scenes-v2-shared.js";

export default {
  id: "logoReveal",
  type: "dom",
  name: "Logo Reveal",
  category: "Media",
  defaultParams: {
    src: "",
    size: 200,
    glowColor: "#6ee7ff",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center");
    const size = toNumber(params.size, 200);
    const glowColor = params.glowColor || "#6ee7ff";

    const wrap = createNode("div", [
      "position:relative",
      `width:${size}px;height:${size}px`,
      "will-change:opacity,transform",
      "opacity:0",
    ].join(";"));

    const img = document.createElement("img");
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;position:relative;z-index:1";
    if (params.src) img.src = params.src;
    wrap.appendChild(img);

    const glow = createNode("div", [
      "position:absolute;top:0;left:-40%;width:30%;height:100%",
      `background:linear-gradient(90deg,transparent,${glowColor}88,transparent)`,
      "will-change:transform;opacity:0;z-index:2",
      "pointer-events:none;filter:blur(8px)",
    ].join(";"));
    wrap.appendChild(glow);

    root.appendChild(wrap);
    return { root, wrap, glow };
  },

  update(els, localT, params) {
    const fadeIn = smoothstep(0, 0.12, localT);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);
    const scale = 0.8 + easeOutCubic(fadeIn) * 0.2;

    els.wrap.style.opacity = fadeIn * fadeOut;
    els.wrap.style.transform = `scale(${scale})`;

    // Glow sweep: active between 0.1 and 0.5
    const sweepT = smoothstep(0.1, 0.5, localT);
    const glowX = -40 + sweepT * 180; // percent
    els.glow.style.opacity = sweepT < 1 ? 0.9 : 0;
    els.glow.style.transform = `translateX(${glowX}%)`;
  },

  destroy(els) { els.root.remove(); },
};
