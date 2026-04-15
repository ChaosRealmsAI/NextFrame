// Browser DOM preview engine for scene-bundle timelines inside WKWebView.
(function() {
  const state = {
    timeline: { layers: [], duration: 0, width: 1920, height: 1080, fps: 30 },
    currentTime: 0,
    isPlaying: false,
    stageEl: null,
    rafId: 0,
    lastNow: 0,
    selectedIndex: -1
  };

  function getDuration(layer) {
    const value = Number.isFinite(layer && layer.dur) ? layer.dur : layer && layer.duration;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function clampTime(t) {
    const duration = state.timeline.duration || 0;
    const safe = Number.isFinite(t) ? t : 0;
    return Math.max(0, Math.min(duration, safe));
  }

  function renderTime(t) {
    const safe = clampTime(t);
    if (safe < state.timeline.duration) return safe;
    const fps = Math.max(1, state.timeline.fps || 30);
    return Math.max(0, safe - 1 / fps / 1000);
  }

  function viewport() {
    const width = state.timeline.width || 1920;
    const height = state.timeline.height || 1080;
    return { width: width, height: height, fps: state.timeline.fps || 30, aspectRatio: width / Math.max(height, 1) };
  }

  function getState() {
    return { currentTime: state.currentTime, duration: state.timeline.duration || 0, isPlaying: state.isPlaying };
  }

  function emitState() {
    if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ type: 'nf-state' }, getState()), '*');
    if (typeof api.onStateChange === 'function') api.onStateChange(getState());
  }

  function applySelection() {
    if (!state.stageEl) return;
    state.stageEl.querySelectorAll('.nf-layer').forEach(function(el) {
      el.style.outline = Number(el.dataset.index) === state.selectedIndex ? '2px dashed #3b82f6' : '';
    });
  }

  function compose(t) {
    state.currentTime = clampTime(t);
    const active = [];
    const at = renderTime(state.currentTime);
    const layers = state.timeline.layers || [];
    const scenes = window.__scenes || {};
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i] || {};
      const start = Number.isFinite(layer.start) ? layer.start : 0;
      const dur = getDuration(layer);
      if (dur <= 0 || at < start || at >= start + dur) continue;
      const entry = scenes[layer.scene];
      const html = entry && typeof entry.render === 'function' ? entry.render(at - start, layer.params || {}, viewport()) : '';
      active.push({ scene: layer.scene, index: i, layerData: layer });
      if (state.stageEl) {
        active[active.length - 1].markup =
          '<div class="nf-layer" data-layer="' + (layer.scene || '') + '" data-index="' + i + '" style="position:absolute;inset:0;pointer-events:auto;z-index:' + i + '">' +
          (typeof html === 'string' ? html : '') +
          '</div>';
      }
    }
    if (state.stageEl) {
      var existing = state.stageEl.querySelectorAll('.nf-layer');
      var activeIndices = {};
      active.forEach(function(item) { activeIndices[item.index] = item; });
      // Remove layers no longer active (skip those with persist elements)
      existing.forEach(function(el) {
        var idx = Number(el.dataset.index);
        if (!activeIndices[idx]) el.remove();
      });
      // Update or create each active layer
      active.forEach(function(item) {
        var el = state.stageEl.querySelector('.nf-layer[data-index="' + item.index + '"]');
        if (el) {
          // Preserve video/audio elements with data-nf-persist
          var persist = el.querySelector('[data-nf-persist]');
          if (!persist) { el.innerHTML = item.markup.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, ''); }
        } else {
          var tmp = document.createElement('div');
          tmp.innerHTML = item.markup;
          if (tmp.firstChild) state.stageEl.appendChild(tmp.firstChild);
        }
      });
      applySelection();
    }
    return active.map(function(item) { return { scene: item.scene, index: item.index, layerData: item.layerData }; });
  }

  function pause() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state.lastNow = 0;
    if (state._intervalId) { clearInterval(state._intervalId); state._intervalId = 0; }
    if (!state.isPlaying) return getState();
    state.isPlaying = false;
    emitState();
    return getState();
  }

  function tick(now) {
    if (!state.isPlaying) return;
    if (!state.lastNow) state.lastNow = now;
    state.currentTime = clampTime(state.currentTime + Math.max(0, now - state.lastNow) / 1000);
    state.lastNow = now;
    compose(state.currentTime);
    emitState();
    if (state.currentTime >= state.timeline.duration) {
      pause();
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (state.isPlaying) return getState();
    if (state.currentTime >= state.timeline.duration) state.currentTime = 0;
    state.isPlaying = true;
    state.lastNow = 0;
    compose(state.currentTime);
    emitState();
    state.rafId = requestAnimationFrame(tick);
    // Fallback: setInterval in case rAF doesn't fire (WKWebView pump_run_loop)
    if (!state._intervalId) {
      state._intervalId = setInterval(function() {
        if (!state.isPlaying) { clearInterval(state._intervalId); state._intervalId = 0; return; }
        tick(performance.now());
      }, 33);
    }
    return getState();
  }

  function seek(t) {
    compose(t);
    emitState();
    return getState();
  }

  function toggle() {
    return state.isPlaying ? pause() : play();
  }

  function onStageClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const layerEl = target ? target.closest('.nf-layer') : null;
    if (!layerEl || !state.stageEl || !state.stageEl.contains(layerEl)) return;
    if (state.isPlaying) pause();
    state.selectedIndex = Number(layerEl.dataset.index);
    applySelection();
    const layerData = state.timeline.layers[state.selectedIndex];
    if (typeof api.onSelect === 'function' && layerData) {
      api.onSelect({ scene: layerData.scene, index: state.selectedIndex, layerData: layerData });
    }
  }

  function setStage(el) {
    if (state.stageEl) state.stageEl.removeEventListener('click', onStageClick);
    state.stageEl = el || null;
    if (!state.stageEl) return;
    if (window.getComputedStyle(state.stageEl).position === 'static') state.stageEl.style.position = 'relative';
    if (!state.stageEl.style.overflow) state.stageEl.style.overflow = 'hidden';
    state.stageEl.addEventListener('click', onStageClick);
    compose(state.currentTime);
  }

  function loadTimeline(json) {
    const source = typeof json === 'string' ? JSON.parse(json) : (json || {});
    const layers = Array.isArray(source.layers) ? source.layers.slice() : [];
    const duration = Number.isFinite(source.duration) ? source.duration : layers.reduce(function(maxEnd, layer) {
      const start = Number.isFinite(layer && layer.start) ? layer.start : 0;
      return Math.max(maxEnd, start + getDuration(layer));
    }, 0);
    state.timeline = {
      layers: layers,
      duration: duration,
      width: source.width || (source.project && source.project.width) || 1920,
      height: source.height || (source.project && source.project.height) || 1080,
      fps: source.fps || (source.project && source.project.fps) || 30
    };
    state.currentTime = 0;
    state.selectedIndex = -1;
    pause();
    compose(0);
    emitState();
    return { duration: duration, layerCount: layers.length, width: state.timeline.width, height: state.timeline.height };
  }

  function select(index) {
    state.selectedIndex = Number.isFinite(index) ? index : -1;
    applySelection();
  }

  const api = {
    loadTimeline: loadTimeline,
    compose: compose,
    play: play,
    pause: pause,
    seek: seek,
    toggle: toggle,
    select: select,
    getState: getState,
    setStage: setStage,
    onStateChange: null,
    onSelect: null
  };

  window.previewEngine = api;
  window.__nfPlay = play;
  window.__nfPause = pause;
  window.__nfSeek = seek;
  window.__nfToggle = toggle;
  window.__nfState = getState;
  window.addEventListener('message', function(event) {
    const data = event.data || {};
    if (data.type !== 'nf-cmd') return;
    if (data.action === 'seek') seek(data.time);
    if (data.action === 'play') play();
    if (data.action === 'pause') pause();
    if (data.action === 'toggle') toggle();
  });
})();
