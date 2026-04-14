/**
 * NextFrame Engine v2 — public engine/player entrypoints
 */

function createEngine(stageEl, timeline, sceneRegistry) {
  const { width, height, fps, duration, background } = timelineMetrics(timeline);
  const layers = normalizeLayers(timeline);

  setupStage(stageEl, width, height, background);
  const layerStates = createLayerStates(stageEl, layers, sceneRegistry);

  let mediaStallTimer = 0;
  function resetMediaStallTimer() {
    if (window.__recordingMode) return;
    if (mediaStallTimer) clearTimeout(mediaStallTimer);
    mediaStallTimer = setTimeout(() => {
      stageEl.querySelectorAll('audio, video').forEach(m => {
        if (!m.paused) m.pause();
      });
    }, 150);
  }

  const renderFrame = createRenderFrame(layerStates, duration, resetMediaStallTimer);

  function destroy() {
    if (mediaStallTimer) clearTimeout(mediaStallTimer);
    destroyLayerStates(layerStates);
  }

  window.__onFrame = function (frame) {
    renderFrame(Number(frame.time) || 0);
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          resolve(true);
        });
      });
    });
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

function createPlayer(engine, stageEl) {
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
  const playerContainer = stageEl.parentElement || document.body;

  const bar = document.createElement('div');
  bar.id = 'nf-controls';
  bar.style.cssText = 'width:100%;max-width:900px;margin:0 auto;padding:8px 16px;background:rgba(0,0,0,0.92);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;font:13px -apple-system,sans-serif;color:#aaa;flex-shrink:0';

  const playBtn = document.createElement('button');
  playBtn.textContent = '\u25B6';
  playBtn.style.cssText = 'background:#222;border:1px solid #444;color:#fff;padding:5px 14px;border-radius:4px;cursor:pointer;font-size:13px';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(Math.round(duration * 1000));
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
    stageEl.style.width = `${width}px`;
    stageEl.style.height = `${height}px`;
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

  let resizeRaf = 0;
  const handleResizeRaf = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      handleResize();
    });
  };

  function handleFullscreenChange() {
    applyScaleMode();
    syncButtons();
  }

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
  window.addEventListener('resize', handleResizeRaf);
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
      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = 0;
      }
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResizeRaf);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      playerContainer.remove();
    },
  };
}

globalThis.createEngine = createEngine;
globalThis.createPlayer = createPlayer;
