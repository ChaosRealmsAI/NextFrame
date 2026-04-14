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
 * Render a looping editorial countdown with scale-in and shrink-out transitions.
 * @param {number} t - Local clip time in seconds.
 * @param {object} [params={}] - Countdown copy and palette parameters.
 * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
 * @param {number} [_globalT=0] - Global timeline time in seconds.
 * @returns {void}
 */
export function countdown(t, params = {}, ctx, _globalT = 0) {
  const {
    sequence = ["5", "4", "3", "2", "1", "GO"],
    hueStart = 18,
    hueEnd = 145,
    accentHue = 320,
    subtitle = "SYSTEMS ARMED",
  } = params;

  const { width, height } = resolveSize(ctx);
  const entries = Array.isArray(sequence) && sequence.length > 0 ? sequence.map((item) => String(item)) : ["5", "4", "3", "2", "1", "GO"];
  const cycle = entries.length;
  const localT = ((t % cycle) + cycle) % cycle;
  const currentIndex = Math.floor(localT);
  const phase = localT % 1;
  const fadeIn = smoothstep(0, 0.35, t);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07070c");
  background.addColorStop(0.5, "#120712");
  background.addColorStop(1, "#05050a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const sweep = ctx.createLinearGradient(0, 0, width, 0);
  sweep.addColorStop(0, "rgba(255, 255, 255, 0)");
  sweep.addColorStop(0.5, `hsla(${accentHue}, 100%, 70%, ${0.08 * fadeIn})`);
  sweep.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(width * (phase - 0.3), 0, width * 0.28, height);

  const token = entries[currentIndex];
  const hue = hueStart + ((hueEnd - hueStart) * currentIndex) / Math.max(1, cycle - 1);
  const enter = easeOutCubic(smoothstep(0, 0.26, phase));
  const hold = smoothstep(0.18, 0.55, phase);
  const exit = smoothstep(0.62, 1, phase);
  const scale = (0.72 + 0.4 * enter - 0.18 * exit) * (token === "GO" ? 1.08 : 1);
  const blurPx = (1 - enter) * 26 + exit * 14;
  const alpha = Math.max(0.18, (1 - exit * 0.82) * fadeIn);
  const baselineY = height * 0.52;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const halo = ctx.createRadialGradient(width * 0.5, baselineY, 0, width * 0.5, baselineY, Math.min(width, height) * 0.42);
  halo.addColorStop(0, `hsla(${hue}, 100%, 68%, ${0.22 * hold * fadeIn})`);
  halo.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  if ("filter" in ctx) {
    ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  }
  ctx.shadowColor = `hsla(${hue}, 100%, 68%, ${0.65 * alpha})`;
  ctx.shadowBlur = 30;
  ctx.fillStyle = `hsla(${hue}, 100%, 82%, ${alpha * 0.34})`;
  ctx.font = `900 ${Math.max(80, height * 0.3 * scale)}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.fillText(token, width * 0.5, baselineY);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = `hsla(${hue}, 100%, 72%, ${0.9 * alpha})`;
  ctx.shadowBlur = 18;
  const gradient = ctx.createLinearGradient(0, baselineY - height * 0.2, 0, baselineY + height * 0.2);
  gradient.addColorStop(0, `hsla(${hue + 20}, 100%, 90%, ${alpha})`);
  gradient.addColorStop(0.55, `hsla(${hue}, 100%, 74%, ${alpha})`);
  gradient.addColorStop(1, `hsla(${hue - 16}, 95%, 56%, ${alpha})`);
  ctx.fillStyle = gradient;
  ctx.font = `900 ${Math.max(80, height * 0.3 * scale)}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.fillText(token, width * 0.5, baselineY);
  ctx.restore();

  const subReveal = smoothstep(0.08, 0.35, phase) * (1 - smoothstep(0.8, 1, phase));
  ctx.fillStyle = `rgba(230, 233, 255, ${0.55 * subReveal * fadeIn})`;
  ctx.font = `600 ${Math.max(12, height * 0.022)}px "SF Mono", Menlo, monospace`;
  ctx.fillText(subtitle, width * 0.5, height * 0.73);

  const progressY = height * 0.84;
  const progressW = width * 0.36;
  const progressH = Math.max(3, height * 0.008);
  const progressX = width * 0.5 - progressW / 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(progressX, progressY, progressW, progressH);
  const progressFill = ctx.createLinearGradient(progressX, 0, progressX + progressW, 0);
  progressFill.addColorStop(0, `hsla(${accentHue}, 100%, 70%, ${0.8 * fadeIn})`);
  progressFill.addColorStop(1, `hsla(${hue}, 100%, 70%, ${0.8 * fadeIn})`);
  ctx.fillStyle = progressFill;
  ctx.fillRect(progressX, progressY, progressW * phase, progressH);

  const sparkX = progressX + progressW * phase;
  const sparkAlpha = 0.4 + 0.6 * hash(currentIndex, Math.floor(t * 16));
  ctx.fillStyle = `hsla(${hue}, 100%, 88%, ${sparkAlpha * fadeIn})`;
  ctx.fillRect(sparkX - 1, progressY - 2, 2, progressH + 4);
}
