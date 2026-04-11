// ============================================================
// auroraGradient — Category: Backgrounds
// ----------------------------------------------------------------
// A slow-breathing aurora field made of overlapping radial blobs
// that drift on sine curves. Pure Canvas 2D, no images.
//
// Signature: auroraGradient(t, params, ctx, globalT)
//   t        : local clip time (seconds, float)
//   params   : { hueA, hueB, hueC, intensity, grain, safeInset }
//   ctx      : CanvasRenderingContext2D
//   globalT  : global timeline time (seconds)
//
// Frame-pure: every pixel is a pure function of (t, params).
// Calling auroraGradient(3.7, ...) gives the same pixels no matter
// what was rendered before.
// ============================================================

const TAU = Math.PI * 2;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Deterministic hash: (i, salt) -> [0,1)
function hash(i, salt = 0) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177 | 0;
  x = (x ^ (x >>> 16));
  return ((x >>> 0) % 100000) / 100000;
}

export function auroraGradient(t, params = {}, ctx, globalT = 0) {
  const {
    hueA = 270,      // violet
    hueB = 200,      // cyan
    hueC = 320,      // magenta
    intensity = 1.0, // 0..1.5
    grain = 0.04,    // film grain opacity
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // --- Base deep-space gradient (vertical) ---
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#05050c');
  base.addColorStop(0.5, '#0a0714');
  base.addColorStop(1, '#03020a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // --- Fade-in envelope ---
  const fadeIn = smoothstep(0, 0.6, t);

  // --- Aurora blobs (4 of them, different speeds and scales) ---
  const blobs = [
    { hue: hueA, phase: 0.0, speedX: 0.11, speedY: 0.07, amp: 0.28, sizeBase: 0.55 },
    { hue: hueB, phase: 1.7, speedX: 0.09, speedY: 0.13, amp: 0.34, sizeBase: 0.68 },
    { hue: hueC, phase: 3.2, speedX: 0.13, speedY: 0.05, amp: 0.22, sizeBase: 0.42 },
    { hue: (hueA + hueB) / 2, phase: 4.9, speedX: 0.07, speedY: 0.11, amp: 0.30, sizeBase: 0.60 },
  ];

  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    // Pure-function position from t
    const cx = W * (0.5 + Math.sin(t * b.speedX + b.phase) * b.amp);
    const cy = H * (0.5 + Math.cos(t * b.speedY + b.phase * 1.3) * b.amp * 0.7);
    const breath = 0.88 + 0.12 * Math.sin(t * 0.35 + i);
    const radius = Math.min(W, H) * b.sizeBase * breath;

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const a = 0.55 * intensity * fadeIn;
    g.addColorStop(0.00, `hsla(${b.hue}, 90%, 65%, ${a})`);
    g.addColorStop(0.35, `hsla(${b.hue}, 85%, 55%, ${a * 0.55})`);
    g.addColorStop(1.00, `hsla(${b.hue}, 80%, 40%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- Horizontal vignette band (editorial) ---
  ctx.globalCompositeOperation = 'source-over';
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, 'rgba(0,0,0,0.55)');
  band.addColorStop(0.5, 'rgba(0,0,0,0)');
  band.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H);

  // --- Procedural grain (frame-pure: seeded by floor(t*24)) ---
  if (grain > 0) {
    const grainSeed = Math.floor(t * 24);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = grain;
    const step = 3;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const n = hash((x / step) | 0, ((y / step) | 0) + grainSeed * 31);
        const v = Math.floor(n * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, step, step);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
