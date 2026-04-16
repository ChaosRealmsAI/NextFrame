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
// TODO(v0.9 implement): core loop + field integration + per-particle draw dispatch.
export function renderParticle(ctx2d, t, scene, params, vp) {
  // TODO: clear canvas (ctx.fillRect with bg color or transparent)
  // TODO: const { emitter, field, render } = scene.render(null, t, params, vp)
  // TODO: for (let i = 0; i < emitter.count; i++) {
  //   const rng = mulberry32(emitter.seed + i * 37);
  //   const p = emitter.spawn ? emitter.spawn(rng, i) : defaultSpawn(rng, i, vp);
  //   if (field) Object.assign(p, field(p.x, p.y, t));
  //   render(ctx2d, p, t);
  // }
  void ctx2d; void t; void scene; void params; void vp;
}

// Dump serializable particle state for frame-pure proof (POC-P1 method).
// TODO(v0.9 implement): mirror renderParticle's loop but push {x,y,size,alpha} to array instead of drawing.
export function dumpState(t, scene, params, vp) {
  // TODO: same loop as renderParticle but collect snapshots
  // TODO: return JSON-serializable array (not Uint8Array — readable diff)
  void t; void scene; void params; void vp;
  return [];
}

// Default spawn (used by renderParticle when scene doesn't provide emitter.spawn):
// TODO(v0.9 implement): export `defaultSpawn(rng, i, vp)` returning
//   { x: rng()*vp.width, y: rng()*vp.height, depth: rng()*0.8+0.2, hue: rng()*360 }
