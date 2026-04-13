import {
  clamp,
  toNumber,
  smoothstep,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "vignette",
  type: "canvas",
  name: "Vignette",
  category: "Backgrounds",
  tags: ["vignette", "background", "darkening", "overlay", "gradient", "canvas"],
  description: "Canvas-based vignette effect that darkens edges with a radial gradient. Intensity animates in and out smoothly.",

  params: {
    intensity: { type: "number", default: 0.5, desc: "Darkness intensity at edges (0=none, 1=full black)", min: 0, max: 1 },
    color:     { type: "string", default: "#000000", desc: "Vignette color" },
    radius:    { type: "number", default: 0.7, desc: "Inner radius ratio (0=all dark, 1=no vignette)", min: 0.1, max: 1 },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    return { canvas, ctx, W, H };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const intensity = toNumber(params.intensity, 0.5);
    const color = String(params.color || "#000000");
    const radius = toNumber(params.radius, 0.7);

    const enterProgress = smoothstep(0, 0.15, t);
    const exitProgress = smoothstep(0.9, 1, t);
    const alpha = intensity * enterProgress * (1 - exitProgress);

    const { ctx, W, H } = els;
    ctx.clearRect(0, 0, W, H);

    if (alpha < 0.001) {
      return;
    }

    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.sqrt(cx * cx + cy * cy);
    const innerR = outerR * radius;

    const r = parseInt(color.slice(1, 3), 16) || 0;
    const g = parseInt(color.slice(3, 5), 16) || 0;
    const b = parseInt(color.slice(5, 7), 16) || 0;

    const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},${alpha})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  },

  destroy(els) {
    if (els.canvas && els.canvas.parentNode) {
      els.canvas.parentNode.removeChild(els.canvas);
    }
  },
};
