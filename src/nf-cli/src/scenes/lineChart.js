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
 * Render a progressively drawn line chart with gradient stroke and pop-in points.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Chart data and palette parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function lineChart(t, params = {}, ctx, _globalT = 0) {
  const {
    data = [18, 24, 31, 38, 43, 55, 66, 78],
    title = "ACTIVE USERS",
    unit = "%",
    hueStart = 182,
    hueEnd = 310,
    drawStart = 0.2,
    drawEnd = 2.6,
  } = params;

  const series = Array.isArray(data) && data.length >= 2 ? data.map((value) => Number(value) || 0) : [18, 24, 31, 38, 43, 55, 66, 78];
  const { width, height } = resolveSize(ctx);
  const fadeIn = smoothstep(0, 0.45, t);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#081018");
  background.addColorStop(1, "#04070d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const padL = width * 0.11;
  const padR = width * 0.08;
  const padT = height * 0.2;
  const padB = height * 0.18;
  const chartWidth = width - padL - padR;
  const chartHeight = height - padT - padB;
  const bottomY = padT + chartHeight;
  const minValue = Math.min(...series);
  const maxValue = Math.max(...series);
  const range = Math.max(1, maxValue - minValue);
  const reveal = smoothstep(drawStart, drawEnd, t);
  const segments = series.length - 1;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `800 ${Math.max(18, height * 0.038)}px -apple-system, sans-serif`;
  ctx.fillStyle = `rgba(234, 243, 255, ${0.92 * fadeIn})`;
  ctx.fillText(title, padL, padT * 0.28);

  ctx.font = `500 ${Math.max(10, height * 0.014)}px "SF Mono", Menlo, monospace`;
  ctx.fillStyle = `rgba(147, 165, 186, ${0.85 * fadeIn})`;
  ctx.fillText(`TRENDLINE  ·  ${series.length} POINTS`, padL, padT * 0.28 + height * 0.05);

  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.07 * fadeIn})`;
  ctx.fillStyle = `rgba(145, 156, 176, ${0.8 * fadeIn})`;
  ctx.font = `500 ${Math.max(9, height * 0.013)}px "SF Mono", Menlo, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const y = padT + (chartHeight * i) / 4;
    const value = Math.round(maxValue - (range * i) / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartWidth, y);
    ctx.stroke();
    ctx.fillText(`${value}${unit}`, padL - 8, y);
  }

  const points = series.map((value, index) => {
    const x = padL + (chartWidth * index) / segments;
    const y = bottomY - ((value - minValue) / range) * chartHeight;
    return { x, y, value };
  });

  const areaGradient = ctx.createLinearGradient(0, padT, 0, bottomY);
  areaGradient.addColorStop(0, `hsla(${hueStart}, 90%, 60%, ${0.18 * fadeIn})`);
  areaGradient.addColorStop(1, `hsla(${hueEnd}, 95%, 45%, 0)`);

  const maxSegment = reveal * segments;
  const fullSegments = Math.floor(maxSegment);
  const partial = maxSegment - fullSegments;
  const visiblePoints = [points[0]];
  for (let i = 0; i < segments; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (i < fullSegments) {
      visiblePoints.push(end);
      continue;
    }

    if (i === fullSegments && partial > 0) {
      visiblePoints.push({
        x: start.x + (end.x - start.x) * partial,
        y: start.y + (end.y - start.y) * partial,
      });
    }
    break;
  }

  if (visiblePoints.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, bottomY);
    ctx.lineTo(points[0].x, points[0].y);
    for (const point of visiblePoints.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    const lastPoint = visiblePoints[visiblePoints.length - 1];
    ctx.lineTo(lastPoint.x, bottomY);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();

    const lineGradient = ctx.createLinearGradient(padL, 0, padL + chartWidth, 0);
    lineGradient.addColorStop(0, `hsla(${hueStart}, 100%, 70%, ${0.95 * fadeIn})`);
    lineGradient.addColorStop(1, `hsla(${hueEnd}, 100%, 66%, ${0.95 * fadeIn})`);
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = Math.max(2, width * 0.005);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = `hsla(${(hueStart + hueEnd) / 2}, 100%, 68%, ${0.55 * fadeIn})`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
    for (const point of visiblePoints.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `600 ${Math.max(9, height * 0.014)}px "SF Mono", Menlo, monospace`;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const pointProgress = easeOutCubic(smoothstep(i / segments, i / segments + 0.08, reveal));
    if (pointProgress > 0.001) {
      const hue = hueStart + ((hueEnd - hueStart) * i) / segments;
      const radius = Math.max(3, Math.min(width, height) * 0.012 * pointProgress);
      ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${pointProgress})`;
      ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${0.9 * pointProgress})`;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = `rgba(236, 242, 255, ${0.9 * pointProgress})`;
      ctx.fillText(String(i + 1).padStart(2, "0"), point.x, bottomY + 10);
    }
  }

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * fadeIn})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, bottomY);
  ctx.lineTo(padL + chartWidth, bottomY);
  ctx.stroke();
}
