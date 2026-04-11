import { batchCommand, splitClipCommand } from "../commands.js";
import { createPlayhead } from "./playhead.js";
import { attachRulerScrub, formatTime, renderRuler } from "./ruler.js";
import { TRACK_HEADER_WIDTH, createTrackRow } from "./track.js";
import { BASE_PX_PER_SECOND, createZoomController } from "./zoom.js";

const MARQUEE_DRAG_THRESHOLD_PX = 4;

function getProjectDuration(timeline) {
  const clipDuration = (timeline?.tracks || []).reduce((maxEnd, track) => {
    const trackEnd = (track.clips || []).reduce((clipMax, clip) => {
      return Math.max(clipMax, (Number(clip.start) || 0) + (Number(clip.duration ?? clip.dur) || 0));
    }, 0);

    return Math.max(maxEnd, trackEnd);
  }, 0);

  return Math.max(Number(timeline?.duration) || 0, clipDuration, 1);
}

function createStructure(container) {
  container.replaceChildren();
  container.innerHTML = `
    <div class="timeline-toolbar">
      <div class="timeline-toolbar-main">
        <div class="panel-title">
          <strong>Timeline</strong>
          <span data-role="summary">00 second sequence</span>
        </div>
        <div class="timeline-tool-palette" data-role="toolbar" aria-label="Timeline tools">
          <button class="timeline-tool-button is-active" type="button" data-tool="select" aria-pressed="true">Select</button>
          <button class="timeline-tool-button" type="button" data-tool="blade" aria-pressed="false">Blade</button>
        </div>
      </div>
      <div class="timeline-zoom-controls" aria-label="Timeline zoom controls">
        <button class="timeline-zoom-button" type="button" data-action="zoom-out" aria-label="Zoom out">-</button>
        <input class="timeline-zoom-slider" type="range" min="0.1" max="50" step="0.1" value="2" aria-label="Timeline zoom" />
        <button class="timeline-zoom-button" type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
        <button class="timeline-fit-button" type="button" data-action="fit" aria-label="Fit project to timeline">Fit</button>
        <span class="mini-chip timeline-zoom-readout" data-role="zoom-readout">2.00x</span>
      </div>
    </div>
    <div class="timeline-body">
      <div class="timeline-ruler-shell">
        <div class="timeline-ruler-side">Tracks</div>
        <div class="timeline-ruler-scroll" data-role="ruler-scroll">
          <div class="timeline-ruler-canvas" data-role="ruler-canvas"></div>
        </div>
      </div>
      <div class="timeline-tracks-scroll" data-role="tracks-scroll">
        <div class="timeline-tracks-canvas" data-role="tracks-canvas">
          <div class="timeline-track-list" data-role="track-list"></div>
        </div>
      </div>
    </div>
  `;

  return {
    summary: container.querySelector('[data-role="summary"]'),
    toolbar: container.querySelector('[data-role="toolbar"]'),
    slider: container.querySelector(".timeline-zoom-slider"),
    readout: container.querySelector('[data-role="zoom-readout"]'),
    zoomIn: container.querySelector('[data-action="zoom-in"]'),
    zoomOut: container.querySelector('[data-action="zoom-out"]'),
    fit: container.querySelector('[data-action="fit"]'),
    rulerScroll: container.querySelector('[data-role="ruler-scroll"]'),
    rulerCanvas: container.querySelector('[data-role="ruler-canvas"]'),
    tracksScroll: container.querySelector('[data-role="tracks-scroll"]'),
    tracksCanvas: container.querySelector('[data-role="tracks-canvas"]'),
    trackList: container.querySelector('[data-role="track-list"]'),
  };
}

function getTrackSignature(track) {
  return JSON.stringify({
    kind: track.kind || "",
    label: track.label || "",
    name: track.name || "",
    muted: Boolean(track.muted),
    locked: Boolean(track.locked),
    clips: (track.clips || []).map((clip) => ({
      id: clip.id || "",
      category: clip.category || "",
      label: clip.label || "",
      name: clip.name || "",
      note: clip.note || "",
      scene: clip.scene || "",
      start: Number(clip.start) || 0,
      duration: Number(clip.duration ?? clip.dur) || 0,
      assetId: clip.assetId || clip.params?.assetId || "",
      src: clip.src || clip.params?.src || "",
    })),
  });
}

