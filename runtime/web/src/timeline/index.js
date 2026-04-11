import { createPlayhead } from "./playhead.js";
import { formatTime, renderRuler } from "./ruler.js";
import { TRACK_HEADER_WIDTH, createTrackRow } from "./track.js";
import { BASE_PX_PER_SECOND, createZoomController } from "./zoom.js";

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
      <div class="panel-title">
        <strong>Timeline</strong>
        <span data-role="summary">00 second sequence</span>
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
    label: track.label || "",
    name: track.name || "",
    muted: Boolean(track.muted),
    locked: Boolean(track.locked),
    clips: (track.clips || []).map((clip) => ({
      id: clip.id || "",
      category: clip.category || "",
      name: clip.name || "",
      scene: clip.scene || "",
      start: Number(clip.start) || 0,
      duration: Number(clip.duration ?? clip.dur) || 0,
    })),
  });
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

  ui.rulerCanvas.appendChild(playhead.marker);
  ui.tracksCanvas.appendChild(playhead.line);

  let duration = 1;
  let currentTimeline = store.state.timeline || { duration: 1, tracks: [] };

  function syncTrackRows(tracks, forceRender = false) {
    const nextIds = new Set();

    tracks.forEach((track, index) => {
      const id = track.id || `track-${index}`;
      const signature = getTrackSignature(track);
      nextIds.add(id);

      let row = trackRows.get(id);
      if (!row || forceRender || trackSignatures.get(id) !== signature) {
        const replacement = createTrackRow({ ...track, id }, { duration, zoom });
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

  function renderTimeline(forceRender = false) {
    duration = getProjectDuration(currentTimeline);
    syncCanvasWidths();
    renderRuler(ui.rulerCanvas, { duration, zoom });
    if (!ui.rulerCanvas.contains(playhead.marker)) {
      ui.rulerCanvas.appendChild(playhead.marker);
    }
    syncTrackRows(currentTimeline.tracks || [], forceRender);
    if (!ui.tracksCanvas.contains(playhead.line)) {
      ui.tracksCanvas.appendChild(playhead.line);
    }
    updateSummary();
    playhead.setTime(store.state.playhead || 0, zoom);
  }

  function syncZoomUI() {
    ui.slider.value = String(zoom.level);
    ui.readout.textContent = `${zoom.level.toFixed(2)}x`;
  }

  function setScrollLeft(scrollLeft) {
    ui.tracksScroll.scrollLeft = Math.max(0, scrollLeft);
    ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;
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

  function onScroll() {
    ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;
  }

  function onKeydown(event) {
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

  ui.tracksScroll.addEventListener("scroll", onScroll);
  ui.slider.addEventListener("input", (event) => applyZoom(event.target.value));
  ui.zoomIn.addEventListener("click", () => applyZoom(zoom.level * 1.25));
  ui.zoomOut.addEventListener("click", () => applyZoom(zoom.level / 1.25));
  ui.fit.addEventListener("click", fitTimeline);
  window.addEventListener("keydown", onKeydown);

  const unsubscribe = store.subscribe((nextState, previousState) => {
    if (nextState.timeline !== previousState.timeline) {
      const previousDuration = duration;
      currentTimeline = nextState.timeline || { duration: 1, tracks: [] };
      renderTimeline(previousDuration !== getProjectDuration(currentTimeline));
    }

    if (nextState.playhead !== previousState.playhead) {
      playhead.setTime(nextState.playhead || 0, zoom);
    }
  });

  syncZoomUI();
  renderTimeline(true);
  ui.rulerScroll.scrollLeft = ui.tracksScroll.scrollLeft;

  const unmount = () => {
    unsubscribe();
    ui.tracksScroll.removeEventListener("scroll", onScroll);
    window.removeEventListener("keydown", onKeydown);
    container.__timelineUnmount = null;
    container.replaceChildren();
  };

  container.__timelineUnmount = unmount;
  return unmount;
}
