/**
 * NextFrame Engine v2 — Runtime for timeline → HTML playback
 *
 * Manages layer lifecycle, renderFrame(t), enter/exit effects,
 * filter/blend CSS mapping. Supports DOM/Canvas/SVG scene types.
 *
 * Usage:
 *   const engine = createEngine(stageEl, timeline, sceneRegistry);
 *   engine.renderFrame(2.5);   // render at t=2.5s
 *   engine.destroy();          // cleanup
 */

// ─── Easing (uses shared utils when available, standalone fallbacks) ───
// In bundled mode, easeOutCubic/easeInCubic/clamp come from scenes-v2-shared.js
// In ESM mode, we import them
import { easeOutCubic, easeInCubic, clamp } from './scenes-v2-shared.js';
function clamp01(v) { return clamp(v, 0, 1); }

// ─── Enter/Exit Effect Calculator ──────────────────────────────
// Format: "fadeIn 0.8s" or "slideUp 0.6s" or "scaleIn 0.5s" or "none"
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

// ─── Layer Style Resolver ──────────────────────────────────────
// Converts layer properties to CSS on the container div
function applyLayerStyle(el, layer) {
  const s = el.style;
  // Position & size (defaults to full-screen)
  if (layer.x || layer.y || layer.w || layer.h) {
    s.position = 'absolute';
    s.left = layer.x || '0';
    s.top = layer.y || '0';
    s.width = layer.w || '100%';
    s.height = layer.h || '100%';
    if (layer.anchor === 'center') {
      s.transform = 'translate(-50%, -50%)';
    }
  } else {
    s.position = 'absolute';
    s.inset = '0';
  }
  if (layer.borderRadius) s.borderRadius = layer.borderRadius;
  if (layer.shadow && layer.shadow !== 'none') s.boxShadow = layer.shadow;
  if (layer.clipPath && layer.clipPath !== 'none') s.clipPath = layer.clipPath;
}

