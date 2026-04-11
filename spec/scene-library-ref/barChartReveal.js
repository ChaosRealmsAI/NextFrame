// ============================================================
// barChartReveal — Category: Data Viz
// ----------------------------------------------------------------
// Editorial bar chart with staggered grow-in, value labels that
// count up, a subtle grid and axis. Colors cycle along a palette.
// Think Bloomberg / Stripe press kit.
// ============================================================

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

export function barChartReveal(t, params = {}, ctx, globalT = 0) {
  const {
    data = [
      { label: 'JAN', value: 42 },
      { label: 'FEB', value: 68 },
      { label: 'MAR', value: 55 },
      { label: 'APR', value: 81 },
      { label: 'MAY', value: 73 },
      { label: 'JUN', value: 96 },
      { label: 'JUL', value: 88 },
    ],
    title = 'MONTHLY GROWTH',
    unit = '%',
    hueStart = 200,  // cyan
    hueEnd = 320,    // magenta
    stagger = 0.12,
    barDur = 0.85,
  } = params;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // --- Background ---
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#08070e');
  bg.addColorStop(1, '#05040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const fadeIn = smoothstep(0, 0.4, t);

  // --- Layout ---
  const padL = W * 0.1;
  const padR = W * 0.06;
  const padT = H * 0.22;
  const padB = H * 0.18;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const chartBottom = padT + chartH;

  const max = Math.max(...data.map((d) => d.value)) * 1.1;

  // --- Title ---
  ctx.fillStyle = `rgba(220, 230, 255, ${0.95 * fadeIn})`;
  ctx.font = `800 ${Math.max(18, H * 0.038)}px -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, padL, padT * 0.35);

  // Subtitle rule
  ctx.font = `500 ${Math.max(9, H * 0.014)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(140, 150, 180, ${fadeIn})`;
  ctx.fillText(`INDEX (${unit})   ·   N=${data.length}`, padL, padT * 0.35 + H * 0.045);

  // --- Y-axis gridlines ---
  const gridCount = 4;
  ctx.strokeStyle = `rgba(255,255,255,${0.06 * fadeIn})`;
  ctx.lineWidth = 1;
  ctx.font = `500 ${Math.max(9, H * 0.013)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(130, 140, 170, ${0.8 * fadeIn})`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= gridCount; i++) {
    const y = padT + (chartH / gridCount) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
    const val = Math.round(max * (1 - i / gridCount));
    ctx.fillText(String(val), padL - 8, y);
  }

  // --- Bars ---
  const gap = chartW / data.length * 0.25;
  const barW = chartW / data.length - gap;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const barStart = 0.3 + i * stagger;
    const p = smoothstep(barStart, barStart + barDur, t);
    const eased = easeOutCubic(p);
    const h = (d.value / max) * chartH * eased;

    const x = padL + i * (barW + gap) + gap / 2;
    const y = chartBottom - h;

    const hue = hueStart + ((hueEnd - hueStart) * (i / Math.max(1, data.length - 1)));

    // Bar gradient
    const grad = ctx.createLinearGradient(0, y, 0, chartBottom);
    grad.addColorStop(0, `hsla(${hue}, 95%, 72%, ${0.95 * fadeIn})`);
    grad.addColorStop(1, `hsla(${hue}, 85%, 42%, ${0.9 * fadeIn})`);
    ctx.fillStyle = grad;

    // Rounded top
    const r = Math.min(barW / 2, 6);
    ctx.beginPath();
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, chartBottom);
    ctx.closePath();
    ctx.fill();

    // Glow top edge
    if (eased > 0.5) {
      ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.6)`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${(eased - 0.5) * 2})`;
      ctx.fillRect(x + 1, y, barW - 2, 2);
      ctx.shadowBlur = 0;
    }

    // Value label (counts up)
    if (eased > 0.15) {
      const shown = Math.round(d.value * eased);
      ctx.fillStyle = `rgba(255,255,255,${eased})`;
      ctx.font = `700 ${Math.max(10, H * 0.02)}px "SF Mono", Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(shown), x + barW / 2, y - 4);
    }

    // X-axis label
    ctx.fillStyle = `rgba(140, 150, 180, ${fadeIn})`;
    ctx.font = `600 ${Math.max(9, H * 0.016)}px "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(d.label, x + barW / 2, chartBottom + 8);
  }

  // --- Baseline ---
  ctx.strokeStyle = `rgba(255,255,255,${0.25 * fadeIn})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, chartBottom);
  ctx.lineTo(padL + chartW, chartBottom);
  ctx.stroke();
}
