// Browser runtime code generator for NextFrame HTML builds.
// Returns a string of JS that runs in the browser to drive playback.

const SCRUBBER_MAX = 10000;

/**
 * Build the inline runtime script that powers playback, scrubbing,
 * recorder mode, iframe embedding, and persistent video sync.
 */
export function buildRuntime() {
  return `(() => {
  const stageShell = document.getElementById("stage-shell");
  const stage = document.getElementById("stage");
  const controls = document.getElementById("controls");
  const playBtn = document.getElementById("playBtn");
  const scrubber = document.getElementById("scrubber");
  const timeInfo = document.getElementById("timeInfo");
  const phaseInfo = document.getElementById("phaseInfo");
  const audioEl = document.getElementById("timeline-audio");
  const timeline = TIMELINE || {};
  const fps = Number(timeline.fps || 30);
  const duration = Math.max(0, Number(timeline.duration || 0));
  const viewport = {
    width: Number(timeline.width || 1920),
    height: Number(timeline.height || 1080),
  };
  const layers = Array.isArray(timeline.layers) ? timeline.layers : [];
  if (audioEl && timeline.audio) {
    var _audioSrc = typeof timeline.audio === "object" ? (timeline.audio.src || "") : String(timeline.audio);
    if (_audioSrc) { audioEl.src = _audioSrc; window.__audioSrc = _audioSrc; }
  }
  let currentTime = 0;
  let rafId = 0;
  let isPlaying = false;
  let recorderMode = false;
  let dragActive = false;
  let clockBaseTime = 0;
  let clockBaseNow = 0;
  let lastVisible = [];

  function clampTime(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > duration) return duration;
    return value;
  }

  function formatTime(value) {
    return clampTime(value).toFixed(2) + "s";
  }

  function applyScale() {
    const controlsH = 56;
    const availW = window.innerWidth;
    const availH = window.innerHeight - controlsH;
    const scale = Math.min(availW / viewport.width, availH / viewport.height);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const scaledW = viewport.width * safeScale;
    const scaledH = viewport.height * safeScale;
    stageShell.style.transform = "scale(" + safeScale + ")";
    stageShell.style.left = Math.round((availW - scaledW) / 2) + "px";
    stageShell.style.top = Math.round((availH - scaledH) / 2) + "px";
  }

  function replayInlineScripts(root) {
    const scripts = root.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  function renderSceneError(layer, message) {
    return '<div style="position:absolute;inset:24px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,120,120,.35);background:rgba(20,0,0,.4);color:#ffb4b4;font:600 18px monospace">' +
      message + " (" + String(layer.scene || "unknown") + ")</div>";
  }

  // Auto-generate SRT from timeline.audio.sentences (if audio-synth was used)
  const _autoSrt = (function() {
    const audio = timeline.audio;
    if (!audio || typeof audio === "string") return null;
    // audio can be {src:"path", sentences:[{text,start,end,words}]} from pipeline
    const sentences = audio.sentences || (audio.segments && audio.segments.flatMap(function(seg) { return seg.sentences || []; }));
    if (!Array.isArray(sentences) || sentences.length === 0) return null;
    return sentences.map(function(s) { return { s: Number(s.start || 0), e: Number(s.end || 0), t: String(s.text || "") }; }).filter(function(e) { return e.t; });
  })();

  function resolveSceneParams(scene, rawParams, layerDataSource) {
    const input = rawParams && typeof rawParams === "object" ? rawParams : {};
    const meta = scene && scene.meta && typeof scene.meta === "object" ? scene.meta : {};
    const paramsMeta = meta.params && typeof meta.params === "object" ? meta.params : {};
    const defaults = {};
    for (const [key, spec] of Object.entries(paramsMeta)) {
      if (spec && Object.prototype.hasOwnProperty.call(spec, "default")) {
        defaults[key] = spec.default;
      }
    }
    const themes = meta.themes && typeof meta.themes === "object" ? meta.themes : {};
    const themeKey = input.theme || meta.default_theme;
    const themeValues = themeKey && themes[themeKey] && typeof themes[themeKey] === "object"
      ? themes[themeKey]
      : {};
    const merged = { ...defaults, ...themeValues, ...input };
    // Auto-inject SRT if layer has dataSource:"audio" and scene has srt param
    if (layerDataSource === "audio" && _autoSrt && !merged.srt) {
      merged.srt = _autoSrt;
    }
    // Auto-inject progress for progressBar scenes
    if (layerDataSource === "progress" || (meta.id && meta.id.toLowerCase().indexOf("progress") >= 0)) {
      // progress is handled per-frame in compose, not here
    }
    return merged;
  }

  function getPhaseLabel(visible) {
    const active = visible[visible.length - 1];
    if (!active) return "idle";
    const meta = active.scene && active.scene.meta ? active.scene.meta : {};
    const label = meta.label || active.layer.scene || "scene";
    const layerId = active.layer.id || active.layer.scene || "layer";
    return layerId + " · " + label;
  }

  function updateControls(time, visible) {
    const activeVisible = visible && visible.length ? visible : lastVisible;
    if (!dragActive) {
      scrubber.value = duration > 0
        ? String(Math.round((clampTime(time) / duration) * ${SCRUBBER_MAX}))
        : "0";
    }
    timeInfo.textContent = formatTime(time) + " / " + formatTime(duration);
    phaseInfo.textContent = "Phase: " + getPhaseLabel(activeVisible);
    playBtn.textContent = isPlaying ? "Pause" : "Play";
    if (window.parent !== window) {
      window.parent.postMessage({type:"nf-state", currentTime: clampTime(time), duration: duration, isPlaying: isPlaying}, "*");
    }
  }

  function compose(time) {
    const t = clampTime(time);
    currentTime = t;
    const visible = [];
    const html = [];
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      const start = Number(layer.start || 0);
      const dur = Number(layer.dur || 0);
      if (t < start || t >= start + dur) continue;
      const scene = SCENES[layer.scene];
      let inner = "";
      if (!scene || typeof scene.render !== "function") {
        inner = renderSceneError(layer, "Missing scene renderer");
      } else {
        try {
          inner = scene.render(t - start, resolveSceneParams(scene, layer.params, layer.dataSource), viewport);
        } catch (err) {
          inner = renderSceneError(layer, String(err && err.message ? err.message : err));
        }
      }
      visible.push({ layer, scene });
      html.push(
        '<div class="nf-layer" data-layer-id="' + String(layer.id || layer.scene || index) + '"' +
        ' style="position:absolute;inset:0;pointer-events:none;z-index:' + index + ';">' +
        inner +
        "</div>"
      );
    }
    // Persistent video elements: don't destroy & recreate, just update currentTime
    const existingVideos = {};
    stage.querySelectorAll("video[data-nf-persist]").forEach(function(v) {
      existingVideos[v.getAttribute("data-nf-persist")] = v.parentElement.parentElement;
    });

    // Build new DOM, but reuse persistent video layers
    const frag = document.createElement("div");
    frag.innerHTML = html.join("");
    const newChildren = Array.from(frag.children);

    // Check which layers have persistent video
    const usedPersist = new Set();
    for (const child of newChildren) {
      const vid = child.querySelector("video[data-nf-persist]");
      if (vid) {
        const key = vid.getAttribute("data-nf-persist");
        if (existingVideos[key]) {
          // Reuse existing layer — just update currentTime
          const existingLayer = existingVideos[key];
          const existingVid = existingLayer.querySelector("video[data-nf-persist]");
          const newTime = parseFloat(vid.getAttribute("data-nf-time") || "0");
          if (existingVid && Math.abs(existingVid.currentTime - newTime) > 0.1) {
            existingVid.currentTime = newTime;
          }
          existingLayer.style.zIndex = child.style.zIndex;
          usedPersist.add(key);
        }
      }
    }

    // Remove layers that are no longer visible (but keep persistent ones that are still active)
    Array.from(stage.children).forEach(function(child) {
      const vid = child.querySelector("video[data-nf-persist]");
      if (vid && usedPersist.has(vid.getAttribute("data-nf-persist"))) return; // keep
      child.remove();
    });

    // Add new layers (skip ones already persisted)
    for (const child of newChildren) {
      const vid = child.querySelector("video[data-nf-persist]");
      if (vid && existingVideos[vid.getAttribute("data-nf-persist")]) continue; // already in DOM
      stage.appendChild(child);
    }

    replayInlineScripts(stage);
    lastVisible = visible;
    updateControls(t, visible);
    return { time: t, visible };
  }

  function syncClock(time) {
    clockBaseTime = clampTime(time);
    clockBaseNow = performance.now();
  }

  function stopPlayback() {
    isPlaying = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (audioEl) audioEl.pause();
    updateControls(currentTime, []);
  }

  function tick() {
    if (!isPlaying) return;
    const nextTime = audioEl
      ? clampTime(audioEl.currentTime)
      : clampTime(clockBaseTime + (performance.now() - clockBaseNow) / 1000);
    compose(nextTime);
    if (nextTime >= duration) {
      stopPlayback();
      compose(duration);
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  // Sync all persistent video elements
  function syncVideos(t, playing) {
    stage.querySelectorAll("video[data-nf-persist]").forEach(function(v) {
      if (playing && v.paused) v.play().catch(function(){});
      if (!playing && !v.paused) v.pause();
      // Only seek if drift > 0.3s
      if (Math.abs(v.currentTime - t) > 0.3) v.currentTime = t;
    });
  }

  function play() {
    if (isPlaying || duration <= 0 || recorderMode) return;
    if (currentTime >= duration) {
      currentTime = 0;
      if (audioEl) audioEl.currentTime = 0;
    }
    isPlaying = true;
    syncClock(currentTime);
    if (audioEl) {
      audioEl.currentTime = currentTime;
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          stopPlayback();
          compose(currentTime);
        });
      }
    }
    syncVideos(currentTime, true);
    updateControls(currentTime, []);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!isPlaying) return;
    if (audioEl) currentTime = clampTime(audioEl.currentTime);
    else currentTime = clampTime(clockBaseTime + (performance.now() - clockBaseNow) / 1000);
    stopPlayback();
    syncVideos(currentTime, false);
    compose(currentTime);
  }

  function togglePlayback() {
    if (isPlaying) pause();
    else play();
  }

  function seek(time) {
    const nextTime = clampTime(time);
    currentTime = nextTime;
    syncClock(nextTime);
    if (audioEl) audioEl.currentTime = nextTime;
    return compose(nextTime);
  }

  function scrubberTime() {
    return duration <= 0
      ? 0
      : (Number(scrubber.value || 0) / ${SCRUBBER_MAX}) * duration;
  }

  function extractTime(data) {
    if (typeof data === "number") return clampTime(data);
    if (data && Number.isFinite(data.time)) return clampTime(Number(data.time));
    if (data && Number.isFinite(data.t)) return clampTime(Number(data.t));
    if (data && Number.isFinite(data.currentTime)) return clampTime(Number(data.currentTime));
    return currentTime;
  }

  function enableRecorderMode() {
    if (recorderMode) return;
    recorderMode = true;
    stopPlayback();
    controls.style.display = "none";
  }

  window.__onFrame = function(data) {
    enableRecorderMode();
    var result = seek(extractTime(data));
    // Force layout flush + paint for WKWebView recorder
    void stage.offsetHeight;
    void stage.getBoundingClientRect();
    return result;
  };

  playBtn.addEventListener("click", () => togglePlayback());
  scrubber.addEventListener("pointerdown", () => { dragActive = true; });
  scrubber.addEventListener("pointerup", () => { dragActive = false; });
  scrubber.addEventListener("input", () => {
    if (isPlaying) pause();
    seek(scrubberTime());
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    const tag = event.target && event.target.tagName ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    togglePlayback();
  });
  window.addEventListener("resize", applyScale);

  if (audioEl) {
    audioEl.addEventListener("ended", () => {
      currentTime = duration;
      stopPlayback();
      compose(duration);
    });
  }

  // Iframe embedding mode — use setInterval instead of rAF (rAF may not fire in WKWebView iframes)
  var _iframeMode = (window.parent !== window);
  var _intervalId = 0;
  if (_iframeMode) {
    controls.style.display = "none";
    // Override play to use setInterval instead of rAF
    var _origPlay = play;
    play = function() {
      _origPlay();
      if (isPlaying && !_intervalId) {
        _intervalId = setInterval(function() {
          if (!isPlaying) { clearInterval(_intervalId); _intervalId = 0; return; }
          tick(performance.now());
        }, 33); // ~30fps
      }
    };
    var _origPause = pause;
    pause = function() {
      _origPause();
      if (_intervalId) { clearInterval(_intervalId); _intervalId = 0; }
    };
    window.addEventListener("message", function(event) {
      var d = event.data;
      if (!d || d.type !== "nf-cmd") return;
      if (d.action === "play") play();
      else if (d.action === "pause") pause();
      else if (d.action === "toggle") togglePlayback();
      else if (d.action === "seek" && typeof d.time === "number") seek(d.time);
    });
  }

  applyScale();
  // Support #t=N in URL to start at a specific time
  var hashTime = parseFloat((location.hash.match(/t=([\\d.]+)/) || [])[1]);
  var initTime = isFinite(hashTime) ? hashTime : 0;
  compose(initTime);
  // Expose controls for external access (iframe parent, console, AppleScript)
  window.__nfSeek = seek;
  window.__nfPlay = play;
  window.__nfPause = stopPlayback;
  window.__nfToggle = togglePlayback;
  window.__nfState = function() { return { currentTime: currentTime, duration: duration, isPlaying: isPlaying }; };
  window.__nfPlay = play;
  window.__nfPause = pause;
})();`;
}

/** The scrubber range max constant, needed by the document template. */
export const SCRUBBER_MAX_VALUE = SCRUBBER_MAX;
