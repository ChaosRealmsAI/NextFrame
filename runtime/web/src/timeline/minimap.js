import { SCENE_MANIFEST } from "../scenes/index.js";
import { CATEGORY_COLORS } from "./clip.js";

const MINIMAP_HEIGHT_PX = 40;
const DRAG_THRESHOLD_PX = 3;
const SCENE_CATEGORY_BY_ID = new Map(SCENE_MANIFEST.map((scene) => [scene.id, scene.category || ""]));

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getContainerWidth(container) {
  return Math.max(Number(container?.offsetWidth) || Number(container?.clientWidth) || 0, 1);
}

function getClipCategory(clip) {
  if (typeof clip?.category === "string" && clip.category.length > 0) {
    return clip.category;
  }

  if (typeof clip?.scene === "string" && clip.scene.length > 0) {
    return SCENE_CATEGORY_BY_ID.get(clip.scene) || "";
  }

  return "";
}

function getClipColor(clip, trackKind) {
  if (trackKind === "audio") {
    return CATEGORY_COLORS.Audio;
  }

  return CATEGORY_COLORS[getClipCategory(clip)] || CATEGORY_COLORS.Backgrounds;
}

function getClipDuration(clip) {
  return Math.max(0, Number(clip?.duration ?? clip?.dur) || 0);
}

function commitPlayhead(store, playhead) {
  const nextPlayhead = Math.max(0, Number(playhead) || 0);
  if ((Number(store?.state?.playhead) || 0) === nextPlayhead) {
    return;
  }

  if (typeof store?.dispatch === "function") {
    store.dispatch({
      type: "setPlayhead",
      playhead: nextPlayhead,
    });
    return;
  }

  if (typeof store?.mutate === "function") {
    store.mutate((state) => {
      state.playhead = nextPlayhead;
    });
    return;
  }

  throw new TypeError("minimap interactions require a store with dispatch() or mutate()");
}

