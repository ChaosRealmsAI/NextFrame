import { getAudioContext } from "../audio/context.js";
import { createMixer } from "../audio/mixer.js";
import { renderAt as defaultRenderAt, setupDPR as defaultSetupDPR } from "../engine/index.js";
import { computeLetterboxRect } from "./letterbox.js";
import { createLoop } from "./loop.js";
import { drawSafeArea } from "./safeArea.js";

const DEFAULT_TIMELINE = {
  version: "1",
  duration: 30,
  background: "#0b0b14",
  tracks: [],
};

const MOUNT_STATE = Symbol("nextframe.preview.mountState");

export function mountPreview(container, { engine, store } = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("mountPreview(container, options) requires a container element");
  }

  if (container[MOUNT_STATE]) {
    return container[MOUNT_STATE];
  }

  const mountHost = container.querySelector("#preview-stage-slot") ?? container;
  const frame = document.createElement("div");
  const canvas = document.createElement("canvas");

  frame.className = "preview-canvas-frame";
  canvas.className = "preview-canvas";
  frame.append(canvas);
  mountHost.replaceChildren(frame);

  const engineApi = {
    renderAt: typeof engine?.renderAt === "function" ? engine.renderAt : defaultRenderAt,
    setupDPR: typeof engine?.setupDPR === "function" ? engine.setupDPR : defaultSetupDPR,
  };
  const audioMixer = createMixer({
    getAudioContext,
    getState: () => store?.state ?? null,
  });

  let ctx = null;
  let lastRect = { x: 0, y: 0, width: 0, height: 0 };
  let lastSnapshot = createSnapshot(store?.state);
  let recordingMode = false;

  const readTime = () => {
    const value = Number(store?.state?.playhead);
    return Number.isFinite(value) ? value : 0;
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
    tick(time, dt) {
      const timeline = getTimeline(store?.state);
      const nextTime = store?.state?.playing
        ? advancePlayhead(store, time, dt, timeline)
        : time;

      audioMixer.syncToPlayhead(nextTime, Boolean(store?.state?.playing));
      renderFrame(nextTime, timeline);
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
  if (lastSnapshot.playing && !lastSnapshot.scrubbing) {
    audioMixer.syncToPlayhead(readTime(), true);
  }
  syncLoopState(lastSnapshot.playing);

  const api = {
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
    return timeline.background
      ? timeline
      : { ...timeline, background: "#0b0b14" };
  }

  return DEFAULT_TIMELINE;
}

function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function advancePlayhead(store, currentTime, dt, timeline) {
  const duration = readFiniteNumber(timeline?.duration);
  const nextTime = wrapTime(currentTime + dt, duration);

  if (store && typeof store.mutate === "function" && nextTime !== currentTime) {
    store.mutate((state) => {
      state.playhead = nextTime;
    });
  }

  return nextTime;
}

function wrapTime(time, duration) {
  if (!(duration > 0)) {
    return 0;
  }

  const normalized = time % duration;
  return normalized >= 0 ? normalized : normalized + duration;
}
