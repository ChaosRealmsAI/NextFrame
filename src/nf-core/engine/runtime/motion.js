// ─────────────────────────────────────────────────────────────
// Motion Runtime — NF-Motion frame-pure vector animation (v0.9 walking skeleton)
//
// Contract (ADR-020 / architecture/v09-scene-engines.md):
//   scene.render(host, t, params, vp) → {
//     duration, size:[w,h], fps?,
//     layers: [{ type, at, behavior?, tracks?, ...shape_props }]
//   }
//
// Frame-pure: all attributes via interp(track, t). No Date.now / performance.now / rAF.
//
// POC reference: tmp/nf-motion/engine.js (215 lines, verified with 13 t-snapshots).
// v0.9 walking keeps signatures only; actual logic migrates from POC in Step 7.
// ─────────────────────────────────────────────────────────────

// Easing functions (POC ref).
// TODO(v0.9 implement): migrate EASE table from tmp/nf-motion/engine.js.
export const EASE = {
  linear: t => t,
  // TODO: in / out / inOut / outBack / outElastic / outBounce
};

// Interpolate [[t, value, ease?], ...] at time t.
// TODO(v0.9 implement): migrate interp from POC, support scalar + tuple values.
export function interp(track, t) {
  // TODO: handle edge cases (empty, before first, after last)
  // TODO: linear search segments, apply easing, lerp values
  void track; void t;
  return 0;
}

// Behavior presets: semantic name → keyframe tracks.
// TODO(v0.9 implement): migrate BEHAVIORS from POC and expand to 12 total.
// First-party: impact / pulse / shake / wobble / pop / orbit / swing / blink /
// dart / rise / drift / typewriter (per ADR-020 firstparty_behaviors).
export const BEHAVIORS = {
  // TODO: impact(startAt, dur) — anticipation → squash → stretch → overshoot → settle
  // TODO: pulse / shake / wobble / pop / ...
};

// Shape library: shape name → SVG inner markup generator.
// TODO(v0.9 implement): migrate SHAPES from POC and expand to 20 (ADR-020 firstparty_shapes).
export const SHAPES = {
  // TODO: heart / star / sparkle / circle / ring / arrow / check / cross /
  // plus / bolt / drop / cloud / leaf / flame / bell / dot / square / triangle /
  // hexagon / path(custom)
};

// Expand special layer types (ripple / burst) + behavior presets into concrete layers.
// TODO(v0.9 implement): migrate expandLayer from POC.
export function expandLayer(layer) {
  // TODO: if type === 'ripple' → one ring layer with scale+opacity tracks
  // TODO: if type === 'burst' → N sparkle layers along circle with offset tracks
  // TODO: if behavior && BEHAVIORS[behavior] → merge preset into layer.tracks
  void layer;
  return [];
}

// Main render: frame-pure render(host, t, motion) produces SVG.
// TODO(v0.9 implement): create <svg>, clear children, flatMap expandLayer, draw each.
export function renderMotion(host, t, motion) {
  // TODO: ensure <svg> + <defs> gradients
  // TODO: for each expanded layer, compute opacity/scale/offset/rotate via interp
  // TODO: create <g transform=...> with shape-defined inner markup
  void host; void t; void motion;
}

// AI-facing: enumerate behaviors for `nextframe motion list-behaviors --json`.
// TODO(v0.9 implement): return behavior metadata (name, params, description).
export function listBehaviors() {
  return Object.keys(BEHAVIORS);
}

// AI-facing: enumerate shapes for `nextframe motion list-shapes --json`.
// TODO(v0.9 implement): return shape metadata.
export function listShapes() {
  return Object.keys(SHAPES);
}
