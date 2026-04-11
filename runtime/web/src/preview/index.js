import { getAudioContext } from "../audio/context.js";
import { createMixer } from "../audio/mixer.js";
import { renderAt as defaultRenderAt, setupDPR as defaultSetupDPR } from "../engine/index.js";
import { computeLetterboxRect } from "./letterbox.js";
import { createLoop } from "./loop.js";
import { createPerfMonitor } from "./perf.js";
import { drawSafeArea } from "./safeArea.js";

const DEFAULT_TIMELINE = {
  version: "1",
  duration: 30,
  background: "#0b0b14",
  tracks: [],
};

const MOUNT_STATE = Symbol("nextframe.preview.mountState");
const PERF_STYLE_ID = "nextframe-preview-perf-styles";
const PERF_HUD_UPDATE_INTERVAL_MS = 200;
const PERF_HUD_INSET_PX = 12;
const NORMALIZED_TIMELINE_CACHE = new WeakMap();

export function mountPreview(container, { engine, store, audioMixer: providedAudioMixer } = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("mountPreview(container, options) requires a container element");
  }

  if (container[MOUNT_STATE]) {
    return container[MOUNT_STATE];
  }

  ensurePerfHudStyles();

  const mountHost = container.querySelector("#preview-stage-slot") ?? container;
  const frame = document.createElement("div");
  const canvas = document.createElement("canvas");
  const perfHud = document.createElement("div");

  frame.className = "preview-canvas-frame";
  canvas.className = "preview-canvas";
  perfHud.className = "preview-perf-hud";
  perfHud.hidden = true;
  perfHud.setAttribute("aria-hidden", "true");
  frame.append(canvas, perfHud);
  mountHost.replaceChildren(frame);

  const engineApi = {
    renderAt: typeof engine?.renderAt === "function" ? engine.renderAt : defaultRenderAt,
    setupDPR: typeof engine?.setupDPR === "function" ? engine.setupDPR : defaultSetupDPR,
  };
  const audioMixer = providedAudioMixer ?? createMixer({
    getAudioContext,
    getState: () => store?.state ?? null,
  });

  let ctx = null;
  let lastRect = { x: 0, y: 0, width: 0, height: 0 };
  let lastSnapshot = createSnapshot(store?.state);
  let recordingMode = false;
  let nextPerfHudUpdateAt = 0;

  const perf = createPerfMonitor();
  const perfHook = () => perf.getStats();
  const disposePerfHook = installPerfHook(perfHook);

  const readTime = () => {
    const value = Number(store?.state?.playhead);
    return Number.isFinite(value) ? value : 0;
  };

  const syncPerfHud = (stats = null) => {
    const visible = Boolean(store?.state?.showPerf) && lastRect.width > 0 && lastRect.height > 0;
    perfHud.hidden = !visible;

    if (!visible) {
      return;
    }

    const frameWidth = frame.clientWidth || mountHost.clientWidth || 0;
    const rightInset = Math.max(
      PERF_HUD_INSET_PX,
      frameWidth - (lastRect.x + lastRect.width) + PERF_HUD_INSET_PX,
    );

    perfHud.style.top = `${lastRect.y + PERF_HUD_INSET_PX}px`;
    perfHud.style.right = `${rightInset}px`;

    const nextStats = stats ?? perf.getStats();
    const fps = Math.max(0, Math.round(nextStats.fps));
    const tone = fps >= 55 ? "good" : fps >= 40 ? "warn" : "bad";
    const label = `FPS ${fps}`;

    if (perfHud.dataset.tone !== tone) {
      perfHud.dataset.tone = tone;
    }

    if (perfHud.textContent !== label) {
      perfHud.textContent = label;
    }
  };

  const layoutCanvas = () => {
    const aspectRatio = getAspectRatio(store?.state?.project);
    const nextRect = computeLetterboxRect(
      mountHost.clientWidth,
      mountHost.clientHeight,
      aspectRatio,
    );

    lastRect = nextRect;
    canvas.style.left = `${nextRect.x}px`;
    canvas.style.top = `${nextRect.y}px`;
    canvas.style.width = `${nextRect.width}px`;
    canvas.style.height = `${nextRect.height}px`;
    syncPerfHud();

    if (nextRect.width === 0 || nextRect.height === 0) {
      canvas.width = 1;
      canvas.height = 1;
      ctx = null;
      return nextRect;
    }

    ctx = engineApi.setupDPR(canvas);
    return nextRect;
  };

  const renderFrame = (time, timeline = getTimeline(store?.state)) => {
    if (!ctx) {
      return;
    }

    engineApi.renderAt(ctx, timeline, time);

    if (store?.state?.showSafeArea) {
      drawSafeArea(ctx, lastRect.width, lastRect.height);
    }
  };

  const syncLoopState = (playing = Boolean(store?.state?.playing)) => {
    if (recordingMode || store?.state?.scrubbing || !playing) {
      loop.pause();
      return;
    }

    loop.play();
  };

  const loop = createLoop({
    tick(time, dt, now) {
      perf.tick(dt * 1000);
      const timeline = getTimeline(store?.state);
      const nextTime = store?.state?.playing
        ? advancePlayhead(store, time, dt, timeline)
        : time;

      audioMixer.syncToPlayhead(nextTime, Boolean(store?.state?.playing));
      renderFrame(nextTime, timeline);

      if (store?.state?.showPerf && now >= nextPerfHudUpdateAt) {
        syncPerfHud();
        nextPerfHudUpdateAt = now + PERF_HUD_UPDATE_INTERVAL_MS;
      }
    },
    getTime: readTime,
  });

  const resizeObserver = new ResizeObserver(() => {
    layoutCanvas();
    renderFrame(readTime());
  });

  resizeObserver.observe(container);

  const unsubscribe = typeof store?.subscribe === "function"
    ? store.subscribe((state) => {
      const nextSnapshot = createSnapshot(state);

      if (
        nextSnapshot.playing !== lastSnapshot.playing
        || nextSnapshot.scrubbing !== lastSnapshot.scrubbing
      ) {
        if (nextSnapshot.playing && !nextSnapshot.scrubbing) {
          audioMixer.syncToPlayhead(readTime(), true);
        } else {
          audioMixer.stop();
        }

        syncLoopState(nextSnapshot.playing);
      }

      if (didLayoutChange(lastSnapshot, nextSnapshot)) {
        layoutCanvas();
      }

      if (nextSnapshot.showPerf !== lastSnapshot.showPerf) {
        nextPerfHudUpdateAt = 0;
        syncPerfHud();
      }

      if (didVisualChange(lastSnapshot, nextSnapshot)) {
        renderFrame(readTime());
      }

      if (nextSnapshot.timeline !== lastSnapshot.timeline
        || nextSnapshot.assets !== lastSnapshot.assets
        || nextSnapshot.assetBuffers !== lastSnapshot.assetBuffers) {
        audioMixer.syncToPlayhead(readTime(), Boolean(state?.playing) && !Boolean(state?.scrubbing));
      }

      lastSnapshot = nextSnapshot;
    })
    : () => {};

  layoutCanvas();
  renderFrame(readTime());
  syncPerfHud();
  if (lastSnapshot.playing && !lastSnapshot.scrubbing) {
    audioMixer.syncToPlayhead(readTime(), true);
  }
  syncLoopState(lastSnapshot.playing);

  const onKeyDown = (event) => {
    if (
      event.defaultPrevented
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || event.key.toLowerCase() !== "p"
      || isEditableTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    togglePerfHud(store);
  };

  window.addEventListener("keydown", onKeyDown);

  const api = {
    audioMixer,
    canvas,
    get ctx() {
      return ctx;
    },
    play: () => {
      if (!store?.state?.scrubbing) {
        audioMixer.syncToPlayhead(readTime(), true);
      }
      syncLoopState(true);
    },
    pause: () => {
      audioMixer.stop();
      syncLoopState(false);
    },
    setRecordingMode(active) {
      recordingMode = Boolean(active);
      syncLoopState();
    },
    stop: () => {
      audioMixer.stop();
      loop.stop();
    },
    destroy() {
      unsubscribe();
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      disposePerfHook();
      audioMixer.stop();
      loop.stop();
      delete container[MOUNT_STATE];
    },
  };

  container[MOUNT_STATE] = api;
  return api;
}