function getTimelineTool(state) {
  return state?.ui?.timelineTool === "blade" ? "blade" : "select";
}

function getSelectionClipIds(state) {
  const clipIds = Array.isArray(state?.selection?.clipIds)
    ? state.selection.clipIds.filter((clipId) => typeof clipId === "string" && clipId.length > 0)
    : [];
  const uniqueIds = [...new Set(clipIds)];

  if (typeof state?.selectedClipId === "string" && state.selectedClipId.length > 0 && !uniqueIds.includes(state.selectedClipId)) {
    uniqueIds.push(state.selectedClipId);
  }

  return uniqueIds;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLButtonElement;
}

function rectanglesIntersect(left, right) {
  return left.left < right.right
    && right.left < left.right
    && left.top < right.bottom
    && right.top < left.bottom;
}

export function mountTimeline(container, store) {
  if (typeof container.__timelineUnmount === "function") {
    container.__timelineUnmount();
  }

  const ui = createStructure(container);
  const zoom = createZoomController(2);
  const playhead = createPlayhead();
  const trackRows = new Map();
  const trackSignatures = new Map();
  const bladeIndicator = document.createElement("div");
  const marquee = document.createElement("div");

  bladeIndicator.className = "timeline-blade-indicator";
  bladeIndicator.hidden = true;
  marquee.className = "timeline-marquee";
  marquee.hidden = true;

  ui.rulerCanvas.appendChild(playhead.marker);
  ui.tracksCanvas.append(bladeIndicator, playhead.line, marquee);

  let duration = 1;
  let currentTimeline = store.state.timeline || { duration: 1, tracks: [] };
  let lastTimelineRef = currentTimeline;
  let lastAssetsRef = store.state.assets;
  let lastAssetBuffersRef = store.state.assetBuffers;
  let lastPlayhead = Number(store.state.playhead) || 0;
  let activeMarquee = null;

  function syncTrackRows(tracks, forceRender = false) {
    const nextIds = new Set();

    tracks.forEach((track, index) => {
      const id = track.id || `track-${index}`;
      const signature = getTrackSignature(track);
      nextIds.add(id);

      let row = trackRows.get(id);
      if (!row || forceRender || trackSignatures.get(id) !== signature) {
        const replacement = createTrackRow({ ...track, id }, { duration, zoom, store });
        if (row) {
          row.replaceWith(replacement);
        } else {
          ui.trackList.appendChild(replacement);
        }
        row = replacement;
        trackRows.set(id, row);
        trackSignatures.set(id, signature);
      }

      const expectedChild = ui.trackList.children[index];
      if (expectedChild !== row) {
        ui.trackList.insertBefore(row, expectedChild || null);
      }
    });

    [...trackRows.entries()].forEach(([id, row]) => {
      if (nextIds.has(id)) {
        return;
      }
      row.remove();
      trackRows.delete(id);
      trackSignatures.delete(id);
    });
  }

  function updateSummary() {
    const trackCount = (currentTimeline.tracks || []).length;
    const clipCount = (currentTimeline.tracks || []).reduce((total, track) => total + (track.clips || []).length, 0);
    ui.summary.textContent = `${formatTime(duration)} project • ${trackCount} tracks • ${clipCount} clips`;
  }

  function syncCanvasWidths() {
    const laneWidth = Math.max(zoom.timeToPx(duration), 1);
    ui.rulerCanvas.style.width = `${laneWidth}px`;
    ui.rulerCanvas.style.minWidth = "100%";
    ui.tracksCanvas.style.width = `${TRACK_HEADER_WIDTH + laneWidth}px`;
    ui.tracksCanvas.style.minWidth = "100%";
  }

  function hideBladeIndicator() {
    bladeIndicator.hidden = true;
  }

  function hideMarquee() {
    marquee.hidden = true;
  }

  function syncToolbarState() {
    const tool = getTimelineTool(store.state);
    container.dataset.timelineTool = tool;

    ui.toolbar.querySelectorAll("[data-tool]").forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (tool !== "blade") {
      hideBladeIndicator();
    }
  }

  function syncClipSelectionState() {
    const selectedClipIds = new Set(getSelectionClipIds(store.state));
    const multiSelected = selectedClipIds.size > 1;
    const primaryClipId = store.state.selectedClipId;

    ui.trackList.querySelectorAll(".timeline-clip").forEach((clipEl) => {
      const selected = selectedClipIds.has(clipEl.dataset.clipId);
      clipEl.classList.toggle("is-selected", selected && !multiSelected);
      clipEl.classList.toggle("is-multi-selected", selected && multiSelected);
      clipEl.classList.toggle("is-selection-primary", selected && multiSelected && clipEl.dataset.clipId === primaryClipId);
    });
  }

  function renderTimeline(forceRender = false) {
    duration = getProjectDuration(currentTimeline);
    syncCanvasWidths();
    renderRuler(ui.rulerCanvas, { duration, zoom });
    if (!ui.rulerCanvas.contains(playhead.marker)) {
      ui.rulerCanvas.appendChild(playhead.marker);
    }
    syncTrackRows(currentTimeline.tracks || [], forceRender);
    if (!ui.tracksCanvas.contains(bladeIndicator)) {
      ui.tracksCanvas.appendChild(bladeIndicator);
    }
    if (!ui.tracksCanvas.contains(playhead.line)) {
      ui.tracksCanvas.appendChild(playhead.line);
    }
    if (!ui.tracksCanvas.contains(marquee)) {
      ui.tracksCanvas.appendChild(marquee);
    }
    updateSummary();
    syncClipSelectionState();
    lastPlayhead = Number(store.state.playhead) || 0;
    playhead.setTime(lastPlayhead, zoom);
  }

  function syncZoomUI() {
    ui.slider.value = String(zoom.level);
    ui.readout.textContent = `${zoom.level.toFixed(2)}x`;
  }

  function setScrollLeft(scrollLeft) {
    ui.tracksScroll.scrollLeft = Math.max(0, scrollLeft);
    ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;
  }

  function getContentPoint(event) {
    const rect = ui.tracksScroll.getBoundingClientRect();
    return {
      x: ui.tracksScroll.scrollLeft + event.clientX - rect.left,
      y: ui.tracksScroll.scrollTop + event.clientY - rect.top,
    };
  }

  function getContentRect(element) {
    const rect = element.getBoundingClientRect();
    const scrollRect = ui.tracksScroll.getBoundingClientRect();
    return {
      left: ui.tracksScroll.scrollLeft + rect.left - scrollRect.left,
      top: ui.tracksScroll.scrollTop + rect.top - scrollRect.top,
      right: ui.tracksScroll.scrollLeft + rect.right - scrollRect.left,
      bottom: ui.tracksScroll.scrollTop + rect.bottom - scrollRect.top,
    };
  }

  function updateBladeIndicator(event) {
    if (getTimelineTool(store.state) !== "blade") {
      hideBladeIndicator();
      return;
    }

    const lane = event.target instanceof Element ? event.target.closest(".timeline-track-lane") : null;
    if (!(lane instanceof HTMLElement) || !ui.trackList.contains(lane)) {
      hideBladeIndicator();
      return;
    }

    const laneRect = getContentRect(lane);
    const point = getContentPoint(event);
    bladeIndicator.hidden = false;
    bladeIndicator.style.left = `${point.x}px`;
    bladeIndicator.style.top = `${laneRect.top}px`;
    bladeIndicator.style.height = `${laneRect.bottom - laneRect.top}px`;
  }

  function collectMarqueeClipIds(rect) {
    return [...ui.trackList.querySelectorAll(".timeline-clip")]
      .filter((clipEl) => rectanglesIntersect(rect, getContentRect(clipEl)))
      .map((clipEl) => clipEl.dataset.clipId)
      .filter(Boolean);
  }

  function setMarqueeRect(rect) {
    marquee.hidden = false;
    marquee.style.left = `${rect.left}px`;
    marquee.style.top = `${rect.top}px`;
    marquee.style.width = `${rect.right - rect.left}px`;
    marquee.style.height = `${rect.bottom - rect.top}px`;
  }

  function teardownMarquee() {
    if (!activeMarquee) {
      return;
    }

    window.removeEventListener("mousemove", activeMarquee.handleMouseMove);
    window.removeEventListener("mouseup", activeMarquee.handleMouseUp);
    document.body.style.userSelect = activeMarquee.previousUserSelect;
    document.body.style.cursor = activeMarquee.previousCursor;
    hideMarquee();
    activeMarquee = null;
  }

  function startMarquee(event, trackId) {
    teardownMarquee();

    const origin = getContentPoint(event);
    const interaction = {
      trackId,
      origin,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      handleMouseMove: null,
      handleMouseUp: null,
    };

    const readRect = (moveEvent) => {
      const point = getContentPoint(moveEvent);
      return {
        left: Math.min(origin.x, point.x),
        top: Math.min(origin.y, point.y),
        right: Math.max(origin.x, point.x),
        bottom: Math.max(origin.y, point.y),
      };
    };

    interaction.handleMouseMove = (moveEvent) => {
      const rect = readRect(moveEvent);
      if (
        rect.right - rect.left < MARQUEE_DRAG_THRESHOLD_PX
        && rect.bottom - rect.top < MARQUEE_DRAG_THRESHOLD_PX
      ) {
        hideMarquee();
        return;
      }

      setMarqueeRect(rect);
    };

    interaction.handleMouseUp = (upEvent) => {
      const rect = readRect(upEvent);
      const shouldSelect = rect.right - rect.left >= MARQUEE_DRAG_THRESHOLD_PX
        || rect.bottom - rect.top >= MARQUEE_DRAG_THRESHOLD_PX;

      teardownMarquee();

      if (!shouldSelect) {
        store.clearSelection?.({ trackId });
        return;
      }

      const clipIds = collectMarqueeClipIds(rect);
      store.dispatch({
        type: "setSelection",
        trackId,
        clipId: clipIds.at(-1) ?? null,
        clipIds,
      });
    };

    activeMarquee = interaction;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "crosshair";
    window.addEventListener("mousemove", interaction.handleMouseMove);
    window.addEventListener("mouseup", interaction.handleMouseUp);
    event.preventDefault();
  }

  function applyZoom(nextLevel, { preserveCenter = true } = {}) {
    const laneViewportWidth = Math.max(ui.tracksScroll.clientWidth - TRACK_HEADER_WIDTH, 0);
    const centerTime = preserveCenter && laneViewportWidth > 0
      ? zoom.pxToTime(ui.tracksScroll.scrollLeft + laneViewportWidth / 2)
      : 0;

    zoom.setZoom(nextLevel);
    syncZoomUI();
    renderTimeline(true);

    if (preserveCenter && laneViewportWidth > 0) {
      setScrollLeft(zoom.timeToPx(centerTime) - laneViewportWidth / 2);
      return;
    }
    setScrollLeft(0);
  }

  function fitTimeline() {
    const laneViewportWidth = Math.max(ui.tracksScroll.clientWidth - TRACK_HEADER_WIDTH - 24, 120);
    const fitLevel = laneViewportWidth / (BASE_PX_PER_SECOND * duration);
    applyZoom(fitLevel, { preserveCenter: false });
  }

  function splitSelectedClipsAtPlayhead() {
    const clipIds = getSelectionClipIds(store.state);
    if (clipIds.length === 0) {
      return;
    }

    const playheadTime = Number(store.state.playhead) || 0;
    store.dispatch(batchCommand(
      clipIds.map((clipId) => splitClipCommand({ clipId, splitTime: playheadTime })),
    ));
  }

  function selectAllOnActiveTrack() {
    const activeTrackId = store.state.selection?.trackId;
    const activeTrack = (currentTimeline.tracks || []).find((track) => track?.id === activeTrackId);
    if (!activeTrack) {
      return;
    }

    const clipIds = (activeTrack.clips || []).map((clip) => clip?.id).filter(Boolean);
    store.dispatch({
      type: "setSelection",
      trackId: activeTrack.id ?? null,
      clipId: clipIds.at(-1) ?? null,
      clipIds,
    });
  }

  function onScroll() {
    ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;
    hideBladeIndicator();
  }

  function onToolClick(event) {
    const button = event.target.closest("[data-tool]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    store.setTimelineTool?.(button.dataset.tool === "blade" ? "blade" : "select");
  }

  function onTrackMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    const lane = event.target instanceof Element ? event.target.closest(".timeline-track-lane") : null;
    if (!(lane instanceof HTMLElement) || !ui.trackList.contains(lane)) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".timeline-clip")) {
      return;
    }

    const row = lane.closest(".timeline-track-row");
    const trackId = row instanceof HTMLElement ? row.dataset.trackId || null : null;

    if (getTimelineTool(store.state) === "blade") {
      store.clearSelection?.({ trackId });
      return;
    }

    startMarquee(event, trackId);
  }

  function onKeydown(event) {
    if (event.defaultPrevented || isEditableTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    const hasShortcutModifier = event.metaKey || event.ctrlKey;

    if (hasShortcutModifier && !event.altKey && key === "a") {
      event.preventDefault();
      selectAllOnActiveTrack();
      return;
    }

    if (hasShortcutModifier && !event.altKey && key === "b") {
      event.preventDefault();
      splitSelectedClipsAtPlayhead();
      return;
    }

    if (!hasShortcutModifier && !event.altKey && key === "b") {
      event.preventDefault();
      store.setTimelineTool?.(getTimelineTool(store.state) === "blade" ? "select" : "blade");
      return;
    }

    if (!event.metaKey || event.altKey || event.ctrlKey) {
      return;
    }

    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      applyZoom(zoom.level * 1.25);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      applyZoom(zoom.level / 1.25);
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      fitTimeline();
    }
  }

  ui.toolbar.addEventListener("click", onToolClick);
  ui.tracksScroll.addEventListener("mousemove", updateBladeIndicator);
  ui.tracksScroll.addEventListener("mouseleave", hideBladeIndicator);
  ui.trackList.addEventListener("mousedown", onTrackMouseDown);
  ui.tracksScroll.addEventListener("scroll", onScroll);
  ui.slider.addEventListener("input", (event) => applyZoom(event.target.value));
  ui.zoomIn.addEventListener("click", () => applyZoom(zoom.level * 1.25));
  ui.zoomOut.addEventListener("click", () => applyZoom(zoom.level / 1.25));
  ui.fit.addEventListener("click", fitTimeline);
  window.addEventListener("keydown", onKeydown);
  const detachRulerScrub = attachRulerScrub(ui.rulerScroll, {
    getDuration: () => duration,
    store,
    zoom,
  });

  const unsubscribe = store.subscribe((nextState, previousState) => {
    if (nextState.timeline !== lastTimelineRef) {
      const previousDuration = duration;
      currentTimeline = nextState.timeline || { duration: 1, tracks: [] };
      renderTimeline(previousDuration !== getProjectDuration(currentTimeline));
      lastTimelineRef = nextState.timeline;
    }

    if (nextState.assets !== lastAssetsRef || nextState.assetBuffers !== lastAssetBuffersRef) {
      renderTimeline(true);
      lastAssetsRef = nextState.assets;
      lastAssetBuffersRef = nextState.assetBuffers;
    }

    const nextPlayhead = Number(nextState.playhead) || 0;
    if (nextPlayhead !== lastPlayhead) {
      playhead.setTime(nextPlayhead, zoom);
      lastPlayhead = nextPlayhead;
    }

    if (nextState.selection !== previousState.selection || nextState.selectedClipId !== previousState.selectedClipId) {
      syncClipSelectionState();
    }

    if (getTimelineTool(nextState) !== getTimelineTool(previousState)) {
      syncToolbarState();
    }
  });

  syncToolbarState();
  syncZoomUI();
  renderTimeline(true);
  ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;

  const unmount = () => {
    teardownMarquee();
    unsubscribe();
    ui.toolbar.removeEventListener("click", onToolClick);
    ui.tracksScroll.removeEventListener("mousemove", updateBladeIndicator);
    ui.tracksScroll.removeEventListener("mouseleave", hideBladeIndicator);
    ui.trackList.removeEventListener("mousedown", onTrackMouseDown);
    ui.tracksScroll.removeEventListener("scroll", onScroll);
    window.removeEventListener("keydown", onKeydown);
    detachRulerScrub();
    container.__timelineUnmount = null;
    container.replaceChildren();
  };

  container.__timelineUnmount = unmount;
  return unmount;
}
