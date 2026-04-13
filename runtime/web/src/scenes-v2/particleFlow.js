import { clamp, toNumber, smoothstep, hashFloat, getStageSize } from "../scenes-v2-shared.js";

export default {
  id: "particleFlow",
  type: "canvas",
  name: "Particle Flow",
  category: "Effects",
  tags: ["particles", "flow", "glow", "canvas", "animated", "effects"],
  description: "Glowing particles flowing across the canvas with configurable direction and speed",

  params: {
    count:     { type: "number", default: 150, min: 20, max: 800,   desc: "Number of particles" },
    speed:     { type: "number", default: 30,  min: 5,  max: 200,   desc: "Particle speed (px/s)" },
    color:     { type: "color",  default: "#6ee7ff",                 desc: "Particle color" },
    direction: { type: "number", default: 45,  min: 0,  max: 360,   desc: "Flow direction (degrees)" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);
    const S = Math.min(W, H);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    const count = Math.round(toNumber(params.count, 150));
    const speed = toNumber(params.speed, 30);
    const color = params.color || this.params.color.default;
    const dirDeg = toNumber(params.direction, 45);
    const dirRad = (dirDeg * Math.PI) / 180;
    const dx = Math.cos(dirRad);
    const dy = Math.sin(dirRad);

    const sizeMin = S * 0.002;
    const sizeMax = S * 0.005;

    // Pre-compute particles
    const particles = [];
    for (let i = 0; i < count; i++) {
      const h = hashFloat(i, "px");
      const h2 = hashFloat(i, "py");
      const h3 = hashFloat(i, "sz");
      const h4 = hashFloat(i, "sp");
      const h5 = hashFloat(i, "al");

      particles.push({
        x: h * W,
        y: h2 * H,
        size: sizeMin + h3 * (sizeMax - sizeMin),
        speedMul: 0.5 + h4 * 1.0,
        alpha: 0.3 + h5 * 0.7,
      });
    }

    return { canvas, ctx, W, H, S, particles, speed, color, dx, dy };
  },

  update(els, localT, _params) {
    const { ctx, W, H, particles, speed, color, dx, dy } = els;
    const fadeIn = smoothstep(0, 0.5, localT);

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Dark background
    ctx.fillStyle = "rgba(5,5,12,1)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Move particle
      const vx = dx * speed * p.speedMul;
      const vy = dy * speed * p.speedMul;
      p.x += vx * (1 / 60); // approximate per-frame
      p.y += vy * (1 / 60);

      // Wrap around
      if (p.x > W + 20) p.x = -20;
      if (p.x < -20) p.x = W + 20;
      if (p.y > H + 20) p.y = -20;
      if (p.y < -20) p.y = H + 20;

      const alpha = clamp(p.alpha * fadeIn, 0, 1);

      // Glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      grad.addColorStop(0, color + hexAlpha(alpha));
      grad.addColorStop(0.4, color + hexAlpha(alpha * 0.4));
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);

      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = color + hexAlpha(alpha);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  },

  destroy(els) {
    if (els.canvas && els.canvas.parentNode) {
      els.canvas.parentNode.removeChild(els.canvas);
    }
  },
};

function hexAlpha(a) {
  const v = Math.round(clamp(a, 0, 1) * 255);
  return v.toString(16).padStart(2, "0");
}
