// Timeline rendering helpers for rulers, tracks, clips, scrubbing, and empty editor states.
function renderTimelineRuler(duration) {
  const safeDuration = Math.max(0, finiteNumber(duration, 0));
  const wholeSeconds = Math.floor(safeDuration);
  const ticks = [];

  for (let second = 0; second <= wholeSeconds; second += 1) {
    const major = second === 0 || second % 3 === 0;
    ticks.push(
      `<div class="tl-ruler-tick${major ? " major" : ""}" style="left:${percentOfTotal(second, safeDuration)}%">` +
      `<div class="tick-line"></div>` +
      (major ? `<span class="tick-label" data-nf-time="${escapeAttr(formatNfTimeValue(second))}">${second}s</span>` : "") +
      `</div>`
    );
  }

  if (safeDuration > wholeSeconds + 0.001) {
    const endLabel = String(Math.round(safeDuration * 10) / 10).replace(/\.0$/, "") + "s";
    ticks.push(
      `<div class="tl-ruler-tick major" style="left:100%">` +
      `<div class="tick-line"></div>` +
      `<span class="tick-label" data-nf-time="${escapeAttr(formatNfTimeValue(safeDuration))}">${endLabel}</span>` +
      `</div>`
    );
  }

  if (ticks.length === 0) {
    ticks.push(
      `<div class="tl-ruler-tick major" style="left:0px">` +
      `<div class="tick-line"></div>` +
      `<span class="tick-label" data-nf-time="0">0s</span>` +
      `</div>`
    );
  }

  return ticks.join("");
}

function percentOfTotal(value, total) {
  const safeValue = Math.max(0, finiteNumber(value, 0));
  const safeTotal = Math.max(0, finiteNumber(total, 0));
  return safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;
}

function prepareTimelineContainer(container) {
  if (!container) {
    return;
  }
  container.style.display = "flex";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.minHeight = "0";
}

