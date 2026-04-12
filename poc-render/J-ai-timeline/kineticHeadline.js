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

export function kineticHeadline(t, params = {}, ctx, _globalT = 0) {
  const {
    text = "NEXTFRAME",
    subtitle = "Frame-pure scene library",
    hueStart = 30,
    hueEnd = 320,
    stagger = 0.18,
    size = 0.12,
  } = params;

  const { width, height } = resolveSize(ctx);
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07060c");
  background.addColorStop(1, "#0e0a18");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const lineReveal = easeOutCubic(smoothstep(0, 0.5, t));
  if (lineReveal > 0) {
    const lineY = height * 0.38;
    const lineWidth = width * 0.18 * lineReveal;
    const lineX = width * 0.5 - lineWidth / 2;
    const lineGradient = ctx.createLinearGradient(lineX, 0, lineX + lineWidth, 0);
    lineGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    lineGradient.addColorStop(0.5, `hsla(${hueStart}, 90%, 70%, 0.9)`);
    lineGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = lineGradient;
    ctx.fillRect(lineX, lineY, lineWidth, 2);
  }

  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const visibleWords = words.length > 0 ? words : ["NEXTFRAME"];
  const fontPx = Math.max(24, height * size);
  ctx.font = `900 ${fontPx}px -apple-system, "SF Pro Display", "PingFang SC", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const spaceWidth = ctx.measureText(" ").width;
  const widths = visibleWords.map((word) => ctx.measureText(word).width);
  const totalWidth = widths.reduce((sum, wordWidth) => sum + wordWidth, 0)
    + spaceWidth * (visibleWords.length - 1);
  const startX = width * 0.5 - totalWidth / 2;
  const centerY = height * 0.5;

  let cursorX = startX;
  for (let i = 0; i < visibleWords.length; i += 1) {
    const word = visibleWords[i];
    const wordWidth = widths[i];
    const wordStart = 0.3 + i * stagger;
    const wordEnd = wordStart + 0.45;
    const reveal = easeOutCubic(smoothstep(wordStart, wordEnd, t));

    if (reveal > 0.001) {
      const offsetY = (1 - reveal) * fontPx * 0.5;
      const hue = hueStart + ((hueEnd - hueStart) * (i / Math.max(1, visibleWords.length - 1)));
      const gradient = ctx.createLinearGradient(cursorX, centerY - fontPx / 2, cursorX, centerY + fontPx / 2);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 88%, ${reveal})`);
      gradient.addColorStop(0.5, `hsla(${hue}, 95%, 72%, ${reveal})`);
      gradient.addColorStop(1, `hsla(${hue + 20}, 90%, 58%, ${reveal})`);

      ctx.save();
      ctx.beginPath();
      const clipHeight = fontPx * 1.6 * reveal;
      ctx.rect(cursorX - 4, centerY - clipHeight / 2 + (1 - reveal) * 8, wordWidth + 8, clipHeight);
      ctx.clip();
      ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${0.55 * reveal})`;
      ctx.shadowBlur = 24;
      ctx.fillStyle = gradient;
      ctx.fillText(word, cursorX, centerY + offsetY);
      ctx.restore();
    }

    cursorX += wordWidth + spaceWidth;
  }

  const subtitleReveal = smoothstep(
    0.3 + visibleWords.length * stagger,
    0.9 + visibleWords.length * stagger,
    t,
  );
  if (subtitleReveal > 0.001) {
    ctx.font = `500 ${Math.max(11, height * 0.018)}px "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(220, 210, 255, ${0.55 * subtitleReveal})`;
    ctx.fillText(subtitle, width * 0.5, height * 0.62);
  }

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * smoothstep(0, 0.4, t)})`;
  ctx.lineWidth = 1;
  const pad = Math.min(width, height) * 0.04;
  const tick = Math.min(width, height) * 0.02;
  const corners = [
    [pad, pad],
    [width - pad, pad],
    [pad, height - pad],
    [width - pad, height - pad],
  ];

  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.moveTo(x - tick, y);
    ctx.lineTo(x + tick, y);
    ctx.moveTo(x, y - tick);
    ctx.lineTo(x, y + tick);
    ctx.stroke();
  }
}
