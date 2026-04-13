import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "starfield",
  type: "canvas",
  name: "Starfield",
  category: "Effects",
  defaultParams: {
    count: 200,
    speed: 1,
    depth: 1,
    color: "#ffffff",
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    const count = clamp(toNumber(params.count, 200), 10, 2000) | 0;
    const stars = new Float64Array(count * 3); // x, y, z
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      stars[i * 3] = (rng() - 0.5) * 2;     // x: -1..1
      stars[i * 3 + 1] = (rng() - 0.5) * 2; // y: -1..1
      stars[i * 3 + 2] = rng();              // z: 0..1
    }
    canvas._data = { stars, count };
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
    const cx = W / 2;
    const cy = H / 2;

    const speed = toNumber(params.speed, 1);
    const depth = clamp(toNumber(params.depth, 1), 0.1, 3);
    const color = params.color || "#ffffff";

    ctx.clearRect(0, 0, W, H);

    const { stars, count } = canvas._data;
    const t = localT * speed * 0.1;

    for (let i = 0; i < count; i++) {
      const sx = stars[i * 3];
      const sy = stars[i * 3 + 1];
      const sz0 = stars[i * 3 + 2];

      // z cycles from 0..1 based on time, wrapping around
      let z = (sz0 - t * 0.3) % 1;
      if (z < 0) z += 1;
      z = clamp(z, 0.001, 1);

      const scale = depth / z;
      const px = cx + sx * scale * cx;
      const py = cy + sy * scale * cy;

      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;

      const alpha = clamp(1 - z, 0.1, 1);
      const radius = clamp((1 - z) * 2.5, 0.5, 3);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  destroy(canvas) {
    canvas._data = null;
    canvas.remove();
  },
};
