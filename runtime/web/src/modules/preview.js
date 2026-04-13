/* === Preview frame rendering === */
function getCurrentSegmentPath() {
  return currentSegmentPath || findSegmentEntry(currentSegment)?.path || null;
}

function stringifyClipParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "No params";
  }
  const keys = Object.keys(params);
  return keys.length ? JSON.stringify(params, null, 2) : "No params";
}

function destroyDOMPreview() {
  if (previewStageHost && previewStageClickHandler) {
    previewStageHost.removeEventListener("click", previewStageClickHandler);
  }
  previewStageClickHandler = null;
  if (previewEngine && typeof previewEngine.destroy === "function") {
    try {
      previewEngine.destroy();
    } catch (error) {
      console.warn("[preview] destroy failed", error);
    }
  }
  previewEngine = null;
  previewTimeline = null;
  if (previewStageHost) {
    previewStageHost = null;
  }
  var wrapper = document.getElementById("preview-scale-wrapper");
  if (wrapper) wrapper.remove();
  window.__onFrame = null;
  window.__previewEngine = null;
}

function setPreviewPlaceholder(title, subtitle) {
  destroyDOMPreview();
  const placeholder = document.getElementById("preview-placeholder");
  if (placeholder) {
    placeholder.style.display = "flex";
  }
  setText("canvas-title", title || "TIMELINE");
  setText("canvas-sub", subtitle || "Load a timeline to preview");
}

function ensurePreviewInteractivity() {
  const stageRoot = document.getElementById("render-stage");
  if (!stageRoot) {
    return;
  }
  stageRoot.style.pointerEvents = "auto";
  stageRoot.querySelectorAll(".nf-layer").forEach(function(layer) {
    layer.style.pointerEvents = "auto";
  });
}

function fitStageToContainer() {
  var wrapper = document.getElementById("preview-scale-wrapper");
  var container = document.getElementById("canvas-inner");
  if (!container || !wrapper || !previewStageHost || !previewTimeline) {
    return;
  }
  var bounds = container.getBoundingClientRect();
  if (!(bounds.width > 0) || !(bounds.height > 0)) {
    return;
  }
  var stageW = previewTimeline.width;
  var stageH = previewTimeline.height;
  var scale = Math.min(bounds.width / stageW, bounds.height / stageH);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  var scaledW = Math.round(stageW * scale);
  var scaledH = Math.round(stageH * scale);
  // Wrapper: clips to scaled dimensions, centered in container
  wrapper.style.width = scaledW + "px";
  wrapper.style.height = scaledH + "px";
  wrapper.style.left = Math.round((bounds.width - scaledW) / 2) + "px";
  wrapper.style.top = Math.round((bounds.height - scaledH) / 2) + "px";
  // Stage: stays at native 1920x1080, CSS-scaled down inside wrapper
  previewStageHost.style.width = stageW + "px";
  previewStageHost.style.height = stageH + "px";
  previewStageHost.style.transformOrigin = "0 0";
  previewStageHost.style.transform = "scale(" + scale + ")";
}