export function mountMinimap(container, store) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("mountMinimap(container, store) requires a container element");
  }

  const clipsLayer = document.createElement("div");
  const windowBox = document.createElement("div");
  const playhead = document.createElement("div");

  container.replaceChildren();
  container.classList.add("timeline-minimap");
  container.style.height = `${MINIMAP_HEIGHT_PX}px`;
  container.setAttribute("aria-label", "Timeline overview");

  clipsLayer.className = "timeline-minimap-clips";
  windowBox.className = "timeline-minimap-window";
  playhead.className = "timeline-minimap-playhead";
  container.append(clipsLayer, windowBox, playhead);

  const state = {
    duration: 1,
    playhead: Number(store?.state?.playhead) || 0,
    scrollLeft: 0,
    timeline: { tracks: [] },
    viewportWidth: 0,
    zoomPxPerSecond: 0,
    onScrollTo: null,
  };

  let lastTracksRef = null;
  let lastDuration = -1;
  let lastWidth = -1;
  let activeDrag = null;

  function timeToMinimapPx(time) {
    return clamp((Math.max(0, Number(time) || 0) / Math.max(state.duration, 0.000001)) * getContainerWidth(container), 0, getContainerWidth(container));
  }

  function renderClips() {
    const width = getContainerWidth(container);
    const tracks = Array.isArray(state.timeline?.tracks) ? state.timeline.tracks : [];
    const trackCount = Math.max(tracks.length, 1);
    const fragment = document.createDocumentFragment();

    clipsLayer.replaceChildren();

    tracks.forEach((track, index) => {
      const row = document.createElement("div");
      const rowTop = (MINIMAP_HEIGHT_PX * index) / trackCount;
      const rowBottom = (MINIMAP_HEIGHT_PX * (index + 1)) / trackCount;
      const rowHeight = Math.max(rowBottom - rowTop, 1);

      row.className = "timeline-minimap-row";
      row.style.top = `${rowTop}px`;
      row.style.height = `${rowHeight}px`;

      (track?.clips || []).forEach((clip) => {
        const clipDuration = getClipDuration(clip);
        if (clipDuration <= 0) {
          return;
        }

        const clipEl = document.createElement("div");
        const left = clamp((Math.max(0, Number(clip?.start) || 0) / Math.max(state.duration, 0.000001)) * width, 0, width);
        const clipWidth = Math.max((clipDuration / Math.max(state.duration, 0.000001)) * width, 1);

        clipEl.className = "timeline-minimap-clip";
        clipEl.style.left = `${left}px`;
        clipEl.style.width = `${clipWidth}px`;
        clipEl.style.backgroundColor = getClipColor(clip, track?.kind || "");
        row.appendChild(clipEl);
      });

      fragment.appendChild(row);
    });

    clipsLayer.appendChild(fragment);
  }

  function renderViewport() {
    const width = getContainerWidth(container);
    const visibleDuration = state.zoomPxPerSecond > 0
      ? state.viewportWidth / state.zoomPxPerSecond
      : state.duration;
    const startTime = state.zoomPxPerSecond > 0
      ? state.scrollLeft / state.zoomPxPerSecond
      : 0;
    const left = clamp((startTime / Math.max(state.duration, 0.000001)) * width, 0, width);
    const viewportWidth = Math.min(
      clamp((visibleDuration / Math.max(state.duration, 0.000001)) * width, 0, width),
      Math.max(width - left, 1),
    );

    windowBox.style.left = `${left}px`;
    windowBox.style.width = `${Math.max(viewportWidth, 1)}px`;
  }

  function renderPlayhead() {
    playhead.style.left = `${timeToMinimapPx(state.playhead)}px`;
  }

  function sync(forceClips = false) {
    const width = getContainerWidth(container);
    if (
      forceClips
      || state.timeline?.tracks !== lastTracksRef
      || state.duration !== lastDuration
      || width !== lastWidth
    ) {
      renderClips();
      lastTracksRef = state.timeline?.tracks || null;
      lastDuration = state.duration;
      lastWidth = width;
    }

    renderViewport();
    renderPlayhead();
  }

  function readTime(event) {
    const rect = container.getBoundingClientRect();
    const offsetX = clamp(event.clientX - rect.left, 0, rect.width || getContainerWidth(container));
    return clamp((offsetX / Math.max(rect.width || getContainerWidth(container), 1)) * state.duration, 0, state.duration);
  }

  function scrollToCenter(time) {
    if (typeof state.onScrollTo !== "function") {
      return;
    }

    const nextScrollLeft = state.zoomPxPerSecond * clamp(time, 0, state.duration) - state.viewportWidth / 2;
    state.onScrollTo(nextScrollLeft);
  }

  function restoreDragStyles(interaction) {
    document.body.style.userSelect = interaction.previousUserSelect;
    document.body.style.cursor = interaction.previousCursor;
  }

  function cleanupDrag() {
    if (!activeDrag) {
      return;
    }

    window.removeEventListener("mousemove", activeDrag.handleMouseMove);
    window.removeEventListener("mouseup", activeDrag.handleMouseUp);
    restoreDragStyles(activeDrag);
    activeDrag = null;
  }

  function onMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    cleanupDrag();
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
      if (
        !interaction.didDrag
        && Math.abs(moveEvent.clientX - interaction.originX) < DRAG_THRESHOLD_PX
        && Math.abs(moveEvent.clientY - interaction.originY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }

      if (!interaction.didDrag) {
        interaction.didDrag = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "ew-resize";
      }

      scrollToCenter(readTime(moveEvent));
    };

    interaction.handleMouseUp = (upEvent) => {
      const nextTime = readTime(upEvent);
      const didDrag = interaction.didDrag;

      cleanupDrag();

      if (!didDrag) {
        commitPlayhead(store, nextTime);
        return;
      }

      scrollToCenter(nextTime);
    };

    activeDrag = interaction;
    window.addEventListener("mousemove", interaction.handleMouseMove);
    window.addEventListener("mouseup", interaction.handleMouseUp);
  }

  container.addEventListener("mousedown", onMouseDown);

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        sync(true);
      })
    : null;
  resizeObserver?.observe(container);

  sync(true);

  return {
    update(nextState = {}) {
      state.timeline = nextState.timeline || state.timeline;
      state.duration = Math.max(1, Number(nextState.duration) || state.duration || 1);
      state.playhead = clamp(Number(nextState.playhead) || 0, 0, state.duration);
      state.scrollLeft = Math.max(0, Number(nextState.scrollLeft) || 0);
      state.viewportWidth = Math.max(0, Number(nextState.viewportWidth) || 0);
      state.zoomPxPerSecond = Math.max(0, Number(nextState.zoomPxPerSecond) || 0);
      state.onScrollTo = typeof nextState.onScrollTo === "function" ? nextState.onScrollTo : state.onScrollTo;
      sync(Boolean(nextState.forceRender));
    },
    unmount() {
      cleanupDrag();
      resizeObserver?.disconnect();
      container.removeEventListener("mousedown", onMouseDown);
      container.replaceChildren();
    },
  };
}
