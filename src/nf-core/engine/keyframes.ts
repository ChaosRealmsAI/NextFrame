// keyframes.js — resolve keyframed params to static values at time t.
// A param value can be static (number/string/boolean) or a keyframe object:
//   { keys: [[0, 24], [1, 48], [4, 48], [5, 24]], ease: "easeOut" }
// resolveKeyframes(params, t) returns a new object with all keys resolved.

function clamp01(value: any) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeTime(value: any) {
  return clamp01(value);
}

export function linear(t: any) {
  return normalizeTime(t);
}

export function easeIn(t: any) {
  const p = normalizeTime(t);
  return p * p;
}

export function easeOut(t: any) {
  const p = normalizeTime(t);
  return p * (2 - p);
}

export function easeInOut(t: any) {
  const p = normalizeTime(t);
  return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
}

export function spring(t: any) {
  const p = normalizeTime(t);
  return 1 - Math.cos(p * Math.PI * 0.5) * Math.exp(-6 * p);
}

export function bounce(t: any) {
  let p = normalizeTime(t);
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) {
    p -= 1.5 / d;
    return n * p * p + 0.75;
  }
  if (p < 2.5 / d) {
    p -= 2.25 / d;
    return n * p * p + 0.9375;
  }
  p -= 2.625 / d;
  return n * p * p + 0.984375;
}

export function elastic(t: any) {
  const p = normalizeTime(t);
  return p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p - 0.1) * 5 * Math.PI) + 1;
}

export function expo(t: any) {
  const p = normalizeTime(t);
  return p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

export function back(t: any) {
  const p = normalizeTime(t);
  const c = 1.70158;
  const c3 = c + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

export function circ(t: any) {
  const p = normalizeTime(t);
  return Math.sqrt(1 - Math.pow(p - 1, 2));
}

export function springConfigurable(t: any, config = {}) {
  const p = normalizeTime(t);
  const damping = Math.max(0.0001, config.damping ?? 12);
  const stiffness = Math.max(0.0001, config.stiffness ?? 180);
  const mass = Math.max(0.0001, config.mass ?? 1);
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega0 * p);
    return 1 - envelope * (
      Math.cos(omegaD * p) +
      (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * p)
    );
  }

  return 1 - Math.exp(-omega0 * p) * (1 + omega0 * p);
}

export function cubicBezier(x1: any, y1: any, x2: any, y2: any) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t: any) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t: any) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleDerivativeX(t: any) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  return (t: any) => {
    const p = normalizeTime(t);
    if (p === 0 || p === 1) return p;

    let parameter = p;
    for (let i = 0; i < 8; i++) {
      const x = sampleCurveX(parameter) - p;
      const dx = sampleDerivativeX(parameter);
      if (Math.abs(x) < 1e-6) return sampleCurveY(parameter);
      if (Math.abs(dx) < 1e-6) break;
      parameter -= x / dx;
    }

    let low = 0;
    let high = 1;
    parameter = p;
    for (let i = 0; i < 12; i++) {
      const x = sampleCurveX(parameter);
      if (Math.abs(x - p) < 1e-6) break;
      if (x < p) low = parameter;
      else high = parameter;
      parameter = (low + high) * 0.5;
    }
    return sampleCurveY(parameter);
  };
}

export function steps(count: any) {
  const safeCount = Math.max(1, Math.floor(count || 1));
  return (t: any) => {
    const p = normalizeTime(t);
    if (p === 1) return 1;
    return Math.floor(p * safeCount) / safeCount;
  };
}

const EASINGS = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  spring,
  bounce,
  elastic,
  expo,
  back,
  circ,
  springConfigurable,
  cubicBezier,
  steps,
};

/**
 * Resolve all keyframed params to static values at time t.
 * @param {object} params — clip params (may contain keyframe objects)
 * @param {number} t — local clip time in seconds
 * @returns {object} — resolved params with static values only
 */
export function resolveKeyframes(params: any, t: any) {
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
export function isKeyframed(val: any) {
  return val !== null && typeof val === "object" && Array.isArray(val.keys) && val.keys.length >= 1;
}

/**
 * Interpolate a keyframed value at time t.
 * @param {{ keys: [number, any][], ease?: string }} kf
 * @param {number} t
 * @returns {any}
 */
export function interpolate(kf: any, t: any) {
  const keys = kf.keys;
  const ease = resolveEasing(kf.ease);

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
function lerpValue(a: any, b: any, p: any) {
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
function lerpColor(hexA: any, hexB: any, p: any) {
  const [rA, gA, bA] = hexToRgb(hexA);
  const [rB, gB, bB] = hexToRgb(hexB);
  const r = Math.round(rA + (rB - rA) * p);
  const g = Math.round(gA + (gB - gA) * p);
  const b = Math.round(bA + (bB - bA) * p);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hexToRgb(hex: any) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function resolveEasing(ease: any) {
  if (typeof ease === "function") return ease;
  if (typeof ease === "string" && EASINGS[ease]) {
    if (ease === "springConfigurable") return (t: any) => springConfigurable(t);
    return EASINGS[ease];
  }
  return EASINGS.linear;
}

export { EASINGS };
