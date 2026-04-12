const TAU = Math.PI * 2;

function hash(i, salt = 0) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177 | 0;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
}

function wrap(value, size) {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
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

function sampleParticlePosition(i, time, width, height, fieldScale, speed) {
  const startX = hash(i, 11) * width;
  const startY = hash(i, 29) * height;
  const phase = hash(i, 47) * TAU;
  const fieldX = Math.sin(startY * fieldScale + time * 0.5 + i * 0.13 + phase) * 0.72
    + Math.sin(startX * fieldScale * 0.65 - time * 0.21 + phase * 0.7) * 0.28;
  const fieldY = Math.cos(startX * fieldScale + time * 0.43 + i * 0.17 + phase * 1.1) * 0.68
    + Math.sin((startX + startY) * fieldScale * 0.5 - time * 0.27 + phase * 0.5) * 0.32;

  return {
    x: wrap(startX + fieldX * speed * time, width),
    y: wrap(startY + fieldY * speed * time, height),
  };
}

/**
 * Render deterministic particles flowing through a procedural vector field.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Particle field parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function particleFlow(t, params = {}, ctx, _globalT = 0) {
  const {
    count = 400,
    hueA = 180,
    hueB = 320,
    fieldScale = 0.004,
    speed = 80,
    trailLength = 24,
    lineWidth = 1.2,
  } = params;

  const { width, height } = resolveSize(ctx);
  const particleCount = Math.max(1, Math.floor(count));
  const trailSteps = Math.max(1, Math.floor(trailLength));
  const strokeBase = Math.max(0.1, lineWidth);
  const fadeIn = smoothstep(0, 0.6, t);
  const trailStepTime = 1 / 60;
  const diagonal = Math.hypot(width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "hsl(210 35% 6%)");
  background.addColorStop(0.55, "hsl(226 42% 8%)");
  background.addColorStop(1, "hsl(248 38% 6%)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const haze = ctx.createRadialGradient(width * 0.52, height * 0.48, diagonal * 0.06, width * 0.52, height * 0.48, diagonal * 0.7);
  haze.addColorStop(0, `hsla(${hueA}, 90%, 56%, ${0.1 * fadeIn})`);
  haze.addColorStop(0.5, `hsla(${hueB}, 95%, 56%, ${0.08 * fadeIn})`);
  haze.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < particleCount; i += 1) {
    const mix = particleCount === 1 ? 0 : i / (particleCount - 1);
    const hue = lerp(hueA, hueB, mix);
    const head = sampleParticlePosition(i, t, width, height, fieldScale, speed);
    let previous = head;

    for (let step = 1; step <= trailSteps; step += 1) {
      const sampleTime = Math.max(0, t - step * trailStepTime);
      const point = sampleParticlePosition(i, sampleTime, width, height, fieldScale, speed);
      const dx = Math.abs(previous.x - point.x);
      const dy = Math.abs(previous.y - point.y);

      // Break the ribbon when wrapping so lines do not span the whole canvas.
      if (dx < width * 0.5 && dy < height * 0.5) {
        const life = 1 - (step - 1) / trailSteps;
        ctx.strokeStyle = `hsla(${hue}, 88%, ${lerp(74, 56, mix)}%, ${(0.02 + life * 0.14) * fadeIn})`;
        ctx.lineWidth = strokeBase * (0.45 + life * 0.85);
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }

      previous = point;
    }

    const radius = strokeBase * (0.5 + hash(i, 83) * 0.9);
    ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${(0.18 + hash(i, 97) * 0.18) * fadeIn})`;
    ctx.beginPath();
    ctx.arc(head.x, head.y, radius, 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, diagonal * 0.18, width * 0.5, height * 0.5, diagonal * 0.78);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
