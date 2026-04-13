import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "auroraGradient",
  type: "canvas",
  name: "Aurora Gradient",
  category: "Backgrounds",
  tags: ["background", "gradient", "aurora", "glow", "ambient", "dark", "animated"],
  description: "极光渐变背景，多色光斑缓慢漂移，叠加胶片颗粒感，适合作为场景底层背景",
  params: {
    hueA:      { type: "number", default: 220, desc: "第一色光色相 (0-360)", min: 0, max: 360 },
    hueB:      { type: "number", default: 280, desc: "第二色光色相 (0-360)", min: 0, max: 360 },
    hueC:      { type: "number", default: 180, desc: "第三色光色相 (0-360)", min: 0, max: 360 },
    intensity: { type: "number", default: 0.7, desc: "光晕强度 (0-1)", min: 0, max: 1 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);
    return canvas;
  },

  update(canvas, localT, params) {
    const ctx = canvas.getContext("2d");
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const W = canvas.width;
    const H = canvas.height;

    const hueA = toNumber(params.hueA, 220);
    const hueB = toNumber(params.hueB, 280);
    const hueC = toNumber(params.hueC, 180);
    const intensity = clamp(toNumber(params.intensity, 0.7), 0, 1);

    // Dark background
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    const t = localT * 0.15;
    const orbs = [
      { hue: hueA, cx: 0.3 + 0.2 * Math.sin(t * 0.7), cy: 0.4 + 0.15 * Math.cos(t * 0.5), r: 0.45 },
      { hue: hueB, cx: 0.7 + 0.15 * Math.cos(t * 0.6), cy: 0.3 + 0.2 * Math.sin(t * 0.8), r: 0.5 },
      { hue: hueC, cx: 0.5 + 0.25 * Math.sin(t * 0.4 + 1), cy: 0.7 + 0.1 * Math.cos(t * 0.9), r: 0.4 },
      { hue: (hueA + hueB) / 2, cx: 0.4 + 0.1 * Math.cos(t * 1.1), cy: 0.5 + 0.15 * Math.sin(t * 0.3), r: 0.35 },
    ];

    for (const orb of orbs) {
      const cx = orb.cx * W;
      const cy = orb.cy * H;
      const radius = orb.r * Math.max(W, H);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const alpha = intensity * 0.35;
      grad.addColorStop(0, `hsla(${orb.hue}, 80%, 55%, ${alpha})`);
      grad.addColorStop(0.4, `hsla(${orb.hue}, 70%, 40%, ${alpha * 0.5})`);
      grad.addColorStop(1, `hsla(${orb.hue}, 60%, 20%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = "source-over";
  },

  destroy(canvas) {
    canvas.remove();
  },
};
