// keyframes.js — resolve keyframed params to static values at time t.
// A param value can be static (number/string/boolean) or a keyframe object:
//   { keys: [[0, 24], [1, 48], [4, 48], [5, 24]], ease: "easeOut" }
// resolveKeyframes(params, t) returns a new object with all keys resolved.

const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  spring: (t) => 1 - Math.cos(t * Math.PI * 0.5) * Math.exp(-6 * t),
};

/**
 * Resolve all keyframed params to static values at time t.
 * @param {object} params — clip params (may contain keyframe objects)
 * @param {number} t — local clip time in seconds
 * @returns {object} — resolved params with static values only
 */
export function resolveKeyframes(params, t) {
  if (!params || typeof params !== "object") return params;
  const out = {};
  for (const [key, val] of Object.entries(params)) {
    out[key] = isKeyframed(val) ? interpolate(val, t) : val;
  }
  return out;
}

/**
 * Check if a value is a keyframe object.
 */
export function isKeyframed(val) {
  return val !== null && typeof val === "object" && Array.isArray(val.keys) && val.keys.length >= 1;
}

/**
 * Interpolate a keyframed value at time t.
 * @param {{ keys: [number, any][], ease?: string }} kf
 * @param {number} t
 * @returns {any}
 */
export function interpolate(kf, t) {
  const keys = kf.keys;
  const ease = EASINGS[kf.ease] || EASINGS.linear;

  if (keys.length === 1) return keys[0][1];

  // Before first key
  if (t <= keys[0][0]) return keys[0][1];

  // After last key
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];

  // Find surrounding keys
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const raw = (t - t0) / (t1 - t0);
      const progress = ease(raw);
      return lerpValue(v0, v1, progress);
    }
  }

  return keys[keys.length - 1][1];
}

/**
 * Lerp between two values based on type.
 */
function lerpValue(a, b, p) {
  // Numbers — simple lerp
  if (typeof a === "number" && typeof b === "number") {
    return a + (b - a) * p;
  }

  // Colors — hex to HSL lerp
  if (typeof a === "string" && typeof b === "string" && a.startsWith("#") && b.startsWith("#")) {
    return lerpColor(a, b, p);
  }

  // Strings/booleans — snap at 50%
  return p < 0.5 ? a : b;
}

/**
 * Lerp two hex colors in RGB space.
 */
function lerpColor(hexA, hexB, p) {
  const [rA, gA, bA] = hexToRgb(hexA);
  const [rB, gB, bB] = hexToRgb(hexB);
  const r = Math.round(rA + (rB - rA) * p);
  const g = Math.round(gA + (gB - gA) * p);
  const b = Math.round(bA + (bB - bA) * p);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export { EASINGS };
