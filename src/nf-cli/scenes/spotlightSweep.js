function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resolveSize(ctx) {
  const rect = typeof ctx?.canvas?.getBoundingClientRect === "function"
    ? ctx.canvas.getBoundingClientRect()
    : null;
  const fallbackWidth = rect?.width || ctx?.canvas?.clientWidth || ctx?.canvas?.width || 1;
  const fallbackHeight = rect?.height || ctx?.canvas?.clientHeight || ctx?.canvas?.height || 1;
  return {
    width: fallbackWidth,
    height: fallbackHeight,
  };
}

/**
 * Render sweeping theatrical spotlights with soft additive falloff.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Spotlight layout and palette parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function spotlightSweep(t, params = {}, ctx, _globalT = 0) {
  const {
    beamCount = 3,
    hueA = 210,
    hueB = 320,
    sweepSpeed = 0.5,
    beamWidth = 0.4,
    intensity = 0.85,
    ambient = 0.05,
  } = params;

  const safeBeamCount = Math.max(1, Math.round(beamCount));
  const safeBeamWidth = Math.max(0, beamWidth);
  const safeIntensity = Math.max(0, intensity);
  const safeAmbient = clamp(ambient, 0, 1);
  const { width, height } = resolveSize(ctx);
  const length = height + 100;

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, `hsl(220 18% ${safeAmbient * 100}%)`);
  background.addColorStop(1, "hsl(220 18% 1.5%)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const previousCompositeOperation = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < safeBeamCount; i += 1) {
    const originMix = safeBeamCount > 1 ? i / (safeBeamCount - 1) : 0.5;
    const originX = lerp(width * 0.1, width * 0.9, originMix || 0.5);
    const originY = 0;
    const angle = Math.sin(t * sweepSpeed + i * 1.3) * 0.6;
    const beamBaseWidth = safeBeamWidth * width;
    const farX = originX + Math.sin(angle) * length;
    const farY = Math.cos(angle) * length;
    const leftX = farX - beamBaseWidth * 0.5;
    const rightX = farX + beamBaseWidth * 0.5;
    const hue = lerp(hueA, hueB, i / safeBeamCount);
    const gradient = ctx.createRadialGradient(originX, originY, 0, farX, farY, length);
    const alpha = clamp(safeIntensity / (0.9 + i * 0.18), 0, 1);

    gradient.addColorStop(0, `hsla(${hue}, 100%, 76%, ${alpha})`);
    gradient.addColorStop(0.28, `hsla(${hue}, 100%, 68%, ${alpha * 0.45})`);
    gradient.addColorStop(1, `hsla(${hue}, 100%, 40%, 0)`);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(leftX, height);
    ctx.lineTo(rightX, height);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(
      Math.min(originX, leftX, rightX) - beamBaseWidth,
      originY,
      Math.max(originX, leftX, rightX) - Math.min(originX, leftX, rightX) + beamBaseWidth * 2,
      Math.max(height, farY),
    );
    ctx.restore();
  }

  ctx.globalCompositeOperation = previousCompositeOperation;
}
