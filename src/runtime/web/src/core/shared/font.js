export const SANS_FONT_STACK = '-apple-system, "SF Pro Display", "PingFang SC", sans-serif';
export const MONO_FONT_STACK = '"SF Mono", "Fira Code", Menlo, monospace';
export const SERIF_FONT_STACK = '"Iowan Old Style", "Times New Roman", "Songti SC", serif';

/**
 * Resolve a size value to pixels.
 * Accepts: number 0~1 (ratio of S), number >=1 (px), "48px", "large", etc.
 * S = Math.min(containerWidth, containerHeight)
 */
export function resolveSize(value, S, fallback = 0.03) {
  if (value == null) return Math.round(S * fallback);
  if (typeof value === 'number') {
    return value < 1 ? Math.round(S * value) : Math.round(value);
  }
  const str = String(value).trim().toLowerCase();
  const keywords = { xxsmall: 0.012, xsmall: 0.016, small: 0.02, medium: 0.035, large: 0.05, xlarge: 0.07, xxlarge: 0.1 };
  if (keywords[str]) return Math.round(S * keywords[str]);
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? Math.round(parsed < 1 ? S * parsed : parsed) : Math.round(S * fallback);
}

export function shrinkTextToFit(element, options = {}) {
  if (!element) {
    return 0;
  }

  const container = options.container || element.parentElement;
  if (!container) {
    return 0;
  }

  const computed = typeof window !== "undefined" ? window.getComputedStyle(element) : null;
  let fontSize = parseFloat(options.fontSize ?? computed?.fontSize ?? "0");
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return 0;
  }

  const ratio = Number.isFinite(options.maxWidthRatio) ? options.maxWidthRatio : 0.9;
  const containerWidth = options.maxWidth
    ?? container.clientWidth
    ?? container.getBoundingClientRect?.().width
    ?? 0;
  const maxWidth = Math.max(0, containerWidth * ratio);
  const minFontSize = Math.max(1, Number(options.minFontSize) || 1);
  const maxIterations = Math.max(1, Number(options.maxIterations) || 64);

  if (!(maxWidth > 0)) {
    return Math.round(fontSize);
  }

  let iterations = 0;
  while (fontSize > minFontSize && iterations < maxIterations) {
    const tooWide = element.scrollWidth > maxWidth + 1;
    const tooTall = options.maxHeight > 0 && element.scrollHeight > options.maxHeight + 1;
    if (!tooWide && !tooTall) {
      break;
    }

    fontSize -= 1;
    element.style.fontSize = `${fontSize}px`;
    iterations += 1;
  }

  return Math.round(fontSize);
}

Object.assign(globalThis, {
  SANS_FONT_STACK,
  MONO_FONT_STACK,
  SERIF_FONT_STACK,
  resolveSize,
  shrinkTextToFit,
});
