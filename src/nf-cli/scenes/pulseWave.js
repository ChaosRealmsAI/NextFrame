/**
 * pulseWave — horizontal soundwave-style pulsing bars
 * @param {number} t - Local clip time in seconds
 * @param {object} params
 * @param {CanvasRenderingContext2D} ctx
 */
export function pulseWave(t, params = {}, ctx) {
  const {
    barCount = 48,
    hue = 260,
    speed = 2.0,
    amplitude = 0.7,
    gap = 0.3,
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // background
  ctx.fillStyle = "#08060e";
  ctx.fillRect(0, 0, W, H);

  const barW = W / (barCount * (1 + gap));
  const barGap = barW * gap;
  const centerY = H * 0.5;
  const maxH = H * amplitude;

  for (let i = 0; i < barCount; i++) {
    const x = i * (barW + barGap) + barGap * 0.5;
    const phase = (i / barCount) * Math.PI * 4 + t * speed;
    const wave = Math.sin(phase) * 0.5 + 0.5;
    const pulse = Math.sin(t * 3 + i * 0.2) * 0.15 + 0.85;
    const h = maxH * wave * pulse;

    const alpha = 0.5 + wave * 0.5;
    const lightness = 50 + wave * 20;
    ctx.fillStyle = `hsla(${hue + i * 2}, 100%, ${lightness}%, ${alpha})`;
    ctx.fillRect(x, centerY - h * 0.5, barW, h);

    // glow
    ctx.shadowColor = `hsla(${hue + i * 2}, 100%, 70%, ${alpha * 0.6})`;
    ctx.shadowBlur = 12;
    ctx.fillRect(x, centerY - h * 0.5, barW, h);
    ctx.shadowBlur = 0;
  }
}

export const META = {
  id: "pulseWave",
  name: "pulseWave",
  category: "Data Viz",
  description: "Horizontal soundwave-style pulsing bars",
  params: {
    barCount: { type: "number", default: 48, min: 8, max: 128 },
    hue: { type: "number", default: 260, min: 0, max: 360 },
    speed: { type: "number", default: 2.0, min: 0.1, max: 10 },
    amplitude: { type: "number", default: 0.7, min: 0.1, max: 1 },
    gap: { type: "number", default: 0.3, min: 0, max: 1 },
  },
};
