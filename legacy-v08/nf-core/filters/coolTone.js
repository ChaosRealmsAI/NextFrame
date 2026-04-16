// Applies a cool-tone color filter and exposes its matching CSS filter string.
function clamp01(value, fallback) {
    const normalized = value ?? fallback;
    return Math.max(0, Math.min(1, normalized));
}
export function coolTone(data, w, h, params) {
    const intensity = clamp01(params.intensity, 0.5);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, data[i] - 8 * intensity); // R reduce
        data[i + 2] = Math.min(255, data[i + 2] + 12 * intensity); // B boost
    }
}
export function getCoolToneCssFilter(params = {}) {
    return "saturate(1.1) hue-rotate(10deg) brightness(1.05)";
}