function initDOMPreview(timeline) {
  if (!timeline) {
    destroyDOMPreview();
    return false;
  }

  var ev2 = window.__engineV2;
  if (!ev2 || !ev2.createEngine || !ev2.SCENE_REGISTRY) {
    console.warn("[preview] engine-v2 not loaded yet");
    return false;
  }

  destroyDOMPreview();

  var canvasInner = document.getElementById("canvas-inner");
  if (!canvasInner) return false;

  var placeholder = document.getElementById("preview-placeholder");
  if (placeholder) placeholder.style.display = "none";

  // Hide iframe if present
  var iframe = document.getElementById("preview-iframe");
  if (iframe) iframe.style.display = "none";

  // Create wrapper (clips to scaled size) + stage (stays at 1920x1080)
  var wrapper = document.createElement("div");
  wrapper.id = "preview-scale-wrapper";
  wrapper.style.cssText = "position:absolute;overflow:hidden;";
  previewStageHost = document.createElement("div");
  previewStageHost.id = "preview-stage-host";
  previewStageHost.style.cssText = "position:absolute;left:0;top:0;";
  wrapper.appendChild(previewStageHost);
  canvasInner.appendChild(wrapper);

  var previewWidth = finiteNumber((timeline.project && timeline.project.width) || timeline.width, 1920);
  var previewHeight = finiteNumber((timeline.project && timeline.project.height) || timeline.height, 1080);
  previewTimeline = {
    width: previewWidth > 0 ? previewWidth : 1920,
    height: previewHeight > 0 ? previewHeight : 1080,
  };

  // Direct render: create engine in main document
  try {
    previewEngine = ev2.createEngine(previewStageHost, timeline, ev2.SCENE_REGISTRY);
    // Expose engine for AI/appctl control
    window.__previewEngine = previewEngine;
    previewEngine.renderFrame(Math.max(0, finiteNumber(currentTime, 0)));
    ensurePreviewInteractivity();
    fitStageToContainer();
    console.log("[preview] direct render ready, " + (timeline.layers ? timeline.layers.length : 0) + " layers");
  } catch (err) {
    console.error("[preview] createEngine failed", err);
    setPreviewPlaceholder("PREVIEW", "Engine error: " + (err.message || err));
    return false;
  }

  // Click on stage for element selection
  previewStageClickHandler = function(e) {
    var target = e.target.closest(".nf-layer > *") || e.target.closest(".nf-layer");
    if (target) {
      var layerId = target.dataset?.layerId || target.closest(".nf-layer")?.dataset?.layerId || "";
      var scene = target.dataset?.scene || "";
      updateInspectorFromIframe(layerId, scene, target);
    }
  };
  previewStageHost.addEventListener("click", previewStageClickHandler);

  return true;
}

function updateInspectorFromIframe(layerId, scene, element) {
  setText("insp-scene-name", scene || layerId || "Element");
  setText("insp-clip-id", layerId || "--");
  var paramsEl = document.getElementById("insp-params");
  if (paramsEl) {
    paramsEl.textContent = JSON.stringify({
      tag: element.tagName,
      text: (element.textContent || "").substring(0, 60),
      width: element.offsetWidth,
      height: element.offsetHeight,
    }, null, 2);
  }
}

function updateInspectorContext() {
  setReadout("insp-project", currentProject || "--");
  setReadout("insp-episode", currentEpisode || "--");
  setReadout("insp-segment", currentSegment || "--");
}

function requestPreviewFrame(t) {
  if (!currentTimeline) {
    return;
  }
  if ((!previewEngine || !previewStageHost || !previewTimeline) && !initDOMPreview(currentTimeline)) {
    return;
  }
  try {
    previewEngine.renderFrame(Math.max(0, finiteNumber(t, 0)));
    ensurePreviewInteractivity();
  } catch (error) {
    console.error("[preview] render failed", error);
    setPreviewPlaceholder("PREVIEW", error?.message || "Failed to render DOM preview");
  }
}

window.__onEngineV2Ready = function() {
  console.log("[app] engine-v2 ready, " + Object.keys(window.__engineV2?.SCENE_REGISTRY || {}).length + " scenes");
  if (currentTimeline) {
    initDOMPreview(currentTimeline);
  }
};

function setPlayheadTime(time) {
  const options = arguments[1] || {};
  currentTime = TOTAL_DURATION > 0
    ? Math.min(Math.max(finiteNumber(time, 0), 0), TOTAL_DURATION)
    : 0;

  const px = TOTAL_DURATION > 0
    ? percentOfTotal(currentTime, TOTAL_DURATION) + "%"
    : "0%";
  const playhead = document.getElementById("tl-playhead");
  if (playhead) {
    playhead.style.left = px;
  }

  setText("tc-current", formatPreciseTime(currentTime));
  setText("tc-fs-current", formatPreciseTime(currentTime));

  const fill = document.getElementById("progress-fill");
  if (fill) {
    fill.style.width = (TOTAL_DURATION > 0 ? (currentTime / TOTAL_DURATION) * 100 : 0) + "%";
  }

  // Sync playhead with direct-render engine
  if (previewEngine && typeof previewEngine.renderFrame === "function") {
    try {
      previewEngine.renderFrame(currentTime);
      ensurePreviewInteractivity();
    } catch(e) {
      console.warn("[preview] renderFrame error", e);
    }
  }
}

