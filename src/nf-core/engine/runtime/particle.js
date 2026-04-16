// ─────────────────────────────────────────────────────────────
// Particle Runtime — 确定性粒子系统 (v0.9 walking skeleton)
//
// Contract (ADR-020 / architecture/v09-scene-engines.md):
//   scene.render(host, t, params, vp) → { emitter, field?, render }
//   emitter : { count, seed, lifespan?, spawn?: (rng,i) => {x,y,...} }
//   field?  : (x, y, t) => { vx, vy } OR (x, y, t) => { x, y }（preferred: pure pos）
//   render  : (ctx, particle, t) => void  — draws one particle on canvas 2D
//
// Frame-pure: particle state = f(id, t, seed). No Math.random — use mulberry32.
// No internal rAF. Gallery drives t externally.
// ─────────────────────────────────────────────────────────────

// Deterministic PRNG (POC-P1 verified). Exported so scenes can `import { mulberry32 }`.
export function mulberry32(seed) {
  return function() {
    let x = seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    x = Math.imul(x ^ x>>>15, 1 | x);
    x = x + Math.imul(x ^ x>>>7, 61 | x) ^ x;
    return ((x ^ x>>>14) >>> 0) / 4294967296;
  };
}

// Render one frame at time t. Builds particles by replaying emitter per id,
// evaluates field (if any) at t, calls scene.render per particle.
export function renderParticle(ctx2d, t, scene, params, vp) {
  if (!ctx2d) return;
  const width = Math.max(0, Math.floor(Number(vp && vp.width) || 0));
  const height = Math.max(0, Math.floor(Number(vp && vp.height) || 0));
  ctx2d.clearRect(0, 0, width, height);

  const config = resolveParticleConfig(scene, t, params, vp);
  if (!config.render) return;

  eachParticle(config, t, vp, (particle) => {
    ctx2d.save();
    config.render(ctx2d, particle, t);
    ctx2d.restore();
  });
}

// Dump serializable particle state for frame-pure proof (POC-P1 method).
export function dumpState(t, scene, params, vp) {
  const config = resolveParticleConfig(scene, t, params, vp);
  const snapshots = [];
  eachParticle(config, t, vp, (particle) => {
    snapshots.push(snapshotParticle(particle));
  });
  return snapshots;
}

// Default spawn (used by renderParticle when scene doesn't provide emitter.spawn):
export function defaultSpawn(rng, i, vp) {
  const width = Math.max(1, Number(vp && vp.width) || 1);
  const height = Math.max(1, Number(vp && vp.height) || 1);
  const depth = rng() * 0.8 + 0.2;
  return {
    i,
    x: rng() * width,
    y: rng() * height,
    depth,
    size: 0.75 + depth * 2.25,
    alpha: 0.2 + depth * 0.7,
    hue: rng() * 360,
  };
}

function resolveParticleConfig(scene, t, params, vp) {
  const out = scene && typeof scene.render === "function"
    ? scene.render(null, t, params || {}, vp || {})
    : null;
  const emitter = normalizeEmitter(out && out.emitter, vp);
  return {
    emitter,
    field: out && typeof out.field === "function" ? out.field : null,
    render: out && typeof out.render === "function" ? out.render : null,
  };
}

function normalizeEmitter(rawEmitter, vp) {
  const emitter = rawEmitter && typeof rawEmitter === "object" ? rawEmitter : {};
  const count = Math.max(0, Math.floor(Number(emitter.count) || 0));
  const seed = Math.floor(Number(emitter.seed) || 0);
  const spawn = typeof emitter.spawn === "function"
    ? emitter.spawn
    : (rng, i) => defaultSpawn(rng, i, vp);
  return {
    count,
    seed,
    spawn,
  };
}

function eachParticle(config, t, vp, visit) {
  if (!config || !config.emitter || typeof visit !== "function") return;
  const count = config.emitter.count;
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(config.emitter.seed + i * 37);
    const spawned = config.emitter.spawn(rng, i, vp);
    const particle = normalizeParticle(spawned, i, rng, vp);
    if (config.field) {
      const delta = config.field(particle.x, particle.y, t);
      if (delta && typeof delta === "object") Object.assign(particle, delta);
    }
    finalizeParticle(particle, vp);
    visit(particle, i);
  }
}

function normalizeParticle(source, i, rng, vp) {
  const base = source && typeof source === "object" ? { ...source } : defaultSpawn(rng, i, vp);
  base.i = i;
  if (!Number.isFinite(base.depth)) base.depth = rng() * 0.8 + 0.2;
  if (!Number.isFinite(base.x)) base.x = rng() * (Number(vp && vp.width) || 1);
  if (!Number.isFinite(base.y)) base.y = rng() * (Number(vp && vp.height) || 1);
  if (!Number.isFinite(base.size)) base.size = 0.75 + base.depth * 2.25;
  if (!Number.isFinite(base.alpha)) base.alpha = 0.2 + base.depth * 0.7;
  if (!Number.isFinite(base.hue)) base.hue = rng() * 360;
  return base;
}

function finalizeParticle(particle, vp) {
  const width = Math.max(1, Number(vp && vp.width) || 1);
  const height = Math.max(1, Number(vp && vp.height) || 1);
  particle.x = finiteOr(particle.x, width * 0.5);
  particle.y = finiteOr(particle.y, height * 0.5);
  particle.depth = finiteOr(particle.depth, 1);
  particle.size = Math.max(0.1, finiteOr(particle.size, 1));
  particle.alpha = clamp01(finiteOr(particle.alpha, 1));
  if ("vx" in particle) particle.vx = finiteOr(particle.vx, 0);
  if ("vy" in particle) particle.vy = finiteOr(particle.vy, 0);
  if ("hue" in particle) particle.hue = finiteOr(particle.hue, 0);
}

function snapshotParticle(particle) {
  const snapshot = {};
  for (const key of Object.keys(particle).sort()) {
    const value = particle[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      snapshot[key] = round6(value);
    } else if (typeof value === "string" || typeof value === "boolean" || value == null) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
