function lerp(a, b, t) {
  return a + (b - a) * t;
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
 * Render a rotating ripple mesh with pseudo-3D depth cues.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Mesh density, palette, and motion parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function meshGrid(t, params = {}, ctx, _globalT = 0) {
  const {
    cols = 20,
    rows = 14,
    hueA = 200,
    hueB = 320,
    waveSpeed = 0.7,
    waveAmp = 0.18,
    perspective = 0.45,
    lineWidth = 1.4,
  } = params;

  const safeCols = Math.max(2, Math.round(cols));
  const safeRows = Math.max(2, Math.round(rows));
  const depthBias = Math.max(0, Math.min(1, perspective));
  const strokeWidth = Math.max(0.5, lineWidth);
  const { width, height } = resolveSize(ctx);
  const centerX = width * 0.5;
  const centerY = height * 0.54;
  const meshWidth = width * 0.74;
  const meshHeight = height * 0.54;
  const rotation = t * 0.16 + Math.sin(t * 0.27) * 0.22;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = [];

  const backdrop = ctx.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "#07111f");
  backdrop.addColorStop(0.52, "#040913");
  backdrop.addColorStop(1, "#010204");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  const ambient = ctx.createRadialGradient(centerX, height * 0.4, 0, centerX, centerY, Math.hypot(width, height) * 0.72);
  ambient.addColorStop(0, `hsla(${hueA}, 95%, 58%, 0.12)`);
  ambient.addColorStop(0.45, `hsla(${lerp(hueA, hueB, 0.45)}, 90%, 40%, 0.08)`);
  ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  for (let gridY = 0; gridY <= safeRows; gridY += 1) {
    const row = [];
    const rowT = gridY / safeRows;
    const perspectiveScale = 1 - depthBias + depthBias * rowT;
    for (let gridX = 0; gridX <= safeCols; gridX += 1) {
      const baseX = (gridX / safeCols - 0.5) * meshWidth;
      const baseY = (rowT - 0.5) * meshHeight;
      const wave = Math.sin((gridX - safeCols * 0.5) * 0.5 + t * waveSpeed) * waveAmp * height;
      const warpedY = (baseY + wave) * perspectiveScale;
      const rotatedX = baseX * cosRotation - warpedY * sinRotation;
      const rotatedY = baseX * sinRotation + warpedY * cosRotation;

      row.push({
        x: centerX + rotatedX,
        y: centerY + rotatedY,
      });
    }
    points.push(row);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let gridY = 0; gridY <= safeRows; gridY += 1) {
    const rowT = gridY / safeRows;
    const hue = lerp(hueA, hueB, rowT);
    const alpha = 0.38 + rowT * 0.34;
    for (let gridX = 0; gridX < safeCols; gridX += 1) {
      const a = points[gridY][gridX];
      const b = points[gridY][gridX + 1];

      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, 0.2)`;
      ctx.lineWidth = Math.max(3, strokeWidth + 1.6);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = `hsla(${hue}, 100%, 76%, ${alpha})`;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  for (let gridY = 0; gridY < safeRows; gridY += 1) {
    const rowT = (gridY + 0.5) / safeRows;
    const hue = lerp(hueA, hueB, rowT);
    const alpha = 0.34 + rowT * 0.32;
    for (let gridX = 0; gridX <= safeCols; gridX += 1) {
      const a = points[gridY][gridX];
      const b = points[gridY + 1][gridX];

      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, 0.2)`;
      ctx.lineWidth = Math.max(3, strokeWidth + 1.6);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = `hsla(${hue}, 100%, 78%, ${alpha})`;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  const vignette = ctx.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.18, centerX, centerY, Math.hypot(width, height) * 0.78);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
