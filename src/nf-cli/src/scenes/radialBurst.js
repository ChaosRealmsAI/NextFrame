/**
 * radialBurst — rays shooting out from center with rotation
 * @param {number} t - Local clip time in seconds
 * @param {object} params
 * @param {CanvasRenderingContext2D} ctx
 */
export function radialBurst(t, params = {}, ctx) {
  const {
    rayCount = 24,
    hue = 35,
    rotationSpeed = 0.3,
    pulseSpeed = 1.5,
    innerRadius = 0.05,
    outerRadius = 0.9,
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const maxR = Math.min(W, H) * 0.5;

  // background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  bg.addColorStop(0, `hsla(${hue}, 40%, 8%, 1)`);
  bg.addColorStop(1, "#030204");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rotation = t * rotationSpeed * Math.PI * 2;
  const TAU = Math.PI * 2;
  const angleStep = TAU / rayCount;

  for (let i = 0; i < rayCount; i++) {
    const angle = i * angleStep + rotation;
    const pulse = Math.sin(t * pulseSpeed + i * 0.5) * 0.3 + 0.7;
    const rInner = maxR * innerRadius;
    const rOuter = maxR * outerRadius * pulse;

    const x1 = cx + Math.cos(angle) * rInner;
    const y1 = cy + Math.sin(angle) * rInner;
    const x2 = cx + Math.cos(angle) * rOuter;
    const y2 = cy + Math.sin(angle) * rOuter;

    const alpha = 0.3 + pulse * 0.5;
    const width = 1.5 + pulse * 2;
    const rayHue = hue + i * (360 / rayCount);

    ctx.strokeStyle = `hsla(${rayHue}, 90%, 65%, ${alpha})`;
    ctx.lineWidth = width;
    ctx.shadowColor = `hsla(${rayHue}, 100%, 70%, ${alpha * 0.5})`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // center glow
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.15);
  glow.addColorStop(0, `hsla(${hue}, 100%, 85%, 0.8)`);
  glow.addColorStop(0.5, `hsla(${hue}, 100%, 60%, 0.2)`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

export const META = {
  id: "radialBurst",
  name: "radialBurst",
  category: "Shapes",
  description: "Rays shooting out from center with rotation and pulse",
  params: {
    rayCount: { type: "number", default: 24, min: 4, max: 64 },
    hue: { type: "number", default: 35, min: 0, max: 360 },
    rotationSpeed: { type: "number", default: 0.3, min: 0, max: 2 },
    pulseSpeed: { type: "number", default: 1.5, min: 0.1, max: 5 },
    innerRadius: { type: "number", default: 0.05, min: 0, max: 0.5 },
    outerRadius: { type: "number", default: 0.9, min: 0.3, max: 1 },
  },
};
