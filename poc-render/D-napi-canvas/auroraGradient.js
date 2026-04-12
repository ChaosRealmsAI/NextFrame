function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
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
 * Render a drifting aurora background with deterministic film grain.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Aurora styling parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function auroraGradient(t, params = {}, ctx, _globalT = 0) {
  const {
    hueA = 270,
    hueB = 200,
    hueC = 320,
    intensity = 1,
    grain = 0.04,
  } = params;

  const { width, height } = resolveSize(ctx);
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#05050c");
  base.addColorStop(0.5, "#0a0714");
  base.addColorStop(1, "#03020a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const fadeIn = smoothstep(0, 0.6, t);
  const blobs = [
    { hue: hueA, phase: 0, speedX: 0.11, speedY: 0.07, amp: 0.28, sizeBase: 0.55 },
    { hue: hueB, phase: 1.7, speedX: 0.09, speedY: 0.13, amp: 0.34, sizeBase: 0.68 },
    { hue: hueC, phase: 3.2, speedX: 0.13, speedY: 0.05, amp: 0.22, sizeBase: 0.42 },
    { hue: (hueA + hueB) / 2, phase: 4.9, speedX: 0.07, speedY: 0.11, amp: 0.3, sizeBase: 0.6 },
  ];

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i];
    const cx = width * (0.5 + Math.sin(t * blob.speedX + blob.phase) * blob.amp);
    const cy = height * (0.5 + Math.cos(t * blob.speedY + blob.phase * 1.3) * blob.amp * 0.7);
    const breath = 0.88 + 0.12 * Math.sin(t * 0.35 + i);
    const radius = Math.min(width, height) * blob.sizeBase * breath;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const alpha = 0.55 * intensity * fadeIn;

    gradient.addColorStop(0, `hsla(${blob.hue}, 90%, 65%, ${alpha})`);
    gradient.addColorStop(0.35, `hsla(${blob.hue}, 85%, 55%, ${alpha * 0.55})`);
    gradient.addColorStop(1, `hsla(${blob.hue}, 80%, 40%, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalCompositeOperation = "source-over";
  const band = ctx.createLinearGradient(0, 0, 0, height);
  band.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  band.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  band.addColorStop(1, "rgba(0, 0, 0, 0.65)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, height);

  if (grain <= 0) {
    return;
  }

  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = grain;
  const grainSeed = Math.floor(t * 24);
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const noise = hash((x / step) | 0, ((y / step) | 0) + grainSeed * 31);
      const value = Math.floor(noise * 255);
      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(x, y, step, step);
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
