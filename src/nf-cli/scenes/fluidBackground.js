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

function mix(a, b, t) {
  return a + (b - a) * t;
}

function blendHue(hueA, hueB, hueC, t) {
  if (t <= 0.5) {
    return mix(hueA, hueB, t / 0.5);
  }

  return mix(hueB, hueC, (t - 0.5) / 0.5);
}

/**
 * Render blurred additive color blobs for a fluid, metaball-like background.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Blob count, hues, blur, and drift configuration.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function fluidBackground(t, params = {}, ctx, _globalT = 0) {
  const {
    blobCount = 5,
    hueA = 210,
    hueB = 290,
    hueC = 340,
    intensity = 0.6,
    drift = 0.4,
    blur = 80,
  } = params;

  const { width, height } = resolveSize(ctx);
  const minSize = Math.min(width, height);
  const count = Math.max(1, Math.floor(blobCount));
  const alpha = Math.max(0, intensity) * 0.6;

  const background = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    minSize * 0.1,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.8,
  );
  background.addColorStop(0, `hsl(${hueA}, 35%, 16%)`);
  background.addColorStop(0.55, `hsl(${hueB}, 32%, 10%)`);
  background.addColorStop(1, `hsl(${hueC}, 28%, 5%)`);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const previousComposite = ctx.globalCompositeOperation;
  const previousFilter = ctx.filter;

  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${blur}px)`;

  for (let i = 0; i < count; i += 1) {
    const blend = count === 1 ? 0.5 : i / (count - 1);
    const hue = blendHue(hueA, hueB, hueC, blend);
    const centerX = width * 0.5 + Math.sin(t * 0.3 + i) * drift * width * 0.4;
    const centerY = height * 0.5 + Math.cos(t * 0.4 + i * 1.7) * drift * height * 0.4;
    const radius = Math.max(24, minSize * 0.35 + Math.sin(t + i * 0.7) * 50);

    ctx.fillStyle = `hsla(${hue}, 92%, 62%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.filter = previousFilter;
  ctx.globalCompositeOperation = previousComposite;
}