function createSnapshot(state) {
  return {
    playhead: readFiniteNumber(state?.playhead),
    playing: Boolean(state?.playing),
    scrubbing: Boolean(state?.scrubbing),
    showSafeArea: Boolean(state?.showSafeArea),
    showPerf: Boolean(state?.showPerf),
    projectWidth: readFiniteNumber(state?.project?.width),
    projectHeight: readFiniteNumber(state?.project?.height),
    aspectRatio: getAspectRatio(state?.project),
    timeline: state?.timeline,
    assets: state?.assets,
    assetBuffers: state?.assetBuffers,
  };
}

function didLayoutChange(prev, next) {
  return prev.projectWidth !== next.projectWidth
    || prev.projectHeight !== next.projectHeight
    || prev.aspectRatio !== next.aspectRatio;
}

function didVisualChange(prev, next) {
  return prev.showSafeArea !== next.showSafeArea
    || prev.scrubbing !== next.scrubbing
    || didLayoutChange(prev, next)
    || prev.playing !== next.playing
    || prev.timeline !== next.timeline
    || ((next.scrubbing || !next.playing) && prev.playhead !== next.playhead);
}

function getAspectRatio(project) {
  const explicit = readFiniteNumber(project?.aspectRatio);
  if (explicit > 0) {
    return explicit;
  }

  const width = readFiniteNumber(project?.width);
  const height = readFiniteNumber(project?.height);
  if (width > 0 && height > 0) {
    return width / height;
  }

  return 16 / 9;
}

