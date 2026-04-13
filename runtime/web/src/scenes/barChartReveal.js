function smoothstep(edge0, edge1, x) {
  const clamped = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
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
 * Render a staggered editorial bar chart with count-up labels.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Chart data and styling parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function barChartReveal(t, params = {}, ctx, _globalT = 0) {
  const {
    data = [
      { label: "JAN", value: 42 },
      { label: "FEB", value: 68 },
      { label: "MAR", value: 55 },
      { label: "APR", value: 81 },
      { label: "MAY", value: 73 },
      { label: "JUN", value: 96 },
      { label: "JUL", value: 88 },
    ],
    title = "MONTHLY GROWTH",
    unit = "%",
    hueStart = 200,
    hueEnd = 320,
    stagger = 0.12,
    barDur = 0.85,
  } = params;

  const { width, height } = resolveSize(ctx);
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#08070e");
  background.addColorStop(1, "#05040a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const fadeIn = smoothstep(0, 0.4, t);
  const padL = width * 0.1;
  const padR = width * 0.06;
  const padT = height * 0.22;
  const padB = height * 0.18;
  const chartWidth = width - padL - padR;
  const chartHeight = height - padT - padB;
  const chartBottom = padT + chartHeight;
  const maxValue = Math.max(1, ...data.map((entry) => entry.value)) * 1.1;

  ctx.fillStyle = `rgba(220, 230, 255, ${0.95 * fadeIn})`;
  ctx.font = `800 ${Math.max(18, height * 0.038)}px -apple-system, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, padL, padT * 0.35);

  ctx.font = `500 ${Math.max(9, height * 0.014)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(140, 150, 180, ${fadeIn})`;
  ctx.fillText(`INDEX (${unit})   ·   N=${data.length}`, padL, padT * 0.35 + height * 0.045);

  const gridCount = 4;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 * fadeIn})`;
  ctx.lineWidth = 1;
  ctx.font = `500 ${Math.max(9, height * 0.013)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(130, 140, 170, ${0.8 * fadeIn})`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= gridCount; i += 1) {
    const y = padT + (chartHeight / gridCount) * i;
    const value = Math.round(maxValue * (1 - i / gridCount));
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartWidth, y);
    ctx.stroke();
    ctx.fillText(String(value), padL - 8, y);
  }

  const gap = (chartWidth / data.length) * 0.25;
  const barWidth = chartWidth / data.length - gap;

  for (let i = 0; i < data.length; i += 1) {
    const entry = data[i];
    const barStart = 0.3 + i * stagger;
    const reveal = easeOutCubic(smoothstep(barStart, barStart + barDur, t));
    const barHeight = (entry.value / maxValue) * chartHeight * reveal;
    const x = padL + i * (barWidth + gap) + gap / 2;
    const y = chartBottom - barHeight;
    const hue = hueStart + ((hueEnd - hueStart) * (i / Math.max(1, data.length - 1)));

    const gradient = ctx.createLinearGradient(0, y, 0, chartBottom);
    gradient.addColorStop(0, `hsla(${hue}, 95%, 72%, ${0.95 * fadeIn})`);
    gradient.addColorStop(1, `hsla(${hue}, 85%, 42%, ${0.9 * fadeIn})`);
    ctx.fillStyle = gradient;

    const radius = Math.min(barWidth / 2, 6);
    ctx.beginPath();
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, chartBottom);
    ctx.closePath();
    ctx.fill();

    if (reveal > 0.5) {
      ctx.shadowColor = `hsla(${hue}, 100%, 70%, 0.6)`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${(reveal - 0.5) * 2})`;
      ctx.fillRect(x + 1, y, barWidth - 2, 2);
      ctx.shadowBlur = 0;
    }

    if (reveal > 0.15) {
      ctx.fillStyle = `rgba(255, 255, 255, ${reveal})`;
      ctx.font = `700 ${Math.max(10, height * 0.02)}px "SF Mono", Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(Math.round(entry.value * reveal)), x + barWidth / 2, y - 4);
    }

    ctx.fillStyle = `rgba(140, 150, 180, ${fadeIn})`;
    ctx.font = `600 ${Math.max(9, height * 0.016)}px "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(entry.label, x + barWidth / 2, chartBottom + 8);
  }

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * fadeIn})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, chartBottom);
  ctx.lineTo(padL + chartWidth, chartBottom);
  ctx.stroke();
}