function playLoop(timestamp) {
  if (!isPlaying) {
    return;
  }

  if (!(TOTAL_DURATION > 0)) {
    setPlaybackState(false);
    return;
  }

  if (!lastTS) {
    lastTS = timestamp;
  }

  const delta = (timestamp - lastTS) / 1000;
  lastTS = timestamp;
  currentTime += delta;

  if (currentTime >= TOTAL_DURATION) {
    currentTime = 0;
  }

  setPlayheadTime(currentTime);
  // previewEngine.renderFrame already called inside setPlayheadTime
  if (isPlaying) {
    playRAF = requestAnimationFrame(playLoop);
  }
}

function selectClip(element) {
  if (!element) {
    return;
  }

  document
    .querySelectorAll(".tl-clip")
    .forEach((clip) => clip.classList.remove("selected"));
  element.classList.add("selected");

  const { id, kind, scene } = element.dataset;
  const name = element.dataset.name || scene || "Clip";
  const type = element.dataset.type || "CLIP";
  const start = finiteNumber(element.dataset.start, 0);
  const duration = finiteNumber(element.dataset.dur, 0);
  const paramsText = element.dataset.params || "No params";
  currentSelectedClipId = id || null;

  setText("insp-scene-name", scene || name || "Clip");
  setText("insp-clip-id", id || "--");
  setReadout("insp-scene-readout", scene || name || "Clip");
  setReadout("insp-clip-readout", id || "--");
  setReadout("insp-start", formatPreciseTime(start));
  setReadout("insp-duration", duration.toFixed(3) + "s");
  setReadout("insp-params", paramsText);
  setText("canvas-title", prettifyLabel(scene || name || type || "Clip").toUpperCase());
  setText("canvas-sub", "scene:" + slugify(scene || name || type || "clip") + " · " + formatPreciseTime(start));
  setText("badge-type", (kind || type || "clip").toUpperCase());
  setText("badge-id", id || "--");

  setPlayheadTime(start, { syncVideo: true });
  requestPreviewFrame(start);

  document
    .querySelectorAll(".scene-chip")
    .forEach((chip) => chip.classList.remove("active"));
  const chipText = String(kind || "").toLowerCase();
  document.querySelectorAll(".scene-chip").forEach((chip) => {
    if (chip.textContent.toLowerCase() === chipText) {
      chip.classList.add("active");
    }
  });
}

function resetSelection(message) {
  currentSelectedClipId = null;
  document
    .querySelectorAll(".tl-clip")
    .forEach((clip) => clip.classList.remove("selected"));
  document
    .querySelectorAll(".scene-chip")
    .forEach((chip) => chip.classList.remove("active"));

  setText("insp-scene-name", message || "No clip selected");
  setText("insp-clip-id", "--");
  setReadout("insp-scene-readout", message || "No clip selected");
  setReadout("insp-clip-readout", "--");
  setReadout("insp-start", "00:00.000");
  setReadout("insp-duration", "0.000s");
  setReadout("insp-params", currentTimeline ? "Select a clip to inspect its params." : "Select a clip to inspect its params.");
  setText("canvas-title", "TIMELINE");
  setText("canvas-sub", currentSegment ? "segment:" + slugify(currentSegment) : "Load a timeline to preview");
  setText("badge-type", "TIMELINE");
  setText("badge-id", currentSegment || "--");
  updateInspectorContext();
  setPlayheadTime(0);
}

function togglePlay() {
  if (!isPlaying && !(TOTAL_DURATION > 0)) {
    setPlaybackState(false);
    return;
  }
  setPlaybackState(!isPlaying);
}