function getTimeline(state) {
  const timeline = state?.timeline;
  if (timeline && typeof timeline === "object") {
    if (typeof timeline.background === "string" && timeline.background.length > 0) {
      return timeline;
    }

    const cachedTimeline = NORMALIZED_TIMELINE_CACHE.get(timeline);
    if (cachedTimeline) {
      return cachedTimeline;
    }

    const normalizedTimeline = {
      ...timeline,
      background: DEFAULT_TIMELINE.background,
    };
    NORMALIZED_TIMELINE_CACHE.set(timeline, normalizedTimeline);
    return normalizedTimeline;
  }

  return DEFAULT_TIMELINE;
}

function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function advancePlayhead(store, currentTime, dt, timeline) {
  const duration = readFiniteNumber(timeline?.duration);
  const loopEnabled = store?.state?.loop !== false;

  if (!loopEnabled) {
    const nextTime = Math.min(Math.max(currentTime + dt, 0), duration);
    const reachedEnd = duration > 0 && nextTime >= duration;

    if (store && typeof store.mutate === "function" && (nextTime !== currentTime || (reachedEnd && store.state.playing))) {
      store.mutate((state) => {
        state.playhead = nextTime;
        if (reachedEnd) {
          state.playing = false;
        }
      });
    }

    return nextTime;
  }

  const nextTime = wrapTime(currentTime + dt, duration);

  if (store && typeof store.mutate === "function" && nextTime !== currentTime) {
    store.mutate((state) => {
      state.playhead = nextTime;
    });
  }

  return nextTime;
}

function togglePerfHud(store) {
  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.showPerf = !Boolean(state.showPerf);
    });
    return;
  }

  if (typeof store?.replace === "function" && store?.state && typeof store.state === "object") {
    store.replace({
      ...store.state,
      showPerf: !Boolean(store.state.showPerf),
    });
  }
}

function installPerfHook(hook) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const previousHook = window.__nextframe_perf;
  window.__nextframe_perf = hook;

  return () => {
    if (window.__nextframe_perf !== hook) {
      return;
    }

    if (previousHook === undefined) {
      delete window.__nextframe_perf;
      return;
    }

    window.__nextframe_perf = previousHook;
  };
}

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (
      target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    );
}

function ensurePerfHudStyles() {
  if (document.getElementById(PERF_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = PERF_STYLE_ID;
  style.textContent = `
    .preview-perf-hud {
      position: absolute;
      z-index: 2;
      min-width: 68px;
      padding: 6px 9px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(7, 9, 15, 0.84);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
      color: #61d98b;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1;
      pointer-events: none;
      text-transform: uppercase;
      user-select: none;
    }

    .preview-perf-hud[data-tone="warn"] {
      color: #ffcf66;
    }

    .preview-perf-hud[data-tone="bad"] {
      color: #ff6b6b;
    }
  `;
  document.head.append(style);
}

function wrapTime(time, duration) {
  if (!(duration > 0)) {
    return 0;
  }

  const normalized = time % duration;
  return normalized >= 0 ? normalized : normalized + duration;
}
