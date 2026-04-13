/**
 * NextFrame Engine v2 — easing, effects, transitions, keyframes
 */

var clamp = typeof globalThis.clamp === 'function'
  ? globalThis.clamp
  : function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

var easeOutCubic = typeof globalThis.easeOutCubic === 'function'
  ? globalThis.easeOutCubic
  : function easeOutCubic(value) {
    return 1 - ((1 - value) ** 3);
  };

var easeInCubic = typeof globalThis.easeInCubic === 'function'
  ? globalThis.easeInCubic
  : function easeInCubic(value) {
    return value ** 3;
  };

globalThis.clamp = clamp;
globalThis.easeOutCubic = easeOutCubic;
globalThis.easeInCubic = easeInCubic;

function clamp01(v) {
  return clamp(v, 0, 1);
}

function parseEffect(str) {
  if (!str || str === 'none') return null;
  const parts = str.trim().split(/\s+/);
  const type = parts[0];
  const dur = parseFloat(parts[1]) || 0.5;
  return { type, dur };
}

function calcEnterEffect(effect, localT) {
  if (!effect) return { opacity: 1, transform: '' };
  if (localT >= effect.dur) return { opacity: 1, transform: '' };
  const p = easeOutCubic(clamp01(localT / effect.dur));
  switch (effect.type) {
    case 'fadeIn':
      return { opacity: p, transform: '' };
    case 'slideUp':
      return { opacity: p, transform: `translateY(${(1 - p) * 40}px)` };
    case 'slideDown':
      return { opacity: p, transform: `translateY(${(p - 1) * 40}px)` };
    case 'slideLeft':
      return { opacity: p, transform: `translateX(${(1 - p) * 60}px)` };
    case 'slideRight':
      return { opacity: p, transform: `translateX(${(p - 1) * 60}px)` };
    case 'scaleIn':
      return { opacity: p, transform: `scale(${0.85 + 0.15 * p})` };
    default:
      return { opacity: p, transform: '' };
  }
}

function calcExitEffect(effect, localT, dur) {
  if (!effect) return { opacity: 1, transform: '' };
  const exitStart = dur - effect.dur;
  if (localT < exitStart) return { opacity: 1, transform: '' };
  const p = easeInCubic(clamp01((localT - exitStart) / effect.dur));
  switch (effect.type) {
    case 'fadeOut':
      return { opacity: 1 - p, transform: '' };
    case 'slideDown':
      return { opacity: 1 - p, transform: `translateY(${p * 40}px)` };
    case 'scaleOut':
      return { opacity: 1 - p, transform: `scale(${1 - 0.15 * p})` };
    default:
      return { opacity: 1 - p, transform: '' };
  }
}

function parseTransition(str) {
  if (!str || str === 'none') return null;
  const parts = str.trim().split(/\s+/);
  const type = parts[0];
  const dur = parseFloat(parts[1]) || 0.5;
  return { type, dur };
}

function calcTransitionStyle(transition, progress) {
  if (!transition) return {};
  const p = easeOutCubic(clamp01(progress));
  switch (transition.type) {
    case 'dissolve':
      return { opacity: p };
    case 'wipeLeft':
      return { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    case 'wipeRight':
      return { clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` };
    case 'wipeUp':
      return { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` };
    case 'wipeDown':
      return { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` };
    case 'slideLeft':
      return { transform: `translateX(${(1 - p) * 100}%)` };
    case 'slideRight':
      return { transform: `translateX(${(p - 1) * 100}%)` };
    case 'slideUp':
      return { transform: `translateY(${(1 - p) * 100}%)` };
    case 'slideDown':
      return { transform: `translateY(${(p - 1) * 100}%)` };
    case 'zoomIn':
      return { opacity: p, transform: `scale(${0.5 + 0.5 * p})` };
    default:
      return { opacity: p };
  }
}

function isKeyframed(v) {
  return v && typeof v === 'object' && Array.isArray(v.keys) && v.keys.length > 0;
}

function evalKeyframe(kf, t) {
  const keys = kf.keys;
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];

  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const eased = kf.ease === 'linear' ? p
        : kf.ease === 'easeIn' ? easeInCubic(p)
        : easeOutCubic(p);
      if (typeof v0 === 'number' && typeof v1 === 'number') {
        return v0 + (v1 - v0) * eased;
      }
      const n0 = parseFloat(v0);
      const n1 = parseFloat(v1);
      if (Number.isFinite(n0) && Number.isFinite(n1)) {
        const suffix = String(v0).replace(/^[-\d.]+/, '');
        return (n0 + (n1 - n0) * eased).toFixed(2) + suffix;
      }
      return p < 0.5 ? v0 : v1;
    }
  }
  return keys[keys.length - 1][1];
}

function resolveLayerProp(layer, prop, localT, fallback) {
  const v = layer[prop];
  if (v == null) return fallback;
  if (isKeyframed(v)) return evalKeyframe(v, localT);
  return v;
}