function syncSlider(name) {
  const slider = document.getElementById("slider-" + name);
  const value = document.getElementById("val-" + name);
  const nextValue = parseFloat(slider.value);
  if (name === "opacity") {
    value.textContent = nextValue + "%";
  } else if (name === "scale") {
    value.textContent = (nextValue / 100).toFixed(2);
  } else if (name === "blur") {
    value.textContent = nextValue + "px";
  }
}

function renderTimelineRuler(duration) {
  const safeDuration = Math.max(0, finiteNumber(duration, 0));
  const wholeSeconds = Math.floor(safeDuration);
  const ticks = [];

  for (let second = 0; second <= wholeSeconds; second += 1) {
    const major = second === 0 || second % 3 === 0;
    ticks.push(
      `<div class="tl-ruler-tick${major ? " major" : ""}" style="left:${percentOfTotal(second, safeDuration)}%">` +
      `<div class="tick-line"></div>` +
      (major ? `<span class="tick-label">${second}s</span>` : "") +
      `</div>`
    );
  }

  if (safeDuration > wholeSeconds + 0.001) {
    const endLabel = String(Math.round(safeDuration * 10) / 10).replace(/\.0$/, "") + "s";
    ticks.push(
      `<div class="tl-ruler-tick major" style="left:100%">` +
      `<div class="tick-line"></div>` +
      `<span class="tick-label">${endLabel}</span>` +
      `</div>`
    );
  }

  if (ticks.length === 0) {
    ticks.push(
      `<div class="tl-ruler-tick major" style="left:0px">` +
      `<div class="tick-line"></div>` +
      `<span class="tick-label">0s</span>` +
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
  return `<div class="tl-track" id="track-${escapeAttr(trackId)}">${clipHtml}</div>`;
}

function renderClipHtml(clip, track, trackIndex, clipIndex, totalDuration) {
  const timing = deriveClipTiming(clip);
  const start = timing.start;
  const duration = timing.duration;
  const label = deriveClipLabel(clip, clipIndex);
  const type = deriveClipType(clip, track);
  const scene = String(clip?.scene || clip?.type || label || "clip");
  const sceneLabel = scene;
  const kind = deriveClipFamily(clip, track);
  const id = String(clip?.id || ("clip-" + (trackIndex + 1) + "-" + (clipIndex + 1)));
  const domId = "tl-clip-" + slugify((track?.id || "track") + "-" + id + "-" + (clipIndex + 1));
  return (
    `<div class="tl-clip ${deriveClipClass(clip, track)}" id="${escapeAttr(domId)}"` +
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
    `<span class="tl-clip-label">${escapeHtml(sceneLabel)}</span>` +
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
    `<div class="tl-ruler-tick major" style="left:0px"><div class="tick-line"></div><span class="tick-label">0s</span></div>` +
    `</div>` +
    `<div class="tl-track"><div style="padding:12px;color:var(--ink-dim);font-size:11px">${escapeHtml(message)}</div></div>` +
    `<div class="tl-playhead" id="tl-playhead"><div class="tl-playhead-handle"></div></div>` +
    `</div>` +
    `</div>`;

  setPlaybackState(false);
  setTotalDuration(0);
  resetSelection(message);
  setPreviewPlaceholder("TIMELINE", message || "Load a timeline to preview");
}

let _timelineScrubTarget = null;

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
  setPlayheadTime(time, { syncVideo: true });
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
    `<div class="tl-playhead" id="tl-playhead"><div class="tl-playhead-handle"></div></div>` +
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
  setText("tc-total", formatPreciseTime(TOTAL_DURATION));
  setText("tc-fs-total", formatPreciseTime(TOTAL_DURATION));
  updateInspectorContext();
  setPreviewPlaceholder("TIMELINE", "Load a timeline to preview");
  renderExportsList([], "Open an episode to view exports");
  renderEditorNotice("Select a segment");
}
