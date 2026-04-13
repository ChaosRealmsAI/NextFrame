import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "neonGrid",
  type: "canvas",
  name: "Neon Grid",
  category: "Backgrounds",
  defaultParams: {
    gridColor: "#ff2d95",
    skyColor: "#0a001a",
    speed: 1,
    perspective: 0.6,
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

    const gridColor = params.gridColor || "#ff2d95";
    const skyColor = params.skyColor || "#0a001a";
    const speed = toNumber(params.speed, 1);
    const persp = clamp(toNumber(params.perspective, 0.6), 0.3, 0.85);

    // Sky background
    const horizonY = H * persp;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, skyColor);
    skyGrad.addColorStop(0.6, skyColor);
    skyGrad.addColorStop(1, "#1a0030");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizonY);

    // Ground gradient
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    groundGrad.addColorStop(0, "#1a0030");
    groundGrad.addColorStop(1, "#0a0015");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Sun glow at horizon
    const sunGrad = ctx.createRadialGradient(W / 2, horizonY, 0, W / 2, horizonY, W * 0.3);
    sunGrad.addColorStop(0, "rgba(255, 45, 149, 0.3)");
    sunGrad.addColorStop(0.5, "rgba(255, 45, 149, 0.1)");
    sunGrad.addColorStop(1, "transparent");
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, horizonY * 0.5, W, H * 0.5);

    // Horizontal grid lines (perspective projected)
    const gridLines = 20;
    const t = (localT * speed * 0.08) % 1;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    for (let i = 0; i < gridLines; i++) {
      // z goes from 0 (horizon) to 1 (bottom), with scroll offset
      const rawZ = (i / gridLines + t / gridLines);
      const z = rawZ > 1 ? rawZ - 1 : rawZ;
      // Perspective: exponential mapping gives density near horizon
      const perspZ = z * z;
      const y = horizonY + perspZ * (H - horizonY);

      const alpha = clamp(perspZ * 2, 0.05, 0.8);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Vertical grid lines (converging to vanishing point)
    const vLines = 16;
    ctx.globalAlpha = 0.5;
    const vanishX = W / 2;

    for (let i = -vLines / 2; i <= vLines / 2; i++) {
      const bottomX = vanishX + (i / (vLines / 2)) * W * 0.8;
      ctx.beginPath();
      ctx.moveTo(vanishX, horizonY);
      ctx.lineTo(bottomX, H);
      ctx.stroke();
    }

    // Horizon glow line
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = gridColor;
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(W, horizonY);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  },

  destroy(canvas) {
    canvas.remove();
  },
};
