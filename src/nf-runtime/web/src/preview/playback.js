// Preview playback controls for playhead updates, clip selection, and inspector synchronization.
function setPlayheadTime(time) {
  currentTime = TOTAL_DURATION > 0
    ? Math.min(Math.max(finiteNumber(time, 0), 0), TOTAL_DURATION)
    : 0;

  const px = TOTAL_DURATION > 0
    ? percentOfTotal(currentTime, TOTAL_DURATION) + "%"
    : "0%";
  const playhead = document.getElementById("tl-playhead");
  if (playhead) {
    playhead.style.left = px;
    playhead.setAttribute("data-nf-time", formatNfTimeValue(currentTime));
  }

  setNfTime("tc-current", currentTime, formatPreciseTime(currentTime));
  setNfTime("tc-fs-current", currentTime, formatPreciseTime(currentTime));

  const fill = document.getElementById("progress-fill");
  if (fill) {
    fill.style.width = (TOTAL_DURATION > 0 ? (currentTime / TOTAL_DURATION) * 100 : 0) + "%";
  }

  if (previewEngine && typeof previewEngine.renderFrame === "function") {
    try {
      previewEngine.renderFrame(currentTime);
      ensurePreviewInteractivity();
    } catch (error) {
      console.warn("[preview] renderFrame error", error);
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
  setNfTime("insp-start", start, formatPreciseTime(start));
  setNfTime("insp-duration", duration, duration.toFixed(3) + "s");
  setReadout("insp-params", paramsText);
  setText("canvas-title", prettifyLabel(scene || name || type || "Clip").toUpperCase());
  setText("canvas-sub", "scene:" + slugify(scene || name || type || "clip") + " · " + formatPreciseTime(start));
  setText("badge-type", (kind || type || "clip").toUpperCase());
  setText("badge-id", id || "--");

  setPlayheadTime(start);
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
  setNfTime("insp-start", 0, "00:00.000");
  setNfTime("insp-duration", 0, "0.000s");
  setReadout("insp-params", "Select a clip to inspect its params.");
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
