import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "auroraGradient",
  type: "canvas",
  name: "Aurora Gradient",
  category: "Backgrounds",
  defaultParams: {
    hueA: 220,
    hueB: 280,
    hueC: 180,
    intensity: 0.7,
    grain: 0.03,
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
    const grain = clamp(toNumber(params.grain, 0.03), 0, 0.2);

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

    // Film grain
    if (grain > 0) {
      const imageData = ctx.getImageData(0, 0, W, H);
      const data = imageData.data;
      const strength = grain * 40;
      // Simple pseudo-random grain based on position + time
      let seed = (localT * 1000) | 0;
      for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const noise = ((seed >> 16) / 32767 - 0.5) * strength;
        data[i] = clamp(data[i] + noise, 0, 255);
        data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
        data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },

  destroy(canvas) {
    canvas.remove();
  },
};
