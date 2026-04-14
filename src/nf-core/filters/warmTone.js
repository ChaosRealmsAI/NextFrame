// Applies a warm-tone color filter and exposes its matching CSS filter string.
function clamp01(value, fallback) {
  const normalized = value ?? fallback;
  return Math.max(0, Math.min(1, normalized));
}

export function warmTone(data, w, h, params) {
  const intensity = clamp01(params.intensity, 0.5);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, data[i] + 12 * intensity);     // R boost
    data[i + 2] = Math.max(0, data[i + 2] - 8 * intensity);   // B reduce
  }
}

export function getWarmToneCssFilter(params = {}) {
  return "sepia(0.15) saturate(1.2) hue-rotate(-10deg)";
}
