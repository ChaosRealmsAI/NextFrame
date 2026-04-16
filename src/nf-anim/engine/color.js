const meta = { name: "color", kind: "engine", description: "Color parsing and interpolation helpers" };
const CACHE = new Map();
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(rgba?|hsla?)\((.*)\)$/i;
const NAMED = {
  aqua: [0, 255, 255, 1, true], black: [0, 0, 0, 1, false], blue: [0, 0, 255, 1, false], cyan: [0, 255, 255, 1, true],
  fuchsia: [255, 0, 255, 1, true], gray: [128, 128, 128, 1, false], green: [0, 128, 0, 1, false], grey: [128, 128, 128, 1, false],
  lime: [0, 255, 0, 1, false], magenta: [255, 0, 255, 1, true], maroon: [128, 0, 0, 1, false], navy: [0, 0, 128, 1, false],
  orange: [255, 165, 0, 1, false], purple: [128, 0, 128, 1, false], red: [255, 0, 0, 1, false], silver: [192, 192, 192, 1, false],
  transparent: [0, 0, 0, 0, true], white: [255, 255, 255, 1, false], yellow: [255, 255, 0, 1, false]
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Math.round(clamp(value, 0, 255));
const alpha = (value) => clamp(Number.isFinite(value) ? value : 1, 0, 1);
const color = (r, g, b, a = 1, hasAlpha = false) => ({ r: round(r), g: round(g), b: round(b), a: alpha(a), hasAlpha });
const clone = (value) => value ? { r: value.r, g: value.g, b: value.b, a: value.a } : null;

function parseHex(value) {
  const hex = value.slice(1);
  if (hex.length === 3) return color(parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16));
  if (hex.length === 6) return color(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  if (hex.length === 8) return color(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16) / 255, true);
  return null;
}

function parsePercent(value) {
  if (!/%$/.test(value)) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hue(tone, p, q) {
  const t = tone < 0 ? tone + 1 : tone > 1 ? tone - 1 : tone;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const tone = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 100) / 100;
  const lit = clamp(l, 0, 100) / 100;
  if (!sat) {
    const gray = lit * 255;
    return [gray, gray, gray];
  }
  const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
  const p = 2 * lit - q;
  return [hue(tone + 1 / 3, p, q) * 255, hue(tone, p, q) * 255, hue(tone - 1 / 3, p, q) * 255];
}

function parseFunction(kind, body) {
  const parts = body.split(",").map((part) => part.trim());
  const hasAlpha = kind === "rgba" || kind === "hsla";
  if (parts.length !== (hasAlpha ? 4 : 3)) return null;
  if (kind === "rgb" || kind === "rgba") {
    const values = parts.map((part) => Number.parseFloat(part));
    return values.every(Number.isFinite) ? color(values[0], values[1], values[2], hasAlpha ? values[3] : 1, hasAlpha) : null;
  }
  const h = Number.parseFloat(parts[0]);
  const s = parsePercent(parts[1]);
  const l = parsePercent(parts[2]);
  const a = hasAlpha ? Number.parseFloat(parts[3]) : 1;
  if (![h, s, l, a].every(Number.isFinite)) return null;
  const [r, g, b] = hslToRgb(h, s, l);
  return color(r, g, b, a, hasAlpha);
}

function readColor(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (CACHE.has(key)) return CACHE.get(key);
  let parsed = null;
  if (key in NAMED) {
    const [r, g, b, a, hasAlpha] = NAMED[key];
    parsed = color(r, g, b, a, hasAlpha);
  } else if (HEX.test(key)) parsed = parseHex(key);
  else {
    const match = key.match(FUNC);
    parsed = match ? parseFunction(match[1], match[2]) : null;
  }
  CACHE.set(key, parsed);
  return parsed;
}

function formatAlpha(value) {
  const fixed = (Math.round(alpha(value) * 1000) / 1000).toFixed(3);
  return fixed.replace(/\.?0+$/, "");
}

function formatColor(value, hasAlpha) {
  return hasAlpha ? `rgba(${value.r},${value.g},${value.b},${formatAlpha(value.a)})` : `rgb(${value.r},${value.g},${value.b})`;
}

export function parseColor(value) {
  return clone(readColor(value));
}

export function lerpColor(left, right, t) {
  const mix = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  if (mix <= 0) return left;
  if (mix >= 1) return right;
  const from = readColor(left);
  const to = readColor(right);
  if (!from || !to) return left;
  return formatColor(color(from.r + (to.r - from.r) * mix, from.g + (to.g - from.g) * mix, from.b + (to.b - from.b) * mix, from.a + (to.a - from.a) * mix), from.hasAlpha || to.hasAlpha || from.a < 1 || to.a < 1);
}

export { meta };
