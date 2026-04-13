import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  normalizeArray, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const DEFAULT_LAYERS = [
  { text: "Background", speed: 0.3, color: "rgba(110,231,255,0.4)", size: 48 },
  { text: "Middle", speed: 0.6, color: "rgba(167,139,250,0.6)", size: 64 },
  { text: "Foreground", speed: 1, color: "#ffffff", size: 80 },
];

export default {
  id: "parallaxStack",
  type: "dom",
  name: "Parallax Stack",
  category: "Motion Graphics",
  defaultParams: {
    layers: DEFAULT_LAYERS,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center");
    const layers = normalizeArray(params.layers, DEFAULT_LAYERS);
    const divs = layers.map((layer) => {
      const size = toNumber(layer.size, 48);
      const color = layer.color || "#ffffff";
      const div = createNode("div", [
        "position:absolute;text-align:center;white-space:nowrap",
        `font-family:${SANS_FONT_STACK}`,
        `font-size:${size}px;font-weight:700`,
        `color:${color}`,
        "will-change:transform,opacity;opacity:0",
        `text-shadow:0 0 20px ${color}44`,
      ].join(";"), layer.text || "");
      root.appendChild(div);
      return { div, speed: toNumber(layer.speed, 0.5) };
    });
    return { root, divs };
  },

  update(els, localT) {
    const fadeIn = smoothstep(0, 0.15, localT);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);
    const alpha = fadeIn * fadeOut;

    // Parallax offset: each layer moves at different speed
    const baseOffset = (localT - 0.5) * 200; // px range

    els.divs.forEach((item, i) => {
      const enterT = easeOutCubic(smoothstep(0.02 + i * 0.04, 0.15 + i * 0.04, localT));
      const y = baseOffset * item.speed + (1 - enterT) * 60;
      item.div.style.opacity = enterT * alpha;
      item.div.style.transform = `translateY(${y}px)`;
    });
  },

  destroy(els) { els.root.remove(); },
};
