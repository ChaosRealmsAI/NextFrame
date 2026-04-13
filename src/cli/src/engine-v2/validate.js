// engine-v2/validate.js — validate v0.3 flat layers[] timeline format.

import { REGISTRY } from './registry.js';

const BG_SCENES = new Set([
  'auroraGradient','fluidBackground','neonGrid','vignette','starfield','particleFlow',
  'circleRipple','meshGrid','radialBurst','confetti','waveform','pulseWave',
  'matrixRain','gridPattern','svgRings',
  'subtitleBar','marquee','lowerThird','cornerBadge',
  'audioTrack','syncSubs','videoClip',
  'slideChrome','slideFrame',
]);

function hasExplicitBounds(layer) {
  return layer?.x != null || layer?.y != null || layer?.w != null || layer?.h != null;
}

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

    // Gate: ratio mismatch — scene must match timeline aspect ratio
    if (layer.scene && REGISTRY.size > 0 && REGISTRY.has(layer.scene)) {
      const sceneMeta = REGISTRY.get(layer.scene);
      const sceneRatio = sceneMeta?.ratio;
      if (sceneRatio && sceneRatio !== 'any') {
        const isPortrait = timeline.height > timeline.width;
        const isSquare = Math.abs(timeline.width - timeline.height) < 50;
        const aspectRatio = timeline.width / timeline.height;
        const is43 = !isPortrait && !isSquare && aspectRatio >= 1.2 && aspectRatio <= 1.5;
        const timelineRatio = isSquare ? '1:1' : isPortrait ? '9:16' : is43 ? '4:3' : '16:9';
        if (sceneRatio !== timelineRatio) {
          errors.push({
            code: 'RATIO_MISMATCH',
            message: `layer "${layer.id}" uses scene "${layer.scene}" (ratio ${sceneRatio}) but timeline is ${timelineRatio} (${timeline.width}x${timeline.height}). Use the correct ratio variant.`,
          });
        }
      }
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
  // Background scenes (aurora, starfield, vignette, fluid, neon) are OK to overlap.
  // Content scenes (headline, bulletList, barChart, etc.) should NOT overlap fullscreen.
  const contentLayers = timeline.layers.filter(l => {
    if (BG_SCENES.has(l.scene)) return false;
    if (l.blend && l.blend !== 'normal') return false; // blend layers are overlays
    if (l.opacity != null && l.opacity < 0.5) return false; // faint overlays OK
    if (hasExplicitBounds(l)) return false; // positioned = not fullscreen
    return true;
  });
  for (let i = 0; i < contentLayers.length; i++) {
    const a = contentLayers[i];
    const aEnd = a.start + a.dur;
    for (let j = i + 1; j < contentLayers.length; j++) {
      const b = contentLayers[j];
      const bEnd = b.start + b.dur;
      const overlap = Math.min(aEnd, bEnd) - Math.max(a.start, b.start);
      if (overlap > 1.5) { // more than 1.5s overlap (short overlap OK for transitions)
        warnings.push({
          code: 'FULLSCREEN_OVERLAP',
          message: `"${a.id}" (${a.start}-${aEnd.toFixed(1)}s) and "${b.id}" (${b.start}-${bEnd.toFixed(1)}s) overlap ${overlap.toFixed(1)}s — both fullscreen content. Use x/y/w/h to position, or stagger times.`,
        });
      }
    }
  }

  // Gate 8: content safety — size, overflow, safe zone
  const isVertical = timeline.height > timeline.width;
  for (const layer of timeline.layers) {
    // Check fontSize in params
    // v2 scenes use ratio values (0.0–0.15, relative to short edge) — skip px checks for those.
    const fontSize = layer.params?.fontSize;
    if (typeof fontSize === 'number' && fontSize >= 1) {
      // Legacy px-based fontSize
      const minFont = isVertical ? 24 : 18;
      const maxTitle = Math.floor(timeline.width / 20);
      if (fontSize < minFont) {
        warnings.push({
          code: 'FONT_TOO_SMALL',
          message: `layer "${layer.id}" fontSize ${fontSize}px — minimum ${minFont}px for ${isVertical ? '竖屏' : '横屏'}`,
        });
      }
      if (fontSize > maxTitle) {
        warnings.push({
          code: 'FONT_TOO_LARGE',
          message: `layer "${layer.id}" fontSize ${fontSize}px exceeds max ${maxTitle}px for ${timeline.width}px width — text will be clipped`,
        });
      }
    } else if (typeof fontSize === 'number' && fontSize > 0 && fontSize < 1) {
      // Ratio-based fontSize (v2 scenes) — validate ratio range
      const maxRatio = 0.15;
      if (fontSize > maxRatio) {
        warnings.push({
          code: 'FONT_TOO_LARGE',
          message: `layer "${layer.id}" fontSize ratio ${fontSize} exceeds max ratio ${maxRatio} — text may overflow`,
        });
      }
    }

    // Check position overflow (% values)
    if (layer.x != null && layer.w != null) {
      const x = parseFloat(layer.x);
      const w = parseFloat(layer.w);
      if (String(layer.x).includes('%') && String(layer.w).includes('%') && x + w > 102) {
        warnings.push({
          code: 'CONTENT_OVERFLOW',
          message: `layer "${layer.id}" x=${layer.x} + w=${layer.w} exceeds stage width`,
        });
      }
    }
    if (layer.y != null && layer.h != null) {
      const y = parseFloat(layer.y);
      const h = parseFloat(layer.h);
      if (String(layer.y).includes('%') && String(layer.h).includes('%') && y + h > 102) {
        warnings.push({
          code: 'CONTENT_OVERFLOW',
          message: `layer "${layer.id}" y=${layer.y} + h=${layer.h} exceeds stage height`,
        });
      }
    }

    if (isVertical && !BG_SCENES.has(layer.scene) && !hasExplicitBounds(layer)) {
      hints.push({
        code: 'SAFE_ZONE_HINT',
        message: `layer "${layer.id}" is fullscreen in portrait mode without x/y/w/h. Consider safe-zone padding to reduce text clipping near the edges.`,
      });
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
