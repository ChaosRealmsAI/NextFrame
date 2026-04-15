// Shared animation utilities — CSS property parsing, clamping, and interpolation helpers
const CSS_PROP_CACHE = new Map();

export function clamp(value: number, min: number, max: number) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function round(value: number, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

export function percent(value: number) {
  return `${round(value, 4)}%`;
}

export function px(value: number) {
  return `${round(value, 4)}px`;
}

export function joinTransforms(...parts: (string | false | null | undefined)[]) {
  const filtered = parts.flat().filter(Boolean);
  return filtered.length > 0 ? filtered.join(" ") : "none";
}

export function inset(top: number, right: number, bottom: number, left: number) {
  return `inset(${percent(top)} ${percent(right)} ${percent(bottom)} ${percent(left)})`;
}

export function circle(radiusPercent: number, x = "50%", y = "50%") {
  return `circle(${percent(radiusPercent)} at ${x} ${y})`;
}

export function toCssPropertyName(name: string) {
  if (CSS_PROP_CACHE.has(name)) {
    return CSS_PROP_CACHE.get(name);
  }
  const cssName = name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (match: string) => `-${match.toLowerCase()}`);
  CSS_PROP_CACHE.set(name, cssName);
  return cssName;
}

export function normalizeStyle(style: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "opacity") {
      out.opacity = round(clamp01(value as number), 4);
      continue;
    }
    out[key] = typeof value === "number" ? round(value, 4) : value;
  }
  return out;
}

export function serializeStyle(style = {}) {
  const normalized = normalizeStyle(style);
  return Object.entries(normalized)
    .map(([key, value]) => `${toCssPropertyName(key)}:${value}`)
    .join(";");
}
