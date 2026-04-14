const TAU = Math.PI * 2;

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
 * Render a synthwave horizon with a scrolling perspective grid.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Grid and palette parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function neonGrid(t, params = {}, ctx, _globalT = 0) {
  const {
    hueHorizon = 320,
    hueGrid = 280,
    scrollSpeed = 0.4,
    lineCount = 16,
    colCount = 22,
  } = params;

  const { width, height } = resolveSize(ctx);
  const horizonY = height * 0.55;
  const fade = smoothstep(0, 0.4, t);

  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, "#0a0218");
  sky.addColorStop(0.6, "#1a0630");
  sky.addColorStop(1, "#3a0845");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizonY);

  for (let i = 0; i < 80; i += 1) {
    const starX = hash(i, 11) * width;
    const starY = hash(i, 22) * horizonY * 0.85;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + i));
    const radius = hash(i, 33) * 1.4 + 0.3;
    ctx.fillStyle = `rgba(255, 240, 255, ${0.6 * twinkle * fade})`;
    ctx.fillRect(starX, starY, radius, radius);
  }

  const sunRadius = Math.min(width, height) * 0.22;
  const sunX = width * 0.5;
  const sunY = horizonY - sunRadius * 0.1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, Math.PI, TAU);
  ctx.clip();

  const sunGradient = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY);
  sunGradient.addColorStop(0, `hsla(${hueHorizon - 20}, 100%, 75%, ${fade})`);
  sunGradient.addColorStop(0.5, `hsla(${hueHorizon}, 100%, 60%, ${fade})`);
  sunGradient.addColorStop(1, `hsla(${hueHorizon + 20}, 100%, 45%, ${fade})`);
  ctx.fillStyle = sunGradient;
  ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius);

  ctx.fillStyle = "rgba(10, 2, 20, 0.85)";
  const stripes = 7;
  for (let i = 0; i < stripes; i += 1) {
    const bandY = sunY - sunRadius + (sunRadius / stripes) * (i + 0.15 + Math.sin(t * 0.3 + i) * 0.08);
    const bandHeight = (sunRadius / stripes) * 0.35;
    ctx.fillRect(sunX - sunRadius, bandY, sunRadius * 2, bandHeight);
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.8, sunX, sunY, sunRadius * 2);
  glow.addColorStop(0, `hsla(${hueHorizon}, 100%, 60%, ${0.45 * fade})`);
  glow.addColorStop(1, "hsla(320, 100%, 50%, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, horizonY + sunRadius);

  const ground = ctx.createLinearGradient(0, horizonY, 0, height);
  ground.addColorStop(0, "#1a0238");
  ground.addColorStop(1, "#04000a");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  ctx.strokeStyle = `hsla(${hueGrid}, 90%, 70%, ${0.75 * fade})`;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = `hsla(${hueGrid}, 100%, 70%, 0.8)`;
  ctx.shadowBlur = 8;

  const scroll = (t * scrollSpeed) % 1;
  for (let i = 0; i < lineCount; i += 1) {
    const u = (i / lineCount + scroll) % 1;
    const eased = u * u;
    const y = horizonY + eased * (height - horizonY);
    ctx.globalAlpha = (0.3 + 0.7 * u) * fade;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = `hsla(${hueGrid}, 95%, 75%, ${0.65 * fade})`;
  const vanishX = width * 0.5;
  for (let i = 0; i <= colCount; i += 1) {
    const column = (i / colCount - 0.5) * 2;
    const bottomX = width * 0.5 + column * width * 1.4;
    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(bottomX, height);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  const horizonBar = ctx.createLinearGradient(0, horizonY - 2, 0, horizonY + 4);
  horizonBar.addColorStop(0, "rgba(255, 255, 255, 0)");
  horizonBar.addColorStop(0.5, `hsla(${hueHorizon}, 100%, 85%, ${fade})`);
  horizonBar.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = horizonBar;
  ctx.fillRect(0, horizonY - 2, width, 6);
}
