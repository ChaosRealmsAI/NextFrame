import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "fluidBackground",
  type: "canvas",
  name: "Fluid Background",
  category: "Backgrounds",
  defaultParams: {
    colors: ["#4a00e0", "#8e2de2", "#00d2ff", "#ff6b6b"],
    speed: 1,
    blur: 80,
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    // Pre-compute blob motion parameters
    const colors = Array.isArray(params.colors) && params.colors.length > 0
      ? params.colors
      : ["#4a00e0", "#8e2de2", "#00d2ff", "#ff6b6b"];
    const blobCount = colors.length;
    const blobs = [];
    let seed = 311;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < blobCount; i++) {
      blobs.push({
        cx: 0.2 + rng() * 0.6,
        cy: 0.2 + rng() * 0.6,
        freqX: 0.2 + rng() * 0.3,
        freqY: 0.15 + rng() * 0.25,
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        ampX: 0.15 + rng() * 0.15,
        ampY: 0.15 + rng() * 0.15,
        radius: 0.25 + rng() * 0.15,
        color: colors[i],
      });
    }
    canvas._data = { blobs };
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

    const speed = toNumber(params.speed, 1);
    const blur = clamp(toNumber(params.blur, 80), 0, 200);
    const { blobs } = canvas._data;
    const t = localT * speed;

    // Dark base
    ctx.fillStyle = "#0a0a18";
    ctx.fillRect(0, 0, W, H);

    // Apply blur filter for fluid look
    ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
    ctx.globalCompositeOperation = "lighter";

    for (const blob of blobs) {
      const cx = (blob.cx + Math.sin(t * blob.freqX + blob.phaseX) * blob.ampX) * W;
      const cy = (blob.cy + Math.cos(t * blob.freqY + blob.phaseY) * blob.ampY) * H;
      const radius = blob.radius * Math.max(W, H);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, blob.color + "aa");
      grad.addColorStop(0.5, blob.color + "55");
      grad.addColorStop(1, "transparent");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
  },

  destroy(canvas) {
    canvas._data = null;
    canvas.remove();
  },
};
