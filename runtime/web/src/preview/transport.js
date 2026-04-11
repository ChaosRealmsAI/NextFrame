import { readLoopRegion, updateLoopRegion } from "../loop-region.js";

const MOUNT_STATE = Symbol("nextframe.preview.transport.mountState");
const STYLE_ID = "nextframe-preview-transport-styles";
const FRAME_INTERVAL = 1000 / 30;

export function mountTransport(container, { store, audioMixer } = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("mountTransport(container, options) requires a container element");
  }

  if (container[MOUNT_STATE]) {
    return container[MOUNT_STATE];
  }

  ensureStyles();

  const requestFrame = globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback) => globalThis.setTimeout(() => callback(Date.now()), 16);
  const cancelFrame = globalThis.cancelAnimationFrame
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : globalThis.clearTimeout.bind(globalThis);

  const root = document.createElement("div");
  root.className = "preview-transport";

  const timeDisplay = document.createElement("div");
  timeDisplay.className = "preview-transport__time";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "preview-transport__play";
  playButton.setAttribute("aria-label", "Pause preview");
  playButton.setAttribute("aria-pressed", "true");

  const playIcon = document.createElement("span");
  playIcon.className = "preview-transport__play-icon";
  playIcon.setAttribute("aria-hidden", "true");
  playButton.append(playIcon);

  const scrubber = document.createElement("button");
  scrubber.type = "button";
  scrubber.className = "preview-transport__scrubber";
  scrubber.setAttribute("aria-label", "Jump playhead");

  const scrubberFill = document.createElement("span");
  scrubberFill.className = "preview-transport__scrubber-fill";
  const scrubberThumb = document.createElement("span");
  scrubberThumb.className = "preview-transport__scrubber-thumb";
  scrubber.append(scrubberFill, scrubberThumb);

  const loopButton = document.createElement("button");
  loopButton.type = "button";
  loopButton.className = "preview-transport__toggle";
  loopButton.textContent = "Loop";
  loopButton.setAttribute("aria-pressed", "true");

  const volumeWrap = document.createElement("label");
  volumeWrap.className = "preview-transport__volume";

  const volumeLabel = document.createElement("span");
  volumeLabel.className = "preview-transport__volume-label";
  volumeLabel.textContent = "Vol";

  const volumeSlider = document.createElement("input");
  volumeSlider.className = "preview-transport__volume-slider";
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.01";

  volumeWrap.append(volumeLabel, volumeSlider);
  root.append(timeDisplay, playButton, scrubber, loopButton, volumeWrap);
  container.replaceChildren(root);

  let rafId = 0;
  let lastPaint = 0;
  let renderQueued = true;
  let volume = clamp01(
    typeof audioMixer?.getMasterVolume === "function"
      ? audioMixer.getMasterVolume()
      : 1,
  );

  volumeSlider.value = volume.toFixed(2);

  const render = () => {
    renderQueued = false;

    const snapshot = readSnapshot(store?.state);
    const current = clampTime(snapshot.playhead, snapshot.duration);
    const ratio = snapshot.duration > 0
      ? Math.min(Math.max(current / snapshot.duration, 0), 1)
      : 0;

    root.dataset.playing = snapshot.playing ? "true" : "false";
    loopButton.dataset.active = snapshot.loop ? "true" : "false";
    playButton.setAttribute("aria-label", snapshot.playing ? "Pause preview" : "Play preview");
    playButton.setAttribute("aria-pressed", snapshot.playing ? "true" : "false");
    loopButton.setAttribute("aria-pressed", snapshot.loop ? "true" : "false");
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(snapshot.duration)}`;
    scrubberFill.style.transform = `scaleX(${ratio})`;
    scrubberThumb.style.left = `${ratio * 100}%`;
  };

  const tick = (now) => {
    if (renderQueued && (lastPaint === 0 || now - lastPaint >= FRAME_INTERVAL)) {
      render();
      lastPaint = now;
    }

    rafId = requestFrame(tick);
  };

  const unsubscribe = typeof store?.subscribe === "function"
    ? store.subscribe((nextState, previousState) => {
      const previous = readSnapshot(previousState);
      const next = readSnapshot(nextState);

      if (
        next.playhead !== previous.playhead
        || next.playing !== previous.playing
        || next.loop !== previous.loop
        || next.duration !== previous.duration
      ) {
        renderQueued = true;
      }
    })
    : () => {};

  playButton.addEventListener("click", () => {
    togglePlaying(store);
    renderQueued = true;
  });

  scrubber.addEventListener("click", (event) => {
    const duration = readDuration(store?.state);
    if (!(duration > 0)) {
      return;
    }

    const rect = scrubber.getBoundingClientRect();
    if (!(rect.width > 0)) {
      return;
    }

    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setPlayhead(store, duration * ratio);
    renderQueued = true;
  });

  loopButton.addEventListener("click", () => {
    updateLoopRegion(store, (loopRegion) => ({
      enabled: !loopRegion.enabled,
    }));
    renderQueued = true;
  });

  volumeSlider.addEventListener("input", () => {
    volume = clamp01(Number(volumeSlider.value));
    volumeSlider.value = volume.toFixed(2);

    if (typeof audioMixer?.setMasterVolume === "function") {
      audioMixer.setMasterVolume(volume);
    }
  });

  if (typeof audioMixer?.setMasterVolume === "function") {
    audioMixer.setMasterVolume(volume);
  }

  render();
  rafId = requestFrame(tick);

  const api = {
    destroy() {
      unsubscribe();
      if (rafId !== 0) {
        cancelFrame(rafId);
      }
      delete container[MOUNT_STATE];
      container.replaceChildren();
    },
  };

  container[MOUNT_STATE] = api;
  return api;
}

function readSnapshot(state) {
  const loopRegion = readLoopRegion(state);

  return {
    duration: readDuration(state),
    loop: loopRegion.enabled,
    playhead: readTime(state?.playhead),
    playing: Boolean(state?.playing),
  };
}

function readDuration(state) {
  return readTime(state?.timeline?.duration);
}

function readTime(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clampTime(value, duration) {
  if (!(duration > 0)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), duration);
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 0), 1);
}

function formatTime(value) {
  const totalCentiseconds = Math.max(0, Math.floor(readTime(value) * 100));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":") + `.${String(centiseconds).padStart(2, "0")}`;
}

function togglePlaying(store) {
  const duration = readDuration(store?.state);
  const playhead = clampTime(readTime(store?.state?.playhead), duration);
  const loopRegion = readLoopRegion(store?.state, { duration });

  updateStore(store, (state) => {
    if (!state.playing && duration > 0 && playhead >= duration) {
      state.playhead = loopRegion.enabled ? loopRegion.in : 0;
    }

    state.playing = !state.playing;
  });
}

function setPlayhead(store, playhead) {
  const duration = readDuration(store?.state);
  const nextPlayhead = clampTime(playhead, duration);

  if (typeof store?.dispatch === "function") {
    store.dispatch({
      type: "setPlayhead",
      playhead: nextPlayhead,
    });
    return;
  }

  updateStore(store, (state) => {
    state.playhead = nextPlayhead;
  });
}

function updateStore(store, recipe) {
  if (typeof recipe !== "function") {
    return;
  }

  if (typeof store?.mutate === "function") {
    store.mutate(recipe);
    return;
  }

  if (typeof store?.replace === "function") {
    const nextState = { ...(store?.state ?? {}) };
    recipe(nextState);
    store.replace(nextState);
  }
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .preview-transport {
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 0 8px;
    }

    .preview-transport__time,
    .preview-transport__toggle,
    .preview-transport__volume {
      flex: 0 0 auto;
    }

    .preview-transport__time {
      min-width: 234px;
      padding: 9px 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(24, 24, 36, 0.92), rgba(15, 15, 24, 0.94));
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      color: var(--text);
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-align: center;
      white-space: nowrap;
    }

    .preview-transport__play,
    .preview-transport__toggle,
    .preview-transport__scrubber {
      border: 0;
      font: inherit;
      cursor: pointer;
    }

    .preview-transport__play {
      position: relative;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.98), rgba(37, 99, 235, 0.92));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.22),
        0 14px 28px rgba(59, 130, 246, 0.22);
      color: #fff;
    }

    .preview-transport__play:focus-visible,
    .preview-transport__toggle:focus-visible,
    .preview-transport__scrubber:focus-visible,
    .preview-transport__volume-slider:focus-visible {
      outline: 2px solid rgba(56, 189, 248, 0.85);
      outline-offset: 2px;
    }

    .preview-transport__play-icon {
      position: relative;
      width: 14px;
      height: 16px;
      margin-left: 2px;
    }

    .preview-transport[data-playing="true"] .preview-transport__play-icon {
      width: 14px;
      height: 14px;
      margin-left: 0;
    }

    .preview-transport__play-icon::before,
    .preview-transport__play-icon::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 999px;
      background: currentColor;
      transition: opacity 120ms ease, transform 120ms ease;
    }

    .preview-transport[data-playing="false"] .preview-transport__play-icon::before {
      left: 1px;
      width: 0;
      height: 0;
      top: 50%;
      bottom: auto;
      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
      border-left: 13px solid currentColor;
      border-radius: 0;
      background: transparent;
      transform: translateY(-50%);
    }

    .preview-transport[data-playing="false"] .preview-transport__play-icon::after {
      opacity: 0;
    }

    .preview-transport[data-playing="true"] .preview-transport__play-icon::before,
    .preview-transport[data-playing="true"] .preview-transport__play-icon::after {
      width: 4px;
    }

    .preview-transport[data-playing="true"] .preview-transport__play-icon::before {
      left: 1px;
    }

    .preview-transport[data-playing="true"] .preview-transport__play-icon::after {
      right: 1px;
    }

    .preview-transport__scrubber {
      position: relative;
      width: min(36vw, 320px);
      min-width: 180px;
      height: 12px;
      padding: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      overflow: visible;
    }

    .preview-transport__scrubber-fill {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.92), rgba(56, 189, 248, 0.92));
      transform-origin: left center;
    }

    .preview-transport__scrubber-thumb {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #f5f7ff;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .preview-transport__toggle {
      min-width: 64px;
      height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      color: var(--text-dim);
      transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
    }

    .preview-transport__toggle[data-active="true"] {
      background: rgba(99, 102, 241, 0.18);
      box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.42);
      color: var(--text);
    }

    .preview-transport__volume {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text-dim);
    }

    .preview-transport__volume-label {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .preview-transport__volume-slider {
      width: 108px;
      margin: 0;
      accent-color: #60a5fa;
      cursor: pointer;
    }
  `;

  document.head.append(style);
}
