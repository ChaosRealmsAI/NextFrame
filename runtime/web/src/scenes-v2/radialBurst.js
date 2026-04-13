import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "radialBurst",
  type: "canvas",
  name: "Radial Burst",
  category: "Effects",
  defaultParams: {
    rays: 24,
    color: "#e0c3fc",
    rotation: 1,
    spread: 0.4,
    fadeLength: 0.6,
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);

    // Pre-compute per-ray properties
    const rayCount = clamp(toNumber(params.rays, 24), 4, 120) | 0;
    const rayData = new Float64Array(rayCount * 3); // angleSeed, lengthMult, widthMult
    let seed = 257;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < rayCount; i++) {
      rayData[i * 3] = rng() * 0.2 - 0.1;     // angle jitter
      rayData[i * 3 + 1] = 0.5 + rng() * 0.5;  // length multiplier
      rayData[i * 3 + 2] = 0.4 + rng() * 0.6;  // width multiplier
    }
    canvas._data = { rayData, rayCount };
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

    const color = params.color || "#e0c3fc";
    const rotation = toNumber(params.rotation, 1);
    const spread = clamp(toNumber(params.spread, 0.4), 0.05, 1);
    const fadeLen = clamp(toNumber(params.fadeLength, 0.6), 0.1, 1);

    const { rayData, rayCount } = canvas._data;
    const maxLen = Math.hypot(cx, cy) * fadeLen;

    ctx.clearRect(0, 0, W, H);

    const baseAngle = localT * rotation * 0.2;
    const angleStep = (Math.PI * 2) / rayCount;
    const halfWidth = spread * angleStep * 0.5;

    for (let i = 0; i < rayCount; i++) {
      const jitter = rayData[i * 3];
      const lenMult = rayData[i * 3 + 1];
      const widMult = rayData[i * 3 + 2];

      const angle = baseAngle + i * angleStep + jitter;
      const len = maxLen * lenMult;
      const hw = halfWidth * widMult;

      // Pulsing alpha
      const pulse = 0.5 + 0.5 * Math.sin(localT * 2 + i * 0.7);
      const alpha = clamp(0.15 + pulse * 0.35, 0, 1);

      // Draw ray as a gradient triangle from center outward
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, len);
      grad.addColorStop(0, color);
      grad.addColorStop(0.6, color + "88");
      grad.addColorStop(1, "transparent");

      ctx.fillStyle = grad;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle - hw) * len, cy + Math.sin(angle - hw) * len);
      ctx.lineTo(cx + Math.cos(angle + hw) * len, cy + Math.sin(angle + hw) * len);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  },

  destroy(canvas) {
    canvas._data = null;
    canvas.remove();
  },
};