// ─── Engine ────────────────────────────────────────────────────
export function createEngine(stageEl, timeline, sceneRegistry) {
  const { width = 1920, height = 1080, fps = 30, duration = 10, background = '#05050c' } = timeline;
  const layers = timeline.layers || [];

  // Setup stage
  stageEl.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background}`;

  // State for each layer
  const layerStates = [];

  // Create DOM structure for each layer
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const scene = sceneRegistry[layer.scene];

    // Container div (the "track")
    const container = document.createElement('div');
    container.className = 'nf-layer';
    container.dataset.layerId = layer.id;
    container.style.cssText = `position:absolute;inset:0;z-index:${i};pointer-events:none;display:none;overflow:hidden`;
    applyLayerStyle(container, layer);
    stageEl.appendChild(container);

    // Scene content container
    const sceneContainer = document.createElement('div');
    sceneContainer.style.cssText = 'position:absolute;inset:0';
    container.appendChild(sceneContainer);

    const state = {
      layer,
      scene,
      container,
      sceneContainer,
      sceneEls: null,        // returned by scene.create()
      created: false,
      wasActive: false,
      enterEffect: parseEffect(layer.enter),
      exitEffect: parseEffect(layer.exit),
    };
    layerStates.push(state);
  }

  // ─── renderFrame(t) ───
  function renderFrame(t) {
    for (const state of layerStates) {
      const { layer, scene, container, sceneContainer } = state;
      const start = layer.start || 0;
      const dur = layer.dur || duration;
      const localT = t - start;
      const active = t >= start && t < start + dur;

      if (active) {
        // Lazy create scene on first activation
        if (!state.created && scene) {
          state.sceneEls = scene.create(sceneContainer, layer.params || {});
          state.created = true;
        }

        container.style.display = 'block';

        // Update scene content
        // DOM scenes use normalized time (0~1), Canvas/SVG scenes use seconds
        if (scene && state.sceneEls != null) {
          const sceneT = scene.type === 'dom' ? (localT / dur) : localT;
          scene.update(state.sceneEls, sceneT, layer.params || {});
        }

        // Calculate effects
        const enter = calcEnterEffect(state.enterEffect, localT);
        const exit = calcExitEffect(state.exitEffect, localT, dur);
        const opacity = enter.opacity * exit.opacity * (layer.opacity != null ? layer.opacity : 1);
        const transforms = [enter.transform, exit.transform].filter(Boolean).join(' ');

        // Apply visual properties
        container.style.opacity = opacity;
        if (transforms) {
          container.style.transform = transforms;
        } else if (!layer.x && !layer.y) {
          container.style.transform = '';
        }

        // Blend mode
        if (layer.blend && layer.blend !== 'normal') {
          container.style.mixBlendMode = layer.blend;
        }

        // CSS filter
        if (layer.filter && layer.filter !== 'none') {
          container.style.filter = layer.filter;
        }

        // Rotation (if not handled by enter/exit transforms)
        if (layer.rotation) {
          container.style.transform += ` rotate(${layer.rotation}deg)`;
        }

        state.wasActive = true;
      } else {
        // Hide inactive layers
        if (state.wasActive) {
          container.style.display = 'none';
          container.style.opacity = '';
          container.style.transform = '';
          container.style.filter = '';
          state.wasActive = false;
        }
      }
    }
  }

  // ─── Destroy ───
  function destroy() {
    for (const state of layerStates) {
      if (state.created && state.scene) {
        try { state.scene.destroy(state.sceneEls); } catch (_) {}
      }
      state.container.remove();
    }
    layerStates.length = 0;
  }

  // ─── Recorder protocol ───
  window.__onFrame = function (frame) {
    renderFrame(Number(frame.time) || 0);
    return true;
  };

  return {
    renderFrame,
    destroy,
    get width() { return width; },
    get height() { return height; },
    get fps() { return fps; },
    get duration() { return duration; },
    get layerCount() { return layers.length; },
  };
}

// ─── Player Controls (browser preview) ────────────────────────
export function createPlayer(engine, stageEl) {
  const { duration, fps, width, height } = engine;
  let playing = false;
  let startWall = 0;
  let startTime = 0;
  let currentTime = 0;

  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:10px 20px;background:rgba(0,0,0,0.92);display:flex;align-items:center;gap:12px;font:13px -apple-system,sans-serif;color:#aaa;z-index:9999';

  const playBtn = document.createElement('button');
  playBtn.textContent = '\u25B6';
  playBtn.style.cssText = 'background:#222;border:1px solid #444;color:#fff;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:13px';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(duration * 1000);
  slider.value = '0';
  slider.style.cssText = 'flex:1;accent-color:#a78bfa';

  const timeLabel = document.createElement('span');
  timeLabel.style.cssText = 'min-width:90px;text-align:right;font-family:"SF Mono",monospace;font-size:12px';

  const info = document.createElement('span');
  info.style.cssText = 'font-size:11px;color:#666';
  info.textContent = `| ${duration}s @ ${fps}fps | ${width}\u00d7${height} | layers:${engine.layerCount}`;

  bar.append(playBtn, slider, timeLabel, info);
  document.body.appendChild(bar);

  function seek(t) {
    t = Math.max(0, Math.min(duration, t));
    currentTime = t;
    slider.value = String(t * 1000);
    timeLabel.textContent = t.toFixed(3) + 's';
    engine.renderFrame(t);
  }

  slider.addEventListener('input', () => {
    playing = false;
    playBtn.textContent = '\u25B6';
    seek(Number(slider.value) / 1000);
  });

  playBtn.addEventListener('click', togglePlay);

  function togglePlay() {
    if (playing) {
      playing = false;
      playBtn.textContent = '\u25B6';
      return;
    }
    playing = true;
    playBtn.textContent = '\u23F8';
    startWall = performance.now();
    startTime = currentTime >= duration ? 0 : currentTime;
    tick();
  }

  function tick() {
    if (!playing) return;
    const t = startTime + (performance.now() - startWall) / 1000;
    if (t >= duration) {
      seek(duration);
      playing = false;
      playBtn.textContent = '\u25B6';
      return;
    }
    seek(t);
    requestAnimationFrame(tick);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); seek(currentTime - 1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); seek(currentTime + 1); }
    if (e.code === 'Home') { e.preventDefault(); seek(0); }
    if (e.code === 'End') { e.preventDefault(); seek(duration); }
  });

  seek(0);

  return {
    seek,
    play: togglePlay,
    get currentTime() { return currentTime; },
    destroy() { bar.remove(); },
  };
}
