// engine-v2/validate.js — validate v0.3 flat layers[] timeline format.

import { REGISTRY } from './registry.js';

export function validateTimeline(timeline) {
  const errors = [];
  const warnings = [];
  const hints = [];

  // Gate 1: required top-level fields
  if (!timeline.width) errors.push({ code: 'MISSING_FIELD', message: 'width is required' });
  if (!timeline.height) errors.push({ code: 'MISSING_FIELD', message: 'height is required' });
  if (!timeline.fps) errors.push({ code: 'MISSING_FIELD', message: 'fps is required' });
  if (!timeline.duration) errors.push({ code: 'MISSING_FIELD', message: 'duration is required' });
  if (!Array.isArray(timeline.layers)) errors.push({ code: 'MISSING_FIELD', message: 'layers[] is required' });
  if (errors.length) return { ok: false, errors, warnings, hints };

  // Gate 2: per-layer checks
  const ids = new Set();
  for (const layer of timeline.layers) {
    // Required fields
    if (!layer.id) errors.push({ code: 'MISSING_ID', message: 'layer missing id' });
    if (!layer.scene) errors.push({ code: 'MISSING_SCENE', message: `layer "${layer.id}" missing scene` });
    if (layer.start == null) errors.push({ code: 'MISSING_START', message: `layer "${layer.id}" missing start` });
    if (!layer.dur) errors.push({ code: 'MISSING_DUR', message: `layer "${layer.id}" missing dur` });

    // Duplicate id
    if (layer.id && ids.has(layer.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `duplicate layer id "${layer.id}"` });
    }
    ids.add(layer.id);

    // Unknown scene
    if (layer.scene && REGISTRY.size > 0 && !REGISTRY.has(layer.scene)) {
      const sample = [...REGISTRY.keys()].slice(0, 5).join(', ');
      errors.push({
        code: 'UNKNOWN_SCENE',
        message: `layer "${layer.id}" uses unknown scene "${layer.scene}"`,
        hint: `available: ${sample}...`,
      });
    }

    // Time sanity
    if (typeof layer.start === 'number' && layer.start < 0) {
      errors.push({ code: 'BAD_TIME', message: `layer "${layer.id}" start < 0` });
    }
    if (typeof layer.dur === 'number' && layer.dur <= 0) {
      errors.push({ code: 'BAD_DUR', message: `layer "${layer.id}" dur <= 0` });
    }

    // Overflow
    if (typeof layer.start === 'number' && typeof layer.dur === 'number') {
      const end = layer.start + layer.dur;
      if (end > timeline.duration + 0.01) {
        warnings.push({
          code: 'OVERFLOW',
          message: `layer "${layer.id}" ends at ${end.toFixed(2)}s but timeline is ${timeline.duration}s`,
        });
      }
    }
  }

  // Gate 7: fullscreen content overlap detection
  // Background scenes (aurora, starfield, vignette, shader*, fluid, neon) are OK to overlap.
  // Content scenes (headline, bulletList, barChart, etc.) should NOT overlap fullscreen.
  const BG_SCENES = new Set([
    'auroraGradient','fluidBackground','neonGrid','vignette','starfield','particleFlow',
    'circleRipple','meshGrid','radialBurst','confetti','waveform','pulseWave',
    'shaderGradient','shaderNoise','shaderGlitch','shaderChromatic','shaderPlasma',
    'shaderTunnel','shaderRipple','shaderFirefly','svgRings',
  ]);
  const contentLayers = timeline.layers.filter(l => {
    if (BG_SCENES.has(l.scene)) return false;
    if (l.blend && l.blend !== 'normal') return false; // blend layers are overlays
    if (l.opacity != null && l.opacity < 0.5) return false; // faint overlays OK
    if (l.x || l.y || l.w || l.h) return false; // positioned = not fullscreen
    return true;
  });
  for (let i = 0; i < contentLayers.length; i++) {
    const a = contentLayers[i];
    const aEnd = a.start + a.dur;
    for (let j = i + 1; j < contentLayers.length; j++) {
      const b = contentLayers[j];
      const bEnd = b.start + b.dur;
      const overlap = Math.min(aEnd, bEnd) - Math.max(a.start, b.start);
      if (overlap > 0.5) { // more than 0.5s overlap
        warnings.push({
          code: 'FULLSCREEN_OVERLAP',
          message: `"${a.id}" (${a.start}-${aEnd.toFixed(1)}s) and "${b.id}" (${b.start}-${bEnd.toFixed(1)}s) overlap ${overlap.toFixed(1)}s — both fullscreen content. Use x/y/w/h to position, or stagger times.`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, hints };
}

/** Detect timeline format version */
export function detectFormat(timeline) {
  if (Array.isArray(timeline.layers)) return 'v0.3';
  if (Array.isArray(timeline.tracks)) return 'v0.1';
  return 'unknown';
}
