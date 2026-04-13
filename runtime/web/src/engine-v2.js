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

// ─── Transition Calculator ─────────────────────────────────────
// Format: "dissolve 0.5s" or "wipeLeft 0.8s" or "wipeUp 0.6s" or "none"
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

// ─── Keyframe Interpolation ────────────────────────────────────
// Format: { "keys": [[0, 0], [2, 100], [5, 50]], "ease": "linear" }
// keys = [[time, value], ...] sorted by time. value can be number or string.
function isKeyframed(v) {
  return v && typeof v === 'object' && Array.isArray(v.keys) && v.keys.length > 0;
}

function evalKeyframe(kf, t) {
  const keys = kf.keys;
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  // Find segment
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const eased = kf.ease === 'linear' ? p
        : kf.ease === 'easeIn' ? easeInCubic(p)
        : easeOutCubic(p); // default easeOut
      // Interpolate numbers, return string endpoints as-is at threshold
      if (typeof v0 === 'number' && typeof v1 === 'number') {
        return v0 + (v1 - v0) * eased;
      }
      // String values (e.g. "10%" → "50%"): parse number prefix
      const n0 = parseFloat(v0), n1 = parseFloat(v1);
      if (Number.isFinite(n0) && Number.isFinite(n1)) {
        const suffix = String(v0).replace(/^[-\d.]+/, '');
        return (n0 + (n1 - n0) * eased).toFixed(2) + suffix;
      }
      return p < 0.5 ? v0 : v1; // snap for non-interpolable
    }
  }
  return keys[keys.length - 1][1];
}

// Resolve a layer property: if keyframed return interpolated value, else return static value
function resolveLayerProp(layer, prop, localT, fallback) {
  const v = layer[prop];
  if (v == null) return fallback;
  if (isKeyframed(v)) return evalKeyframe(v, localT);
  return v;
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
  if (layer.scale) s.transform = (s.transform || '') + ` scale(${layer.scale})`;
  if (layer.skew) s.transform = (s.transform || '') + ` skew(${layer.skew})`;
  if (layer.transformOrigin) s.transformOrigin = layer.transformOrigin;
  if (layer.backdropFilter) s.backdropFilter = layer.backdropFilter;
  if (layer.border) s.border = layer.border;
  if (layer.padding) s.padding = layer.padding;
  if (layer.zIndex != null) s.zIndex = layer.zIndex;
  if (layer.overflow) s.overflow = layer.overflow;
  if (layer.perspective) s.perspective = layer.perspective;
}

function timelineMetrics(timeline) {
  const project = timeline && typeof timeline.project === 'object' ? timeline.project : {};
  return {
    width: project.width || timeline.width || 1920,
    height: project.height || timeline.height || 1080,
    fps: project.fps || timeline.fps || 30,
    duration: timeline.duration || 10,
    background: timeline.background || '#05050c',
  };
}

function normalizeLayers(timeline) {
  if (Array.isArray(timeline.layers)) {
    return timeline.layers;
  }
  const tracks = Array.isArray(timeline && timeline.tracks) ? timeline.tracks : [];
  const layers = [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    const clips = Array.isArray(track && track.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex];
      layers.push({
        ...clip,
        id: clip && clip.id ? clip.id : `track-${trackIndex + 1}-clip-${clipIndex + 1}`,
        kind: clip && clip.kind ? clip.kind : (track && track.kind ? track.kind : 'video'),
        trackId: track && track.id ? track.id : `track-${trackIndex + 1}`,
      });
    }
  }
  return layers;
}

