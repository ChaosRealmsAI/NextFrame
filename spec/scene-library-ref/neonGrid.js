// ============================================================
// neonGrid — Category: Shapes & Layout
// ----------------------------------------------------------------
// Perspective synthwave grid floor with a glowing horizon sun and
// parallax mountain silhouettes. Every grid line position is a
// pure function of (t, params).
// ============================================================

const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash(i, salt = 0) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177 | 0;
  x = (x ^ (x >>> 16));
  return ((x >>> 0) % 100000) / 100000;
}

export function neonGrid(t, params = {}, ctx, globalT = 0) {
  const {
    hueHorizon = 320,   // pink
    hueGrid = 280,      // purple
    scrollSpeed = 0.4,  // grid moves toward camera
    lineCount = 16,
    colCount = 22,
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const horizonY = H * 0.55;
  const fade = smoothstep(0, 0.4, t);

  // --- Sky gradient ---
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, '#0a0218');
  sky.addColorStop(0.6, '#1a0630');
  sky.addColorStop(1, '#3a0845');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY);

  // --- Stars (procedural, seeded) ---
  for (let i = 0; i < 80; i++) {
    const sx = hash(i, 11) * W;
    const sy = hash(i, 22) * horizonY * 0.85;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + i));
    const r = hash(i, 33) * 1.4 + 0.3;
    ctx.fillStyle = `rgba(255,240,255,${0.6 * twinkle * fade})`;
    ctx.fillRect(sx, sy, r, r);
  }

  // --- Horizon sun (semi-circle with stripes) ---
  const sunR = Math.min(W, H) * 0.22;
  const sunCx = W * 0.5;
  const sunCy = horizonY - sunR * 0.1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunCx, sunCy, sunR, Math.PI, TAU);
  ctx.clip();
  const sunGrad = ctx.createLinearGradient(0, sunCy - sunR, 0, sunCy);
  sunGrad.addColorStop(0, `hsla(${hueHorizon - 20}, 100%, 75%, ${fade})`);
  sunGrad.addColorStop(0.5, `hsla(${hueHorizon}, 100%, 60%, ${fade})`);
  sunGrad.addColorStop(1, `hsla(${hueHorizon + 20}, 100%, 45%, ${fade})`);
  ctx.fillStyle = sunGrad;
  ctx.fillRect(sunCx - sunR, sunCy - sunR, sunR * 2, sunR);

  // Horizontal stripe bands over the sun
  ctx.fillStyle = 'rgba(10,2,20,0.85)';
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const band = sunCy - sunR + (sunR / stripes) * (i + 0.15 + Math.sin(t * 0.3 + i) * 0.08);
    const hBand = sunR / stripes * 0.35;
    ctx.fillRect(sunCx - sunR, band, sunR * 2, hBand);
  }
  ctx.restore();

  // Sun outer glow
  const glow = ctx.createRadialGradient(sunCx, sunCy, sunR * 0.8, sunCx, sunCy, sunR * 2);
  glow.addColorStop(0, `hsla(${hueHorizon}, 100%, 60%, ${0.45 * fade})`);
  glow.addColorStop(1, 'hsla(320, 100%, 50%, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizonY + sunR);

  // --- Ground gradient ---
  const ground = ctx.createLinearGradient(0, horizonY, 0, H);
  ground.addColorStop(0, '#1a0238');
  ground.addColorStop(1, '#04000a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // --- Perspective grid: horizontal lines (scrolling toward camera) ---
  ctx.strokeStyle = `hsla(${hueGrid}, 90%, 70%, ${0.75 * fade})`;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = `hsla(${hueGrid}, 100%, 70%, 0.8)`;
  ctx.shadowBlur = 8;

  const scroll = (t * scrollSpeed) % 1;
  for (let i = 0; i < lineCount; i++) {
    // u = 0 (horizon) .. 1 (camera)
    const u = (i / lineCount + scroll) % 1;
    const eased = u * u;        // perspective compression near horizon
    const y = horizonY + eased * (H - horizonY);
    const a = 0.3 + 0.7 * u;
    ctx.globalAlpha = a * fade;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Perspective grid: vertical lines converging to vanishing point ---
  ctx.strokeStyle = `hsla(${hueGrid}, 95%, 75%, ${0.65 * fade})`;
  ctx.lineWidth = 1.2;
  const vanishX = W * 0.5;
  for (let i = 0; i <= colCount; i++) {
    const col = (i / colCount - 0.5) * 2;
    const xBottom = W * 0.5 + col * W * 1.4;
    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(xBottom, H);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // --- Horizon neon bar ---
  const horizonBar = ctx.createLinearGradient(0, horizonY - 2, 0, horizonY + 4);
  horizonBar.addColorStop(0, 'rgba(255,255,255,0)');
  horizonBar.addColorStop(0.5, `hsla(${hueHorizon}, 100%, 85%, ${fade})`);
  horizonBar.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizonBar;
  ctx.fillRect(0, horizonY - 2, W, 6);
}
