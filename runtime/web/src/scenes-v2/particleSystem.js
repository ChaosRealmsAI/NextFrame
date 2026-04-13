import { toNumber, clamp, normalizeArray } from "../scenes-v2-shared.js";

export default {
  id: "particleSystem",
  type: "canvas",
  name: "Particle System",
  category: "Effects",
  tags: ["particle", "physics", "gravity", "wind", "effect", "simulation"],
  description: "高级粒子系统，支持重力、风力、大小范围、生命周期和多种形状的物理模拟粒子",
  params: {
    count:      { type: "number", default: 200,          desc: "粒子数", min: 10, max: 1000 },
    shape:      { type: "string", default: "circle",     desc: "形状:circle/square/triangle/star" },
    color:      { type: "string", default: "#6ee7ff",    desc: "颜色" },
    gravity:    { type: "number", default: 0.1,          desc: "重力", min: -2, max: 2 },
    wind:       { type: "number", default: 0,            desc: "风力(正=右)", min: -2, max: 2 },
    sizeRange:  { type: "array",  default: [2, 6],       desc: "大小范围[min,max]" },
    speedRange: { type: "array",  default: [1, 3],       desc: "速度范围" },
    emitter:    { type: "string", default: "center",     desc: "发射器位置:center/top/bottom/random" },
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

    const count = clamp(toNumber(params.count, 200), 10, 1000) | 0;
    const sizeRange = normalizeArray(params.sizeRange, [2, 6]);
    const speedRange = normalizeArray(params.speedRange, [1, 3]);
    const emitterType = String(params.emitter || "center");

    const sMin = toNumber(sizeRange[0], 2);
    const sMax = toNumber(sizeRange[1], 6);
    const spMin = toNumber(speedRange[0], 1);
    const spMax = toNumber(speedRange[1], 3);

    let seed = 73;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    const particles = [];
    for (let i = 0; i < count; i++) {
      let ex = 0.5, ey = 0.5;
      if (emitterType === "top") { ex = rng(); ey = 0; }
      else if (emitterType === "bottom") { ex = rng(); ey = 1; }
      else if (emitterType === "random") { ex = rng(); ey = rng(); }
      else { ex = 0.45 + rng() * 0.1; ey = 0.45 + rng() * 0.1; }

      const angle = rng() * Math.PI * 2;
      const speed = spMin + rng() * (spMax - spMin);
      particles.push({
        x: ex, y: ey,
        vx: Math.cos(angle) * speed * 60,
        vy: Math.sin(angle) * speed * 60,
        size: sMin + rng() * (sMax - sMin),
        life: 0.5 + rng() * 0.5,
        alpha: 0.5 + rng() * 0.5,
        rotation: rng() * Math.PI * 2,
      });
    }

    return { canvas, particles };
  },

  update(state, localT, params) {
    const { canvas, particles } = state;
    const ctx = canvas.getContext("2d");
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const W = canvas.width;
    const H = canvas.height;

    const gravity = toNumber(params.gravity, 0.1) * 400;
    const wind = toNumber(params.wind, 0) * 200;
    const color = params.color || "#6ee7ff";
    const shape = String(params.shape || "circle");
    const t = localT;

    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      const px = (p.x * W) + p.vx * t + 0.5 * wind * t * t;
      const py = (p.y * H) + p.vy * t + 0.5 * gravity * t * t;

      const age = t / p.life;
      if (age > 2) continue;
      const fadeAlpha = age < 0.1 ? age / 0.1 : age > 1.5 ? clamp(2 - age, 0, 1) : 1;
      const alpha = p.alpha * fadeAlpha;
      if (alpha <= 0) continue;

      const s = p.size;
      ctx.save();
      ctx.translate(((px % (W + 40)) + (W + 40)) % (W + 40) - 20, ((py % (H + 40)) + (H + 40)) % (H + 40) - 20);
      ctx.rotate(p.rotation + t * 0.5);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = color;

      if (shape === "square") {
        ctx.fillRect(-s / 2, -s / 2, s, s);
      } else if (shape === "triangle") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.87, s * 0.5);
        ctx.lineTo(-s * 0.87, s * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (shape === "star") {
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const outerAngle = (j * 2 * Math.PI / 5) - Math.PI / 2;
          const innerAngle = outerAngle + Math.PI / 5;
          ctx.lineTo(Math.cos(outerAngle) * s, Math.sin(outerAngle) * s);
          ctx.lineTo(Math.cos(innerAngle) * s * 0.4, Math.sin(innerAngle) * s * 0.4);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  destroy(state) { state.canvas.remove(); },
};
