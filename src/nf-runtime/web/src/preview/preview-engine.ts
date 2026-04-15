// Browser DOM preview engine for scene-bundle timelines inside WKWebView.
(function() {
  const state: {
    timeline: { layers: NfLayer[]; duration: number; width: number; height: number; fps: number };
    currentTime: number;
    isPlaying: boolean;
    stageEl: HTMLElement | null;
    rafId: number;
    lastNow: number;
    selectedIndex: number;
    _intervalId: ReturnType<typeof setInterval> | number;
  } = {
    timeline: { layers: [], duration: 0, width: 1920, height: 1080, fps: 30 },
    currentTime: 0,
    isPlaying: false,
    stageEl: null,
    rafId: 0,
    lastNow: 0,
    selectedIndex: -1,
    _intervalId: 0
  };

  function getDuration(layer: NfLayer): number {
    const value = Number.isFinite(layer && layer.dur) ? layer.dur : layer && layer.duration;
    return Number.isFinite(value) && (value as number) > 0 ? value as number : 0;
  }

  function clampTime(t: number): number {
    const duration = state.timeline.duration || 0;
    const safe = Number.isFinite(t) ? t : 0;
    return Math.max(0, Math.min(duration, safe));
  }

  function renderTime(t: number): number {
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

  function getState(): NfPreviewState {
    return { currentTime: state.currentTime, duration: state.timeline.duration || 0, isPlaying: state.isPlaying };
  }

  function emitState() {
    if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ type: 'nf-state' }, getState()), '*');
    if (typeof api.onStateChange === 'function') api.onStateChange(getState());
  }

  function applySelection() {
    if (!state.stageEl) return;
    state.stageEl.querySelectorAll<HTMLElement>('.nf-layer').forEach(function(el: HTMLElement) {
      el.style.outline = Number(el.dataset.index) === state.selectedIndex ? '2px dashed #3b82f6' : '';
    });
  }

  function compose(t: number) {
    state.currentTime = clampTime(t);
    const active: { scene: string; index: number; layerData: NfLayer; markup: string }[] = [];
    const at = renderTime(state.currentTime);
    const layers = state.timeline.layers || [];
    const scenes = window.__scenes || {};
    for (let i = 0; i < layers.length; i += 1) {
      const layer: NfLayer = layers[i] || { start: 0 };
      const start = Number.isFinite(layer.start) ? layer.start : 0;
      const dur = getDuration(layer);
      if (dur <= 0 || at < start || at >= start + dur) continue;
      const entry = scenes[layer.scene as string] as { render?: (t: number, params: Record<string, unknown>, vp: Record<string, unknown>) => string } | undefined;
      const html = entry && typeof entry.render === 'function' ? entry.render(at - start, (layer.params || {}) as Record<string, unknown>, viewport()) : '';
      active.push({ scene: layer.scene || '', index: i, layerData: layer, markup: '' });
      if (state.stageEl) {
        active[active.length - 1].markup =
          '<div class="nf-layer" data-layer="' + (layer.scene || '') + '" data-index="' + i + '" style="position:absolute;inset:0;pointer-events:auto;z-index:' + i + '">' +
          (typeof html === 'string' ? html : '') +
          '</div>';
      }
    }
    if (state.stageEl) {
      var existing = state.stageEl.querySelectorAll('.nf-layer');
      var activeIndices: Record<number, { scene: string; index: number; layerData: NfLayer; markup: string }> = {};
      active.forEach(function(item) { activeIndices[item.index] = item; });
      // Remove layers no longer active (skip those with persist elements)
      existing.forEach(function(el: Element) {
        var idx = Number((el as HTMLElement).dataset.index);
        if (!activeIndices[idx]) el.remove();
      });
      // Update or create each active layer
      active.forEach(function(item) {
        var el = state.stageEl!.querySelector('.nf-layer[data-index="' + item.index + '"]');
        if (el) {
          // Preserve video/audio elements with data-nf-persist
          var persist = el.querySelector('[data-nf-persist]');
          if (!persist) { el.innerHTML = item.markup.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, ''); }
        } else {
          var tmp = document.createElement('div');
          tmp.innerHTML = item.markup;
          if (tmp.firstChild) state.stageEl!.appendChild(tmp.firstChild);
        }
      });
      applySelection();
      syncVideos(at, state.isPlaying);
    }
    return active.map(function(item) { return { scene: item.scene, index: item.index, layerData: item.layerData }; });
  }

  function primeVideoFrame(video: HTMLVideoElement, t: number) {
    if ((video as HTMLElement).dataset.nfPrimed === '1') return;
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function() {
        setTimeout(function() {
          video.pause();
          if (Math.abs(video.currentTime - t) > 0.05) video.currentTime = t;
          (video as HTMLElement).dataset.nfPrimed = '1';
        }, 80);
      }).catch(function() {});
    }
  }

  function syncVideos(t: number, playing: boolean) {
    if (!state.stageEl) return;
    state.stageEl.querySelectorAll<HTMLVideoElement>('video[data-nf-persist]').forEach(function(v: HTMLVideoElement) {
      if (playing) {
        if (v.paused) v.play().catch(function() {});
      } else {
        primeVideoFrame(v, t);
        if (!v.paused) v.pause();
      }
      if (!playing && Math.abs(v.currentTime - t) > 0.2) v.currentTime = t;
    });
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

  function tick(now: number) {
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

  function seek(t: number) {
    compose(t);
    emitState();
    return getState();
  }

  function toggle() {
    return state.isPlaying ? pause() : play();
  }

  function onStageClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const layerEl = target ? target.closest('.nf-layer') as HTMLElement | null : null;
    if (!layerEl || !state.stageEl || !state.stageEl.contains(layerEl)) return;
    if (state.isPlaying) pause();
    state.selectedIndex = Number(layerEl.dataset.index);
    applySelection();
    const layerData = state.timeline.layers[state.selectedIndex];
    if (typeof api.onSelect === 'function' && layerData) {
      api.onSelect({ scene: layerData.scene, index: state.selectedIndex, layerData: layerData } as unknown as { index: number });
    }
  }

  function setStage(el: HTMLElement | null) {
    if (state.stageEl) state.stageEl.removeEventListener('click', onStageClick as EventListener);
    state.stageEl = el || null;
    if (!state.stageEl) return;
    if (window.getComputedStyle(state.stageEl).position === 'static') state.stageEl.style.position = 'relative';
    if (!state.stageEl.style.overflow) state.stageEl.style.overflow = 'hidden';
    state.stageEl.addEventListener('click', onStageClick as EventListener);
    compose(state.currentTime);
  }

  function loadTimeline(json: NfTimeline | string) {
    const source = typeof json === 'string' ? JSON.parse(json) as NfTimeline : (json || {} as NfTimeline);
    const layers = Array.isArray(source.layers) ? source.layers.slice() : [];
    const duration = Number.isFinite(source.duration) ? source.duration as number : layers.reduce(function(maxEnd: number, layer: NfLayer) {
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

  function select(index: number) {
    state.selectedIndex = Number.isFinite(index) ? index : -1;
    applySelection();
  }

  const api: NfPreviewEngine = {
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
    const data = (event as MessageEvent).data as Record<string, unknown> || {};
    if (data.type !== 'nf-cmd') return;
    if (data.action === 'seek') seek(data.time as number);
    if (data.action === 'play') play();
    if (data.action === 'pause') pause();
    if (data.action === 'toggle') toggle();
  });
})();
