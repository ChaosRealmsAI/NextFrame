// Applies a sepia filter and exposes its matching CSS filter string.
function clamp01(value: any, fallback: any) {
  const normalized = value ?? fallback;
  return Math.max(0, Math.min(1, normalized));
}

export function sepia(data: any, w: any, h: any, params: any) {
  const intensity = clamp01(params.intensity, 0.8);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    data[i]     = r + (sr - r) * intensity;
    data[i + 1] = g + (sg - g) * intensity;
    data[i + 2] = b + (sb - b) * intensity;
  }
}

export function getSepiaCssFilter(params = {}) {
  return `sepia(${clamp01(params.intensity, 0.8)})`;
}
