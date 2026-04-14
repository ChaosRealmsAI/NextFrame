const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
}

function hash(i, salt = 0) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177 | 0;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
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
 * Render concentric chromatic ripples expanding from the frame center.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Ripple timing and color parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function circleRipple(t, params = {}, ctx, _globalT = 0) {
  const {
    hueStart = 185,
    hueSpan = 180,
    ringCount = 9,
    interval = 0.26,
    lifespan = 2.1,
    thickness = 0.012,
  } = params;

  const { width, height } = resolveSize(ctx);
  const maxR = Math.hypot(width, height) * 0.58;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const loopDuration = Math.max(lifespan + interval * ringCount, interval);
  const localT = ((t % loopDuration) + loopDuration) % loopDuration;
  const fadeIn = smoothstep(0, 0.4, t);

  const background = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxR * 1.1);
  background.addColorStop(0, "#0b1020");
  background.addColorStop(0.55, "#060810");
  background.addColorStop(1, "#020306");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxR * 0.32);
  core.addColorStop(0, `hsla(${hueStart + 24}, 100%, 70%, ${0.14 * fadeIn})`);
  core.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "round";
  for (let i = 0; i < ringCount; i += 1) {
    const born = i * interval;
    const progress = smoothstep(born, born + lifespan, localT);
    if (progress <= 0 || progress >= 1) {
      continue;
    }

    const radius = progress * maxR;
    const life = Math.max(0, 1 - progress);
    const hue = hueStart + (hueSpan * i) / Math.max(1, ringCount - 1);
    const pulse = 0.88 + 0.12 * Math.sin(t * 1.5 + i * 0.7);
    const widthPx = Math.max(1.5, Math.min(width, height) * thickness * (1.3 - progress * 0.5));
    const alpha = life * life * pulse * fadeIn;
    const tilt = (hash(i, 17) - 0.5) * Math.min(width, height) * 0.012;

    ctx.strokeStyle = `hsla(${hue}, 100%, ${68 - i * 2}%, ${alpha})`;
    ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${alpha * 0.85})`;
    ctx.shadowBlur = 18 * easeOutCubic(life);
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    ctx.arc(centerX, centerY + tilt, radius, 0, TAU);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  const markerRadius = Math.max(6, Math.min(width, height) * 0.014);
  const markerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, markerRadius * 2.8);
  markerGradient.addColorStop(0, `hsla(${hueStart + 30}, 100%, 85%, ${0.95 * fadeIn})`);
  markerGradient.addColorStop(0.55, `hsla(${hueStart + 65}, 100%, 62%, ${0.4 * fadeIn})`);
  markerGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = markerGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, markerRadius * 2.8, 0, TAU);
  ctx.fill();
}
