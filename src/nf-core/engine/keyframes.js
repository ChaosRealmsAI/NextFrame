// keyframes.js — resolve keyframed params to static values at time t.
// A param value can be static (number/string/boolean) or a keyframe object:
//   { keys: [[0, 24], [1, 48], [4, 48], [5, 24]], ease: "easeOut" }
// resolveKeyframes(params, t) returns a new object with all keys resolved.

function bounce(t) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) {
    t -= 1.5 / d;
    return n * t * t + 0.75;
  }
  if (t < 2.5 / d) {
    t -= 2.25 / d;
    return n * t * t + 0.9375;
  }
  t -= 2.625 / d;
  return n * t * t + 0.984375;
}

function elastic(t) {
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
}

function expo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function back(t) {
  const c = 1.70158;
  const c3 = c + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function circ(t) {
  return Math.sqrt(1 - Math.pow(t - 1, 2));
}

function springConfigurable(t, config = {}) {
  const damping = config.damping ?? 12;
  const stiffness = config.stiffness ?? 180;
  const mass = config.mass ?? 1;
  const safeMass = Math.max(mass, 0.0001);
  const omega0 = Math.sqrt(stiffness / safeMass);
  const zeta = damping / (2 * Math.sqrt(stiffness * safeMass));

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega0 * t);
    return 1 - envelope * (
      Math.cos(omegaD * t) +
      (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t)
    );
  }

  return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleDerivativeX(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let param = t;
    for (let i = 0; i < 8; i++) {
      const x = sampleCurveX(param) - t;
      const dx = sampleDerivativeX(param);
      if (Math.abs(x) < 1e-6) return sampleCurveY(param);
      if (Math.abs(dx) < 1e-6) break;
      param -= x / dx;
    }

    let low = 0;
    let high = 1;
    param = t;
    for (let i = 0; i < 10; i++) {
      const x = sampleCurveX(param);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) low = param;
      else high = param;
      param = (low + high) * 0.5;
    }
    return sampleCurveY(param);
  };
}

const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  spring: (t) => 1 - Math.cos(t * Math.PI * 0.5) * Math.exp(-6 * t),
  bounce,
  elastic,
  expo,
  back,
  circ,
  springConfigurable,
  cubicBezier,
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

function resolveEasing(ease) {
  if (typeof ease === "function") return ease;
  if (typeof ease === "string" && EASINGS[ease]) return EASINGS[ease];
  return EASINGS.linear;
}

export { EASINGS, back, bounce, circ, cubicBezier, elastic, expo, springConfigurable };
