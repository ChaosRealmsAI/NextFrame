import { endScrubbing, setScrubPlayhead, startScrubbing } from "./scrub.js";

function clampTime(time, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  return Math.min(Math.max(0, Number(time) || 0), safeDuration);
}

export function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function getTickStep(pxPerSecond) {
  if (pxPerSecond >= 100) {
    return 1;
  }
  if (pxPerSecond >= 40) {
    return 5;
  }
  return 10;
}

function getMinorTickStep(majorStep) {
  if (majorStep === 1) {
    return 0.5;
  }
  if (majorStep === 5) {
    return 1;
  }
  return 2;
}

function createTick(className, leftPx, label) {
  const tick = document.createElement("div");
  tick.className = className;
  tick.style.left = `${leftPx}px`;
  if (label) {
    const text = document.createElement("span");
    text.textContent = label;
    tick.appendChild(text);
  }
  return tick;
}

export function renderRuler(container, { duration, zoom }) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const majorStep = getTickStep(zoom.pxPerSecond);
  const minorStep = getMinorTickStep(majorStep);
  const width = Math.max(zoom.timeToPx(safeDuration), 1);

  container.replaceChildren();
  container.style.width = `${width}px`;
  container.style.minWidth = "100%";

  const ticks = document.createDocumentFragment();
  const majorCount = Math.floor(safeDuration / majorStep);
  const minorCount = Math.floor(safeDuration / minorStep);

  for (let index = 0; index <= minorCount; index += 1) {
    const time = index * minorStep;
    const ratio = time / majorStep;
    if (Math.abs(ratio - Math.round(ratio)) < 0.000001) {
      continue;
    }
    ticks.appendChild(createTick("timeline-ruler-tick timeline-ruler-tick-minor", zoom.timeToPx(time)));
  }

  for (let index = 0; index <= majorCount; index += 1) {
    const time = index * majorStep;
    ticks.appendChild(createTick("timeline-ruler-tick timeline-ruler-tick-major", zoom.timeToPx(time), formatTime(time)));
  }

  if (majorCount * majorStep < safeDuration) {
    ticks.appendChild(createTick("timeline-ruler-tick timeline-ruler-tick-major", width, formatTime(safeDuration)));
  }

  container.appendChild(ticks);

  return { majorStep, minorStep, width };
}

function commitPlayhead(store, playhead) {
  if ((Number(store?.state?.playhead) || 0) === playhead) {
    return;
  }

  if (typeof store?.dispatch === "function") {
    store.dispatch({
      type: "setPlayhead",
      playhead,
    });
    return;
  }

  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.playhead = playhead;
    });
    return;
  }

  throw new TypeError("ruler scrubbing requires a store with dispatch() or mutate()");
}

export function attachRulerScrub(rulerStrip, { store, zoom, getDuration } = {}) {
  if (!(rulerStrip instanceof HTMLElement)) {
    throw new TypeError("attachRulerScrub(rulerStrip, options) requires a ruler element");
  }

  if (typeof zoom?.pxToTime !== "function") {
    throw new TypeError("attachRulerScrub(rulerStrip, options) requires zoom.pxToTime()");
  }

  if (typeof getDuration !== "function") {
    throw new TypeError("attachRulerScrub(rulerStrip, options) requires getDuration()");
  }

  let activeInteraction = null;

  const readPlayhead = (event) => {
    const rect = rulerStrip.getBoundingClientRect();
    const contentX = rulerStrip.scrollLeft + event.clientX - rect.left;
    return clampTime(zoom.pxToTime(contentX), getDuration());
  };

  const restoreInteractionStyles = (interaction) => {
    document.body.style.userSelect = interaction.previousUserSelect;
    document.body.style.cursor = interaction.previousCursor;
  };

  const cleanupInteraction = () => {
    if (!activeInteraction) {
      return;
    }

    window.removeEventListener("mousemove", activeInteraction.handleMouseMove);
    window.removeEventListener("mouseup", activeInteraction.handleMouseUp);
    restoreInteractionStyles(activeInteraction);
    activeInteraction = null;
  };

  const onMouseDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    cleanupInteraction();
    event.preventDefault();

    const interaction = {
      didDrag: false,
      originX: event.clientX,
      originY: event.clientY,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      handleMouseMove: null,
      handleMouseUp: null,
    };

    interaction.handleMouseMove = (moveEvent) => {
      const moved = moveEvent.clientX !== interaction.originX || moveEvent.clientY !== interaction.originY;
      if (!interaction.didDrag && !moved) {
        return;
      }

      if (!interaction.didDrag) {
        interaction.didDrag = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "ew-resize";
        startScrubbing(store);
      }

      setScrubPlayhead(store, readPlayhead(moveEvent));
    };

    interaction.handleMouseUp = (upEvent) => {
      const nextPlayhead = readPlayhead(upEvent);
      const didDrag = interaction.didDrag;

      cleanupInteraction();

      if (!didDrag) {
        commitPlayhead(store, nextPlayhead);
        return;
      }

      setScrubPlayhead(store, nextPlayhead);
      endScrubbing(store);
    };

    activeInteraction = interaction;
    window.addEventListener("mousemove", interaction.handleMouseMove);
    window.addEventListener("mouseup", interaction.handleMouseUp);
  };

  rulerStrip.addEventListener("mousedown", onMouseDown);

  return () => {
    rulerStrip.removeEventListener("mousedown", onMouseDown);

    if (activeInteraction?.didDrag) {
      endScrubbing(store);
    }

    cleanupInteraction();
  };
}
