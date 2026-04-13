import {
  createRoot, toNumber, normalizeArray, clamp,
} from '../core/scenes-v2-shared.js';

export default {
  id: "auroraGradient",
  type: "canvas",
  name: "Aurora Gradient (16:9)",
  category: "Background",
  ratio: "any",
  tags: ["aurora", "gradient", "background", "canvas"],
  description: "Canvas 极光渐变背景动画。1920x1080 专用",
  params: {
    colors: { type: "array",  default: ["#0f0c29", "#302b63", "#24243e", "#0f0c29"], desc: "渐变色数组" },
    speed:  { type: "number", default: 0.3,  desc: "动画速度" },
    layers: { type: "number", default: 3,    desc: "光带层数" },
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
    const colors = normalizeArray(p.colors, ["#0f0c29", "#302b63", "#24243e", "#0f0c29"]);
    const speed = toNumber(p.speed, 0.3);
    const layerCount = clamp(Math.round(toNumber(p.layers, 3)), 1, 6);

    return { root, canvas, ctx, colors, speed, layerCount };
  },

  update(els, localT) {
    const { ctx, canvas, colors, speed, layerCount } = els;
    const W = canvas.width;
    const H = canvas.height;
    const t = localT * speed;

    // base fill
    ctx.fillStyle = colors[0] || "#0f0c29";
    ctx.fillRect(0, 0, W, H);

    // aurora layers
    for (let layer = 0; layer < layerCount; layer++) {
      const phase = layer * 1.2 + t;
      const yBase = H * (0.3 + layer * 0.15);
      const amplitude = H * 0.12;
      const colorIdx = (layer + 1) % colors.length;
      const color = colors[colorIdx] || "#302b63";

      ctx.save();
      ctx.globalAlpha = 0.4 - layer * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, H);

      for (let x = 0; x <= W; x += 4) {
        const y = yBase +
          Math.sin((x / W) * Math.PI * 2 + phase) * amplitude +
          Math.sin((x / W) * Math.PI * 3.7 + phase * 1.3) * amplitude * 0.5;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  },

  destroy(els) {
    els.root.remove();
  },
};
