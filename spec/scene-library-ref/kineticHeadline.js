// ============================================================
// kineticHeadline — Category: Typography
// ----------------------------------------------------------------
// A big editorial headline that reveals word by word with a
// masked slide-up reveal, soft gradient fill on the current word,
// and a subtle motion-blur streak. Think Linear / Vercel blog.
//
// Pure-function: word i reveals at i * stagger, and the reveal
// envelope is a smoothstep over t only. Safe to scrub.
// ============================================================

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

export function kineticHeadline(t, params = {}, ctx, globalT = 0) {
  const {
    text = 'DESIGN IN MOTION',
    subtitle = 'NextFrame · frame-pure scene library',
    hueStart = 30,   // warm gold
    hueEnd = 320,    // magenta
    stagger = 0.18,  // seconds between words
    size = 0.12,     // font size relative to H
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // --- Background wash ---
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#07060c');
  bg.addColorStop(1, '#0e0a18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // --- Thin accent line above the headline ---
  const lineReveal = easeOutCubic(smoothstep(0, 0.5, t));
  if (lineReveal > 0) {
    const lineY = H * 0.38;
    const lineW = W * 0.18 * lineReveal;
    const lineX = W * 0.5 - lineW / 2;
    const lg = ctx.createLinearGradient(lineX, 0, lineX + lineW, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `hsla(${hueStart}, 90%, 70%, 0.9)`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lineX, lineY, lineW, 2);
  }

  // --- Headline words ---
  const words = text.split(' ');
  const fontPx = Math.max(24, H * size);
  ctx.font = `900 ${fontPx}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Measure total width
  const spaceW = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);

  const startX = W * 0.5 - totalW / 2;
  const cy = H * 0.5;

  let cursorX = startX;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordW = widths[i];

    // Per-word reveal timing
    const wordStart = 0.3 + i * stagger;
    const wordEnd = wordStart + 0.45;
    const p = smoothstep(wordStart, wordEnd, t);
    const eased = easeOutCubic(p);

    if (eased > 0.001) {
      // Slide-up offset (from +40px to 0)
      const offsetY = (1 - eased) * fontPx * 0.5;

      // Gradient fill per word
      const hue = hueStart + ((hueEnd - hueStart) * (i / Math.max(1, words.length - 1)));
      const wordGrad = ctx.createLinearGradient(cursorX, cy - fontPx / 2, cursorX, cy + fontPx / 2);
      wordGrad.addColorStop(0, `hsla(${hue}, 100%, 88%, ${eased})`);
      wordGrad.addColorStop(0.5, `hsla(${hue}, 95%, 72%, ${eased})`);
      wordGrad.addColorStop(1, `hsla(${hue + 20}, 90%, 58%, ${eased})`);

      ctx.save();
      // Clip to a slab that grows from bottom to top (mask reveal)
      ctx.beginPath();
      const clipH = fontPx * 1.6 * eased;
      ctx.rect(cursorX - 4, cy - clipH / 2 + (1 - eased) * 8, wordW + 8, clipH);
      ctx.clip();

      // Drop shadow glow
      ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${0.55 * eased})`;
      ctx.shadowBlur = 24;

      ctx.fillStyle = wordGrad;
      ctx.fillText(w, cursorX, cy + offsetY);
      ctx.restore();
    }

    cursorX += wordW + spaceW;
  }

  // --- Subtitle: monospace, faint, fades in last ---
  const subP = smoothstep(0.3 + words.length * stagger, 0.9 + words.length * stagger, t);
  if (subP > 0.001) {
    ctx.font = `500 ${Math.max(11, H * 0.018)}px "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(220, 210, 255, ${0.55 * subP})`;
    ctx.fillText(subtitle, W * 0.5, H * 0.62);
  }

  // --- Corner crosshairs (editorial tick marks) ---
  ctx.strokeStyle = `rgba(255,255,255,${0.18 * smoothstep(0, 0.4, t)})`;
  ctx.lineWidth = 1;
  const pad = Math.min(W, H) * 0.04;
  const tick = Math.min(W, H) * 0.02;
  const corners = [
    [pad, pad], [W - pad, pad],
    [pad, H - pad], [W - pad, H - pad],
  ];
  for (const [cx, cyC] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx - tick, cyC);
    ctx.lineTo(cx + tick, cyC);
    ctx.moveTo(cx, cyC - tick);
    ctx.lineTo(cx, cyC + tick);
    ctx.stroke();
  }
}
