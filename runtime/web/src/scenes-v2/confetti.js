import { toNumber, clamp, normalizeArray } from "../scenes-v2-shared.js";

const DEFAULT_COLORS = ["#6ee7ff", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#fbbf24"];

export default {
  id: "confetti",
  type: "canvas",
  name: "Confetti",
  category: "Effects",
  defaultParams: {
    count: 100,
    colors: DEFAULT_COLORS,
    gravity: 0.5,
    spread: 60,
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    const count = clamp(toNumber(params.count, 100), 10, 500) | 0;
    const colors = normalizeArray(params.colors, DEFAULT_COLORS);
    const spread = toNumber(params.spread, 60);

    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    const particles = [];
    for (let i = 0; i < count; i++) {
      const angle = ((rng() - 0.5) * spread * Math.PI) / 180 - Math.PI / 2;
      const velocity = 300 + rng() * 400;
      particles.push({
        x: 0.5, y: 0.7,
        vx: Math.cos(angle) * velocity * (rng() * 0.5 + 0.75),
        vy: Math.sin(angle) * velocity * (rng() * 0.5 + 0.75),
        w: 6 + rng() * 8, h: 4 + rng() * 6,
        rot: rng() * Math.PI * 2,
        rotSpeed: (rng() - 0.5) * 12,
        color: colors[i % colors.length] || "#fff",
        shape: rng() > 0.5 ? "rect" : "circle",
      });
    }
    canvas._data = { particles };
    return canvas;
  },

  update(canvas, localT, params) {
    const ctx = canvas.getContext("2d");
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const W = canvas.width;
    const H = canvas.height;
    const gravity = toNumber(params.gravity, 0.5) * 800;
    const t = localT;

    ctx.clearRect(0, 0, W, H);
    const { particles } = canvas._data;

    for (const p of particles) {
      const px = (p.x + p.vx * t / W) * W;
      const py = (p.y + p.vy * t / H + 0.5 * gravity * t * t / H) * H;
      if (py > H + 20) continue;

      const rot = p.rot + p.rotSpeed * t;
      const alpha = clamp(1 - t * 0.3, 0.2, 1);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
      }
      ctx.restore();
    }
  },

  destroy(canvas) { canvas._data = null; canvas.remove(); },
};
