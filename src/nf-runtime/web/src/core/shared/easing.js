export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, progress) {
  return start + ((end - start) * progress);
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - (2 * progress));
}

export function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

export function easeInCubic(value) {
  return value ** 3;
}

export function easeOutBack(value) {
  const overshoot = 1.70158;
  const shifted = value - 1;
  return 1 + ((overshoot + 1) * (shifted ** 3)) + (overshoot * (shifted ** 2));
}

Object.assign(globalThis, {
  clamp,
  lerp,
  smoothstep,
  easeOutCubic,
  easeInCubic,
  easeOutBack,
});
