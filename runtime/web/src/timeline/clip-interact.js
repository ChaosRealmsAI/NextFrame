import { moveClipCommand, splitClipCommand } from "../commands.js";
import {
  MIN_CLIP_DURATION,
  clampClipDuration,
  getClipDuration,
  hasTrackOverlap,
  roundClipTime,
} from "./clip-range.js";
import { computeSnap } from "./snap.js";

const EDGE_HIT_WIDTH = 8;
const DRAG_ACTIVATION_PX = 3;
const MIN_CLIP_WIDTH = 44;
const SNAP_GUIDE_FLASH_MS = 60;
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 16;

let activeInteraction = null;
let tooltipEl = null;

function findClipContext(timeline, clipId) {
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];

  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    const clip = clips.find((candidate) => candidate?.id === clipId);
    if (clip) {
      return { track, clip };
    }
  }

  return null;
}

function ensureTooltip() {
  if (tooltipEl instanceof HTMLElement) {
    return tooltipEl;
  }

  tooltipEl = document.createElement("div");
  tooltipEl.className = "timeline-clip-tooltip";
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function hideTooltip() {
  if (!(tooltipEl instanceof HTMLElement)) {
    return;
  }

  tooltipEl.hidden = true;
}

function formatTimeLabel(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(1)}s`;
}

function updateTooltip(event, preview) {
  const tooltip = ensureTooltip();
  tooltip.hidden = false;
  tooltip.textContent = `${formatTimeLabel(preview.start)} - ${formatTimeLabel(preview.start + preview.dur)}`;
  tooltip.classList.toggle("is-invalid", preview.invalid);
  tooltip.style.left = `${event.clientX + TOOLTIP_OFFSET_X}px`;
  tooltip.style.top = `${event.clientY + TOOLTIP_OFFSET_Y}px`;
}

function getInteractionMode(event, clipEl) {
  const rect = clipEl.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;

  if (offsetX <= EDGE_HIT_WIDTH) {
    return "resize-left";
  }

  if (offsetX >= rect.width - EDGE_HIT_WIDTH) {
    return "resize-right";
  }

  return "move";
}

function previewWidth(zoom, dur) {
  return `${Math.max(zoom.timeToPx(dur), MIN_CLIP_WIDTH)}px`;
}

function setPreviewState(clipEl, zoom, preview) {
  clipEl.style.left = `${zoom.timeToPx(preview.start)}px`;
  clipEl.style.width = previewWidth(zoom, preview.dur);
  clipEl.classList.add("is-interacting");
  clipEl.classList.toggle("is-invalid", preview.invalid);
}

function clearPreviewState(clipEl, originalStyles) {
  clipEl.classList.remove("is-interacting", "is-invalid");
  clipEl.style.left = originalStyles.left;
  clipEl.style.width = originalStyles.width;
}

function buildSnapTimeline(track, ignoreClipId) {
  const clips = Array.isArray(track?.clips) ? track.clips : [];

  return {
    tracks: [{
      ...track,
      clips: clips.filter((clip) => clip?.id !== ignoreClipId),
    }],
  };
}

function ensureSnapGuide(interaction) {
  if (interaction.snapGuideEl instanceof HTMLElement && interaction.snapGuideEl.isConnected) {
    return interaction.snapGuideEl;
  }

  const lane = interaction.clipEl.parentElement;
  if (!(lane instanceof HTMLElement)) {
    return null;
  }

  const guide = document.createElement("div");
  guide.className = "timeline-snap-guide";
  guide.hidden = true;
  lane.appendChild(guide);
  interaction.snapGuideEl = guide;
  return guide;
}

function hideSnapGuide(interaction) {
  window.clearTimeout(interaction.snapGuideTimer);

  if (interaction.snapGuideEl instanceof HTMLElement) {
    interaction.snapGuideEl.hidden = true;
  }
}

function flashSnapGuide(interaction, time) {
  const guide = ensureSnapGuide(interaction);
  if (!(guide instanceof HTMLElement)) {
    return;
  }

  guide.hidden = false;
  guide.style.left = `${interaction.zoom.timeToPx(time)}px`;
  window.clearTimeout(interaction.snapGuideTimer);
  interaction.snapGuideTimer = window.setTimeout(() => {
    guide.hidden = true;
  }, SNAP_GUIDE_FLASH_MS);
}

function hasDragStarted(interaction, clientX) {
  return Math.abs(clientX - interaction.originClientX) >= DRAG_ACTIVATION_PX;
}

function activateInteraction(interaction) {
  if (interaction.dragActivated) {
    return;
  }

  interaction.dragActivated = true;
  document.body.style.userSelect = "none";
  document.body.style.cursor = interaction.mode === "move" ? "grabbing" : "col-resize";
}

function maybeSnapTime(interaction, candidateTime, pointerState) {
  const nextTime = roundClipTime(candidateTime);
  const snapEnabled = interaction.store?.state?.snapEnabled !== false;

  if (!snapEnabled || pointerState?.altKey) {
    return { time: nextTime, snapTime: null };
  }

  const snappedTime = computeSnap({
    candidateTime: nextTime,
    timeline: interaction.snapTimeline,
    playhead: interaction.store?.state?.playhead,
    zoom: interaction.zoom,
  });

  if (Math.abs(snappedTime - nextTime) < 0.000001) {
    return { time: nextTime, snapTime: null };
  }

  return {
    time: snappedTime,
    snapTime: snappedTime,
  };
}

function computePreview(mode, interaction, clientX, pointerState) {
  const deltaSeconds = (clientX - interaction.originClientX) / interaction.zoom.pxPerSecond;
  const originalEnd = interaction.originalStart + interaction.originalDur;

  if (mode === "resize-left") {
    const maxStart = Math.max(0, originalEnd - MIN_CLIP_DURATION);
    const candidateStart = Math.min(roundClipTime(interaction.originalStart + deltaSeconds), maxStart);
    const snapped = maybeSnapTime(interaction, candidateStart, pointerState);
    const nextStart = Math.min(snapped.time, maxStart);
    return {
      start: nextStart,
      dur: clampClipDuration(originalEnd - nextStart),
      snapTime: Math.abs(nextStart - snapped.time) < 0.000001 ? snapped.snapTime : null,
    };
  }

  if (mode === "resize-right") {
    const minEnd = interaction.originalStart + MIN_CLIP_DURATION;
    const candidateEnd = Math.max(roundClipTime(originalEnd + deltaSeconds), minEnd);
    const snapped = maybeSnapTime(interaction, candidateEnd, pointerState);
    const nextEnd = Math.max(snapped.time, minEnd);
    return {
      start: interaction.originalStart,
      dur: clampClipDuration(nextEnd - interaction.originalStart),
      snapTime: Math.abs(nextEnd - snapped.time) < 0.000001 ? snapped.snapTime : null,
    };
  }

  const candidateStart = roundClipTime(interaction.originalStart + deltaSeconds);
  const snapped = maybeSnapTime(interaction, candidateStart, pointerState);

  return {
    start: snapped.time,
    dur: interaction.originalDur,
    snapTime: snapped.snapTime,
  };
}

function resolvePreview(interaction, clientX, pointerState) {
  const nextPreview = computePreview(interaction.mode, interaction, clientX, pointerState);

  return {
    ...nextPreview,
    invalid: hasTrackOverlap(interaction.track, nextPreview.start, nextPreview.dur, {
      ignoreClipId: interaction.clipId,
    }),
  };
}

function teardownActiveInteraction() {
  if (!activeInteraction) {
    return;
  }

  window.removeEventListener("mousemove", activeInteraction.handleMouseMove);
  window.removeEventListener("mouseup", activeInteraction.handleMouseUp);
  document.body.style.userSelect = activeInteraction.previousUserSelect;
  document.body.style.cursor = activeInteraction.previousCursor;
  hideTooltip();
  hideSnapGuide(activeInteraction);
  clearPreviewState(activeInteraction.clipEl, activeInteraction.originalStyles);
  activeInteraction = null;
}

export function attachClipInteractions(clipEl, clipId, store, zoom) {
  if (!(clipEl instanceof HTMLElement) || typeof clipId !== "string" || clipId.length === 0) {
    return () => {};
  }

  if (typeof clipEl.__detachClipInteractions === "function") {
    clipEl.__detachClipInteractions();
  }

  clipEl.style.cursor = "grab";

  clipEl.querySelectorAll(".timeline-clip-handle").forEach((handle) => {
    if (handle instanceof HTMLElement) {
      handle.style.cursor = "col-resize";
    }
  });

  const handleMouseDown = (event) => {
    if (event.button !== 0 || !store?.state || !zoom?.pxPerSecond) {
      return;
    }

    const context = findClipContext(store.state.timeline, clipId);
    if (!context) {
      return;
    }

    if (context.track?.locked) {
      return;
    }

    if (store.state.ui?.timelineTool === "blade") {
      const lane = clipEl.parentElement;
      if (!(lane instanceof HTMLElement)) {
        return;
      }

      const laneRect = lane.getBoundingClientRect();
      const splitTime = snapClipTime(zoom.pxToTime(event.clientX - laneRect.left));

      store.dispatch?.(splitClipCommand({ clipId, splitTime }));
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.shiftKey) {
      store.addToSelection?.(clipId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    teardownActiveInteraction();

    const mode = getInteractionMode(event, clipEl);
    const originalDur = getClipDuration(context.clip);
    const originalStyles = {
      left: clipEl.style.left,
      width: clipEl.style.width,
    };
    const interaction = {
      clipEl,
      clipId,
      mode,
      store,
      snapGuideEl: null,
      snapGuideTimer: 0,
      snapTimeline: buildSnapTimeline(context.track, clipId),
      zoom,
      track: context.track,
      originalStart: Number(context.clip.start) || 0,
      originalDur,
      originClientX: event.clientX,
      originalStyles,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      dragActivated: false,
      preview: {
        start: Number(context.clip.start) || 0,
        dur: originalDur,
        invalid: false,
        snapTime: null,
      },
      handleMouseMove: null,
      handleMouseUp: null,
    };

    const applyPreview = (moveEvent) => {
      if (!interaction.dragActivated && !hasDragStarted(interaction, moveEvent.clientX)) {
        hideTooltip();
        hideSnapGuide(interaction);
        return false;
      }

      activateInteraction(interaction);
      interaction.preview = resolvePreview(interaction, moveEvent.clientX, moveEvent);
      setPreviewState(clipEl, zoom, interaction.preview);
      updateTooltip(moveEvent, interaction.preview);

      if (interaction.preview.snapTime == null) {
        hideSnapGuide(interaction);
        return true;
      }

      flashSnapGuide(interaction, interaction.preview.snapTime);
      return true;
    };

    interaction.handleMouseMove = (moveEvent) => {
      applyPreview(moveEvent);
    };

    interaction.handleMouseUp = (upEvent) => {
      const didDrag = applyPreview(upEvent);
      const finalPreview = interaction.preview;
      const changed = didDrag
        && (finalPreview.start !== interaction.originalStart || finalPreview.dur !== interaction.originalDur);

      teardownActiveInteraction();

      if (!changed || finalPreview.invalid) {
        return;
      }

      store.dispatch(moveClipCommand({
        clipId,
        newStart: finalPreview.start,
        newDur: finalPreview.dur,
      }));
    };

    activeInteraction = interaction;
    store.selectClip?.(clipId);
    window.addEventListener("mousemove", interaction.handleMouseMove);
    window.addEventListener("mouseup", interaction.handleMouseUp);
    event.preventDefault();
    event.stopPropagation();
  };

  clipEl.addEventListener("mousedown", handleMouseDown);

  const detach = () => {
    if (activeInteraction?.clipEl === clipEl) {
      teardownActiveInteraction();
    }

    clipEl.removeEventListener("mousedown", handleMouseDown);
    delete clipEl.__detachClipInteractions;
  };

  clipEl.__detachClipInteractions = detach;
  return detach;
}