function renderTrackHeader(track, index) {
  const trackId = deriveTrackDisplayId(track, index);
  return (
    `<div class="tl-track-label" title="${escapeAttr(trackId)}">` +
    `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;width:100%;padding:0 10px">` +
    `<span style="display:flex;gap:6px;color:var(--ink-dim);font-size:12px;line-height:1">` +
    `<span aria-hidden="true">&#128065;</span>` +
    `<span aria-hidden="true">&#128274;</span>` +
    `</span>` +
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(trackId)}</span>` +
    `</div>` +
    `</div>`
  );
}

function renderTrackRow(track, trackIndex, totalDuration) {
  const clips = Array.isArray(track?.clips) ? track.clips : [];
  const trackId = deriveTrackDisplayId(track, trackIndex);
  const clipHtml = clips.length
    ? clips.map((clip, clipIndex) => renderClipHtml(clip, track, trackIndex, clipIndex, totalDuration)).join("")
    : `<div style="padding:12px;color:var(--ink-dim);font-size:11px">No clips</div>`;
  return `<div class="tl-track" id="track-${escapeAttr(trackId)}" data-nf-role="track" data-nf-track="${escapeAttr(String(trackIndex))}">${clipHtml}</div>`;
}

function renderClipHtml(clip, track, trackIndex, clipIndex, totalDuration) {
  const timing = deriveClipTiming(clip);
  const start = timing.start;
  const duration = timing.duration;
  const label = deriveClipLabel(clip, clipIndex);
  const type = deriveClipType(clip, track);
  const scene = String(clip?.scene || clip?.type || label || "clip");
  const kind = deriveClipFamily(clip, track);
  const id = String(clip?.id || ("clip-" + (trackIndex + 1) + "-" + (clipIndex + 1)));
  const domId = "tl-clip-" + slugify((track?.id || "track") + "-" + id + "-" + (clipIndex + 1));
  return (
    `<div class="tl-clip ${deriveClipClass(clip, track)}" id="${escapeAttr(domId)}"` +
    ` data-nf-role="clip"` +
    ` data-nf-clip-id="${escapeAttr(id)}"` +
    ` data-name="${escapeAttr(label)}"` +
    ` data-scene="${escapeAttr(scene)}"` +
    ` data-type="${escapeAttr(type)}"` +
    ` data-kind="${escapeAttr(kind)}"` +
    ` data-id="${escapeAttr(id)}"` +
    ` data-start="${escapeAttr(String(start))}"` +
    ` data-dur="${escapeAttr(String(duration))}"` +
    ` data-params="${escapeAttr(stringifyClipParams(clip?.params))}"` +
    ` title="${escapeAttr(scene + " · " + id)}"` +
    ` style="${escapeAttr(deriveClipInlineStyle(clip, track, totalDuration))}" onclick="selectClip(this)">` +
    `<span class="tl-clip-label">${escapeHtml(scene)}</span>` +
    `</div>`
  );
}

function renderEditorNotice(message) {
  const container = document.getElementById("tl-tracks");
  if (!container) {
    return;
  }
  prepareTimelineContainer(container);
  const noticeDuration = Math.max(0, finiteNumber(TOTAL_DURATION, 0));

  container.innerHTML =
    `<div class="tl-tracks-header" style="width:148px">` +
    `<div class="tl-track-label">-</div>` +
    `</div>` +
    `<div class="tl-lanes">` +
    `<div class="tl-lanes-inner" style="width:${Math.max(100, Math.round(noticeDuration * 80))}px">` +
    `<div class="tl-ruler">` +
    `<div class="tl-ruler-tick major" style="left:0px"><div class="tick-line"></div><span class="tick-label" data-nf-time="0">0s</span></div>` +
    `</div>` +
    `<div class="tl-track"><div style="padding:12px;color:var(--ink-dim);font-size:11px">${escapeHtml(message)}</div></div>` +
    `<div class="tl-playhead" id="tl-playhead" data-nf-role="playhead" data-nf-time="0"><div class="tl-playhead-handle"></div></div>` +
    `</div>` +
    `</div>`;

  setPlaybackState(false);
  setTotalDuration(0);
  resetSelection(message);
  setPreviewPlaceholder("TIMELINE", message || "Load a timeline to preview");
}

function updatePlayheadFromPointer(event, lanes) {
  if (!(TOTAL_DURATION > 0) || !lanes) {
    return;
  }
  const inner = lanes.querySelector(".tl-lanes-inner");
  if (!inner) {
    return;
  }
  const rect = inner.getBoundingClientRect();
  const offset = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const time = rect.width > 0 ? (offset / rect.width) * TOTAL_DURATION : 0;
  setPlayheadTime(time);
  requestPreviewFrame(time);
}

function beginTimelineScrub(event) {
  if (event.button !== 0 || event.target.closest(".tl-clip")) {
    return;
  }
  _timelineScrubTarget = event.currentTarget;
  updatePlayheadFromPointer(event, _timelineScrubTarget);
  event.preventDefault();
}

function moveTimelineScrub(event) {
  if (_timelineScrubTarget) {
    updatePlayheadFromPointer(event, _timelineScrubTarget);
  }
}

function endTimelineScrub() {
  _timelineScrubTarget = null;
}

function renderTimeline(timeline, preferredClipId) {
  const container = document.getElementById("tl-tracks");
  if (!container) {
    return;
  }
  prepareTimelineContainer(container);

  const tracks = getTimelineTracks(timeline);
  const duration = deriveTimelineDuration(timeline);
  TOTAL_DURATION = duration;

  if (!tracks.length) {
    renderEditorNotice("No tracks in timeline");
    return;
  }

  const labels = tracks.map((track, index) => renderTrackHeader(track, index)).join("");
  const trackRows = tracks.map((track, trackIndex) => renderTrackRow(track, trackIndex, duration)).join("");

  container.innerHTML =
    `<div class="tl-tracks-header" style="width:148px">${labels}</div>` +
    `<div class="tl-lanes">` +
    `<div class="tl-lanes-inner" style="width:${Math.max(100, Math.round(duration * 80))}px">` +
    `<div class="tl-ruler">${renderTimelineRuler(duration)}</div>` +
    trackRows +
    `<div class="tl-playhead" id="tl-playhead" data-nf-role="playhead" data-nf-time="${escapeAttr(formatNfTimeValue(currentTime))}"><div class="tl-playhead-handle"></div></div>` +
    `</div>` +
    `</div>`;

  setPlaybackState(false);
  setTotalDuration(duration);

  const laneScroller = container.querySelector(".tl-lanes");
  if (laneScroller) {
    laneScroller.addEventListener("mousedown", beginTimelineScrub);
  }

  const clipElements = Array.from(container.querySelectorAll(".tl-clip"));
  const selectedClip = preferredClipId
    ? clipElements.find((clip) => clip.dataset.id === preferredClipId)
    : null;
  if (selectedClip) {
    selectClip(selectedClip);
  } else if (clipElements[0]) {
    selectClip(clipElements[0]);
  } else {
    resetSelection("No clips");
  }
}

function initTimeline() {
  setPlayButtonIcons();
  setNfTime("tc-total", TOTAL_DURATION, formatPreciseTime(TOTAL_DURATION));
  setNfTime("tc-fs-total", TOTAL_DURATION, formatPreciseTime(TOTAL_DURATION));
  updateInspectorContext();
  setPreviewPlaceholder("TIMELINE", "Load a timeline to preview");
  renderExportsList([], "Open an episode to view exports");
  renderEditorNotice("Select a segment");
}
