const meta = { name: "easings", kind: "engine", description: "Deterministic easing registry" };

const clamp01 = (t) => Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
const linear = (t = 0) => clamp01(t);
const easeIn = (t = 0) => { const x = clamp01(t); return x * x; };
const easeOut = (t = 0) => { const x = 1 - clamp01(t); return 1 - x * x; };
const easeInOut = (t = 0) => { const x = clamp01(t); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const outBack = (t = 0) => { const x = clamp01(t); return Math.max(0, Math.min(1.2, x + 0.04 * Math.sin(Math.PI * x) * Math.pow(1 - x, 2))); };
const outElastic = (t = 0) => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
};
const outBounce = (t = 0) => {
  const x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * Math.pow(x - 1.5 / d1, 2) + 0.75;
  if (x < 2.5 / d1) return n1 * Math.pow(x - 2.25 / d1, 2) + 0.9375;
  return n1 * Math.pow(x - 2.625 / d1, 2) + 0.984375;
};
const outQuart = (t = 0) => 1 - Math.pow(1 - clamp01(t), 4);
const outQuint = (t = 0) => 1 - Math.pow(1 - clamp01(t), 5);
const outCubic = (t = 0) => 1 - Math.pow(1 - clamp01(t), 3);
const outExpo = (t = 0) => { const x = clamp01(t); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const outCirc = (t = 0) => Math.sqrt(1 - Math.pow(clamp01(t) - 1, 2));
const spring = (t = 0) => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return 1 - Math.exp(-6 * x) * Math.cos(9 * x);
};
const bounce = (t = 0) => outBounce(t);
const elastic = (t = 0) => outElastic(t);

export const EASE = {
  linear,
  in: easeIn,
  out: easeOut,
  inOut: easeInOut,
  outBack,
  outElastic,
  outBounce,
  outQuart,
  outQuint,
  outCubic,
  outExpo,
  outCirc,
  spring,
  bounce,
  elastic,
};

export { meta };
