import {
  createRoot, toNumber, clamp,
} from '../core/scenes-v2-shared.js';

export default {
  id: "vignette",
  type: "canvas",
  name: "Vignette (16:9)",
  category: "Background",
  ratio: "any",
  tags: ["vignette", "overlay", "background", "canvas"],
  description: "全屏 canvas 暗角遮罩。1920x1080 专用",
  params: {
    intensity: { type: "number", default: 0.6,         desc: "暗角强度 0~1" },
    color:     { type: "string", default: "#000000",   desc: "暗角颜色" },
    radius:    { type: "number", default: 0.7,         desc: "亮区半径比例 0~1" },
  },

  get defaultParams() {
    const d = {};
    for (const [k, v] of Object.entries(this.params)) d[k] = v.default;
    return d;
  },

  create(container, params) {
    const p = { ...this.defaultParams, ...params };
    const root = createRoot(container, "width:1920px;height:1080px");

    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.cssText = "width:100%;height:100%;";
    root.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    return {
      root, canvas, ctx,
      intensity: clamp(toNumber(p.intensity, 0.6), 0, 1),
      color: p.color || "#000000",
      radius: clamp(toNumber(p.radius, 0.7), 0.1, 1),
    };
  },

  update(els, localT) {
    const { ctx, canvas, intensity, color, radius } = els;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const innerR = maxR * radius;

    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, maxR);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, color);

    ctx.globalAlpha = intensity;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },

  destroy(els) {
    els.root.remove();
  },
};
