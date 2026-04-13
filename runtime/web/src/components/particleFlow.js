import {
  createRoot, toNumber, clamp, hashFloat,
} from '../core/scenes-v2-shared.js';

export default {
  id: "particleFlow",
  type: "canvas",
  name: "Particle Flow (16:9)",
  category: "Background",
  ratio: "any",
  tags: ["particle", "flow", "background", "canvas"],
  description: "Canvas 粒子流背景动画。1920x1080 专用",
  params: {
    count:    { type: "number", default: 80,        desc: "粒子数量" },
    color:    { type: "string", default: "#ffffff", desc: "粒子颜色" },
    maxSize:  { type: "number", default: 3,         desc: "最大粒子半径(px)" },
    speed:    { type: "number", default: 0.5,       desc: "流动速度" },
    opacity:  { type: "number", default: 0.4,       desc: "整体不透明度" },
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
    const count = clamp(Math.round(toNumber(p.count, 80)), 1, 500);
    const color = p.color || "#ffffff";
    const maxSize = toNumber(p.maxSize, 3);
    const speed = toNumber(p.speed, 0.5);
    const opacity = clamp(toNumber(p.opacity, 0.4), 0, 1);

    // pre-generate particles with deterministic randomness
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: hashFloat(i, "x") * 1920,
        y: hashFloat(i, "y") * 1080,
        r: 0.5 + hashFloat(i, "r") * maxSize,
        vx: (hashFloat(i, "vx") - 0.5) * 60,
        vy: (hashFloat(i, "vy") - 0.3) * 40,
        alpha: 0.3 + hashFloat(i, "a") * 0.7,
      });
    }

    return { root, canvas, ctx, particles, color, speed, opacity };
  },

  update(els, localT) {
    const { ctx, canvas, particles, color, speed, opacity } = els;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = opacity;

    for (const p of particles) {
      const x = ((p.x + p.vx * localT * speed) % W + W) % W;
      const y = ((p.y + p.vy * localT * speed) % H + H) % H;

      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity * p.alpha;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  },

  destroy(els) {
    els.root.remove();
  },
};