// ─── Engine ────────────────────────────────────────────────────
export function createEngine(stageEl, timeline, sceneRegistry) {
  const { width, height, fps, duration, background } = timelineMetrics(timeline);
  const layers = normalizeLayers(timeline);

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
      transition: parseTransition(layer.transition),
    };
    layerStates.push(state);
  }

  // ─── renderFrame(t) ───
  function renderFrame(t) {
    resetMediaStallTimer();
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
          const sceneT = scene.type === 'dom' ? (dur > 0 ? (localT / dur) : 0) : localT;
          scene.update(state.sceneEls, sceneT, layer.params || {});
        }

        // Calculate effects
        const enter = calcEnterEffect(state.enterEffect, localT);
        const exit = calcExitEffect(state.exitEffect, localT, dur);

        // Calculate transition (applied at layer start)
        let transOpacity = 1;
        let transTransform = '';
        let transClipPath = '';
        if (state.transition && localT < state.transition.dur) {
          const tp = clamp01(localT / state.transition.dur);
          const ts = calcTransitionStyle(state.transition, tp);
          if (ts.opacity != null) transOpacity = ts.opacity;
          if (ts.transform) transTransform = ts.transform;
          if (ts.clipPath) transClipPath = ts.clipPath;
        }

        // Resolve keyframe-animated properties
        const kOpacity = resolveLayerProp(layer, 'opacity', localT, 1);
        const kRotation = resolveLayerProp(layer, 'rotation', localT, 0);
        const kScale = resolveLayerProp(layer, 'scale', localT, null);
        const kX = resolveLayerProp(layer, 'x', localT, null);
        const kY = resolveLayerProp(layer, 'y', localT, null);
        const kW = resolveLayerProp(layer, 'w', localT, null);
        const kH = resolveLayerProp(layer, 'h', localT, null);
        const kFilter = resolveLayerProp(layer, 'filter', localT, null);
        const kClipPath = resolveLayerProp(layer, 'clipPath', localT, null);

        const opacity = enter.opacity * exit.opacity * transOpacity * kOpacity;
        const userTransforms = [];
        if (kRotation) userTransforms.push(`rotate(${kRotation}deg)`);
        if (kScale) userTransforms.push(`scale(${kScale})`);
        const allTransforms = [enter.transform, exit.transform, transTransform, ...userTransforms].filter(Boolean).join(' ');

        // Apply visual properties
        container.style.opacity = opacity;

        // Position (keyframe-animated)
        if (kX != null) container.style.left = typeof kX === 'number' ? kX + 'px' : kX;
        if (kY != null) container.style.top = typeof kY === 'number' ? kY + 'px' : kY;
        if (kW != null) container.style.width = typeof kW === 'number' ? kW + 'px' : kW;
        if (kH != null) container.style.height = typeof kH === 'number' ? kH + 'px' : kH;

        // ClipPath
        if (transClipPath) {
          container.style.clipPath = transClipPath;
        } else if (kClipPath && kClipPath !== 'none') {
          container.style.clipPath = kClipPath;
        } else {
          container.style.clipPath = '';
        }

        // Transform
        if (allTransforms) {
          container.style.transform = allTransforms;
        } else if (!layer.x && !layer.y) {
          container.style.transform = '';
        }

        // Blend mode
        if (layer.blend && layer.blend !== 'normal') {
          container.style.mixBlendMode = layer.blend;
        }

        // CSS filter (keyframe-animated)
        if (kFilter && kFilter !== 'none') {
          container.style.filter = kFilter;
        } else {
          container.style.filter = '';
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

  // ─── Media stall detector ───
  // If renderFrame stops being called for >150ms, pause all media elements.
  // This catches the case where the caller (recorder, external driver) simply
  // stops calling __onFrame — without this, <audio> keeps playing forever.
  let mediaStallTimer = 0;
  function resetMediaStallTimer() {
    if (mediaStallTimer) clearTimeout(mediaStallTimer);
    mediaStallTimer = setTimeout(() => {
      stageEl.querySelectorAll('audio, video').forEach(m => {
        if (!m.paused) m.pause();
      });
    }, 150);
  }

  // ─── Destroy ───
  function destroy() {
    if (mediaStallTimer) clearTimeout(mediaStallTimer);
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
  let currentTime = 0;
  let playbackRate = 1;
  let tickRaf = 0;
  let lastTickWall = 0;
  let scaleMode = 'fit';

  document.documentElement.style.background = '#111';
  document.body.style.margin = '0';
  document.body.style.minHeight = '100vh';
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#111';

  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:fixed;inset:0 0 64px 0;padding:24px;overflow:hidden;background:#111;display:flex;align-items:center;justify-content:center';

  const stageShell = document.createElement('div');
  stageShell.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;min-width:100%;min-height:100%;box-sizing:border-box';

  const originalParent = stageEl.parentNode;
  if (originalParent) {
    originalParent.insertBefore(viewport, stageEl);
  } else {
    document.body.appendChild(viewport);
  }
  viewport.appendChild(stageShell);
  stageShell.appendChild(stageEl);
  stageEl.style.boxShadow = '0 0 80px rgba(100,80,200,0.15)';

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
  timeLabel.style.cssText = 'min-width:120px;text-align:right;font-family:"SF Mono",monospace;font-size:12px;color:#ddd';

  const info = document.createElement('span');
  info.style.cssText = 'font-size:11px;color:#666';
  info.textContent = `| ${duration}s @ ${fps}fps | ${width}\u00d7${height} | layers:${engine.layerCount}`;

  const speedWrap = document.createElement('div');
  speedWrap.style.cssText = 'display:flex;align-items:center;gap:6px';
  const speedButtons = [0.5, 1, 2].map((rate) => {
    const button = document.createElement('button');
    button.textContent = `${rate}x`;
    button.style.cssText = 'background:#141414;border:1px solid #333;color:#bbb;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px';
    button.addEventListener('click', () => {
      playbackRate = rate;
      if (playing) {
        lastTickWall = performance.now();
      }
      syncButtons();
    });
    speedWrap.appendChild(button);
    return button;
  });

  const scaleBtn = document.createElement('button');
  scaleBtn.style.cssText = 'background:#141414;border:1px solid #333;color:#fff;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px';
  scaleBtn.addEventListener('click', () => {
    scaleMode = scaleMode === 'fit' ? 'native' : 'fit';
    applyScaleMode();
    syncButtons();
  });

  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.style.cssText = 'background:#141414;border:1px solid #333;color:#fff;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px';
  fullscreenBtn.addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  });

  bar.append(playBtn, slider, timeLabel, speedWrap, scaleBtn, fullscreenBtn, info);
  document.body.appendChild(bar);

  function formatTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remainder = safe - minutes * 60;
    return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
  }

  function pauseAllMedia() {
    const stage = stageEl;
    stage.querySelectorAll('audio, video').forEach(m => {
      if (!m.paused) m.pause();
    });
  }

  function stopPlayback() {
    playing = false;
    lastTickWall = 0;
    if (tickRaf) {
      cancelAnimationFrame(tickRaf);
      tickRaf = 0;
    }
    pauseAllMedia();
    syncButtons();
  }

  function syncButtons() {
    playBtn.textContent = playing ? '\u23F8' : '\u25B6';
    scaleBtn.textContent = scaleMode === 'fit' ? 'Fit' : '1:1';
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    for (const button of speedButtons) {
      const active = button.textContent === `${playbackRate}x`;
      button.style.borderColor = active ? '#7c5cff' : '#333';
      button.style.color = active ? '#fff' : '#bbb';
      button.style.background = active ? '#2b1f5f' : '#141414';
    }
  }

  function applyScaleMode() {
    if (scaleMode === 'fit') {
      const availableWidth = Math.max(1, viewport.clientWidth - 48);
      const availableHeight = Math.max(1, viewport.clientHeight - 48);
      const scale = Math.min(availableWidth / width, availableHeight / height);
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      stageEl.style.width = `${Math.round(width * safeScale)}px`;
      stageEl.style.height = `${Math.round(height * safeScale)}px`;
      viewport.style.overflow = 'hidden';
      stageShell.style.padding = '0';
      stageShell.style.minWidth = '100%';
      stageShell.style.minHeight = '100%';
    } else {
      stageEl.style.width = `${width}px`;
      stageEl.style.height = `${height}px`;
      viewport.style.overflow = 'auto';
      stageShell.style.padding = '24px';
      stageShell.style.minWidth = 'max-content';
      stageShell.style.minHeight = 'max-content';
    }
  }

  function seek(t) {
    t = Math.max(0, Math.min(duration, t));
    currentTime = t;
    slider.value = String(t * 1000);
    timeLabel.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
    engine.renderFrame(t);
  }

  slider.addEventListener('input', () => {
    stopPlayback();
    seek(Number(slider.value) / 1000);
  });

  playBtn.addEventListener('click', togglePlay);

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    if (currentTime >= duration) {
      currentTime = 0;
    }
    playing = true;
    lastTickWall = 0;
    syncButtons();
    tickRaf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!playing) return;
    if (!lastTickWall) {
      lastTickWall = now;
    }
    const delta = (now - lastTickWall) / 1000;
    lastTickWall = now;
    const nextTime = currentTime + delta * playbackRate;
    if (nextTime >= duration) {
      seek(duration);
      stopPlayback();
      return;
    }
    seek(nextTime);
    tickRaf = requestAnimationFrame(tick);
  }

  function handleResize() {
    applyScaleMode();
  }

  function handleFullscreenChange() {
    applyScaleMode();
    syncButtons();
  }

  // Keyboard shortcuts
  const handleKeydown = (e) => {
    const tagName = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea' || (e.target && e.target.isContentEditable)) {
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); seek(currentTime - 1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); seek(currentTime + 1); }
    if (e.code === 'Home') { e.preventDefault(); seek(0); }
    if (e.code === 'End') { e.preventDefault(); seek(duration); }
  };
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleResize);
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  applyScaleMode();
  syncButtons();
  seek(0);

  return {
    seek,
    play: togglePlay,
    get currentTime() { return currentTime; },
    destroy() {
      stopPlayback();
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      bar.remove();
      viewport.remove();
    },
  };
}
