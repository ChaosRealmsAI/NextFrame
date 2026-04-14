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

function wrap01(value) {
  return value - Math.floor(value);
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
 * Render a layered parallax starfield with deterministic procedural stars.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Starfield styling parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function starfield(t, params = {}, ctx, _globalT = 0) {
  const {
    hueBase = 215,
    hueShift = 110,
    drift = 0.06,
    density = 1,
    glow = 1,
  } = params;

  const { width, height } = resolveSize(ctx);
  const diagonal = Math.hypot(width, height);
  const fadeIn = smoothstep(0, 0.5, t);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#040611");
  background.addColorStop(0.55, "#090c1d");
  background.addColorStop(1, "#020308");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const nebula = ctx.createRadialGradient(width * 0.62, height * 0.35, 0, width * 0.62, height * 0.35, diagonal * 0.65);
  nebula.addColorStop(0, `hsla(${hueBase + 50}, 100%, 70%, ${0.1 * fadeIn})`);
  nebula.addColorStop(0.45, `hsla(${hueBase + 10}, 90%, 42%, ${0.08 * fadeIn})`);
  nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, width, height);

  const layers = [
    { count: Math.max(24, Math.round(70 * density)), speed: 0.022, scale: 0.55, alpha: 0.45 },
    { count: Math.max(18, Math.round(48 * density)), speed: 0.046, scale: 0.9, alpha: 0.7 },
    { count: Math.max(12, Math.round(28 * density)), speed: 0.09, scale: 1.35, alpha: 0.95 },
  ];

  ctx.globalCompositeOperation = "screen";
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    for (let i = 0; i < layer.count; i += 1) {
      const baseX = hash(i, 101 + layerIndex * 17);
      const baseY = hash(i, 211 + layerIndex * 23);
      const lane = hash(i, 307 + layerIndex * 19) - 0.5;
      const twinkle = 0.65 + 0.35 * Math.sin(t * (1.2 + layerIndex * 0.55) + i * 2.17);
      const x = wrap01(baseX - t * layer.speed - lane * drift) * width;
      const y = wrap01(baseY + t * layer.speed * 0.35 + lane * drift * 0.5) * height;
      const radius = (0.5 + hash(i, 401 + layerIndex * 13) * 1.2) * layer.scale;
      const hue = hueBase + hueShift * hash(i, 503 + layerIndex * 29) + Math.sin(t * 0.3 + i) * 6;
      const halo = radius * (4.2 + layerIndex * 0.75) * glow;
      const alpha = layer.alpha * twinkle * fadeIn;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, halo);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 90%, ${alpha})`);
      gradient.addColorStop(0.25, `hsla(${hue + 18}, 95%, 76%, ${alpha * 0.75})`);
      gradient.addColorStop(1, `hsla(${hue + 45}, 90%, 50%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);

      ctx.fillStyle = `hsla(${hue}, 100%, 96%, ${Math.min(1, alpha * 1.1)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  const vignette = ctx.createRadialGradient(width * 0.5, height * 0.45, diagonal * 0.1, width * 0.5, height * 0.5, diagonal * 0.72);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const scan = 0.18 + 0.82 * easeOutCubic(smoothstep(0, 0.8, t));
  ctx.fillStyle = `rgba(255, 255, 255, ${0.025 * scan})`;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
}
