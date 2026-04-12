(function(){
// Bridge IPC client (inline for WKWebView file:// compatibility)
const _ipcPending = new Map();
let _ipcNextId = 0;
window.__ipc = window.__ipc || {};
window.__ipc.resolve = function(response) {
  const payload = typeof response === "string" ? JSON.parse(response) : response || {};
  const entry = _ipcPending.get(payload.id);
  if (!entry) return;
  _ipcPending.delete(payload.id);
  if (payload.ok) entry.resolve(payload.result);
  else entry.reject(new Error(payload.error || "IPC failed"));
};
function bridgeCall(method, params) {
  if (typeof window.ipc?.postMessage !== "function") {
    return Promise.reject(new Error("IPC unavailable"));
  }
  const id = "ipc-" + Date.now() + "-" + (++_ipcNextId);
  return new Promise((resolve, reject) => {
    _ipcPending.set(id, { resolve, reject });
    try { window.ipc.postMessage(JSON.stringify({ id, method, params })); }
    catch (e) { _ipcPending.delete(id); reject(e); }
  });
}

const DESKTOP_CONNECT_MESSAGE = "Connect via desktop app to load projects";
const PX_PER_SEC = 61.33;
const ACCENT_NAMES = ["accent", "warm", "blue"];
const GLOW_NAMES = ["glow-accent", "glow-warm", "glow-blue"];

let TOTAL_DURATION = 26;
let isPlaying = false;
let currentTime = 2.4;
let playRAF = null;
let lastTS = null;

let playerPlaying = false;
let playerAnim = null;
let playerStart = 0;
let playerDur = 26;

let overlay = null;

let currentProject = null;
let currentEpisode = null;
let currentSegment = null;
let currentTimeline = null;

let projectsCache = [];
let episodesCache = [];
let segmentsCache = [];

let homeLoadSeq = 0;
let projectLoadSeq = 0;
let editorLoadSeq = 0;

/* === util.js === */
function finiteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function jsLiteral(value) {
  return JSON.stringify(String(value ?? ""));
}

function pluralize(count, singular, plural) {
  return count + " " + (count === 1 ? singular : plural);
}

function prettifyLabel(value) {
  const normalized = String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Clip";
  }
  return normalized
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function formatTC(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  return String(minutes).padStart(2, "0") + ":" + String(wholeSeconds).padStart(2, "0");
}

function formatPreciseTime(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  const wholeSeconds = Math.floor(remainder);
  const millis = Math.round((remainder - wholeSeconds) * 1000);
  const carry = millis === 1000 ? 1 : 0;
  const safeMillis = millis === 1000 ? 0 : millis;
  const displaySeconds = wholeSeconds + carry;
  const nextMinutes = minutes + Math.floor(displaySeconds / 60);
  const normalizedSeconds = displaySeconds % 60;
  return (
    String(nextMinutes).padStart(2, "0") +
    ":" +
    String(normalizedSeconds).padStart(2, "0") +
    "." +
    String(safeMillis).padStart(3, "0")
  );
}

function formatCompactDuration(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  if (safeSeconds <= 0) {
    return "0s";
  }
  if (safeSeconds >= 60) {
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds - minutes * 60;
    if (remainder < 0.05) {
      return minutes + "m";
    }
    const wholeRemainder = Math.round(remainder * 10) / 10;
    return minutes + "m " + String(wholeRemainder).replace(/\.0$/, "") + "s";
  }
  const rounded = Math.round(safeSeconds * 10) / 10;
  return String(rounded).replace(/\.0$/, "") + "s";
}

function formatRelativeUpdated(raw) {
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return raw ? String(raw) : "updated recently";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60000) {
    return "edited just now";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return "edited " + minutes + "m ago";
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return "edited " + hours + "h ago";
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return "edited " + days + "d ago";
  }

  return "updated " + new Date(timestamp).toLocaleDateString();
}

function readProjectPath(projectName) {
  return projectsCache.find((entry) => entry?.name === projectName)?.path || "Bridge IPC project";
}

function findEpisodeEntry(episodeName) {
  return episodesCache.find((entry) => entry?.name === episodeName) || null;
}

function getProjectDisplayName() {
  return currentProject || "Projects";
}

function getEpisodeDisplayName() {
  return currentEpisode || "Episode";
}

function getSegmentDisplayName() {
  return currentSegment || "Segment";
}

function getBridgeMessage(error) {
  return error?.message === "IPC unavailable"
    ? DESKTOP_CONNECT_MESSAGE
    : (error?.message || DESKTOP_CONNECT_MESSAGE);
}

function deriveTimelineDuration(timeline) {
  const direct = finiteNumber(timeline?.duration, NaN);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const meta = finiteNumber(timeline?.meta?.duration, NaN);
  if (Number.isFinite(meta) && meta > 0) {
    return meta;
  }
  return 0;
}

function deriveTrackLabel(track, index) {
  if (track?.label) return String(track.label);
  if (track?.name) return String(track.name);
  const prefix = String(track?.kind || "").toLowerCase() === "audio" ? "A" : "V";
  return prefix + String(index + 1);
}

function deriveClipLabel(clip, clipIndex) {
  return clip?.name || clip?.label || prettifyLabel(clip?.scene || clip?.type || clip?.id || ("Clip " + (clipIndex + 1)));
}

function deriveClipType(clip, track) {
  return prettifyLabel(clip?.type || clip?.scene || track?.kind || "clip").toUpperCase();
}

function deriveClipClass(clip, track) {
  const raw = String(clip?.type || clip?.scene || track?.kind || "").toLowerCase();
  if (raw.includes("canvas")) return "type-canvas";
  if (raw.includes("html") || raw.includes("audio")) return "type-html";
  if (raw.includes("svg")) return "type-svg";
  if (raw.includes("md") || raw.includes("markdown")) return "type-md";
  if (raw.includes("multi") || raw.includes("composite")) return "type-multi";
  return "type-video";
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function restartStaggerAnimations(target) {
  target.querySelectorAll(".stagger-in").forEach((element) => {
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  });
}

/* === custom-select.js === */
function toggleCustomSelect(element) {
  document.querySelectorAll(".custom-select.open").forEach((select) => {
    if (select !== element) {
      select.classList.remove("open");
    }
  });
  element.classList.toggle("open");
}

function pickOpt(option) {
  const select = option.closest(".custom-select");
  select.querySelector(".cs-value").textContent = option.textContent;
  select
    .querySelectorAll(".cs-opt")
    .forEach((item) => item.classList.remove("active"));
  option.classList.add("active");
  select.classList.remove("open");
}

function initCustomSelect() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".custom-select")) {
      document
        .querySelectorAll(".custom-select.open")
        .forEach((select) => select.classList.remove("open"));
    }
  });
}

/* === settings-panel.js === */
function toggleSettings() {
  document.getElementById("exports-overlay").classList.remove("show");
  document.getElementById("exports-panel").classList.remove("show");
  document.getElementById("settings-overlay").classList.toggle("show");
  document.getElementById("settings-panel").classList.toggle("show");
}

/* === breadcrumbs.js === */
function getOverlay() {
  overlay ??= document.getElementById("overlay");
  return overlay;
}

function showOverlay() {
  getOverlay()?.classList.add("show");
}

function closeAllDropdowns() {
  document
    .querySelectorAll(".cmd-dropdown, .bc-dropdown")
    .forEach((dropdown) => dropdown.classList.remove("show"));
  getOverlay()?.classList.remove("show");
}

function toggleBcDrop(id, event) {
  event.stopPropagation();
  closeAllDropdowns();
  const dropdown = document.getElementById(id);
  dropdown.classList.toggle("show");
  if (dropdown.classList.contains("show")) {
    showOverlay();
  }
}

function initBreadcrumbs() {
  getOverlay()?.addEventListener("click", closeAllDropdowns);
}

function renderProjectDropdown() {
  setText("bc-show-label", getProjectDisplayName());
  const dropdown = document.getElementById("bc-drop-show");
  if (!dropdown) {
    return;
  }

  const entries = projectsCache.length
    ? projectsCache
    : (currentProject ? [{ name: currentProject }] : []);

  const items = entries.map((project) => {
    const active = project?.name === currentProject;
    const click = active ? "" : ` onclick="event.stopPropagation(); goProject(${jsLiteral(project?.name || "")})"`;
    return (
      `<div class="bc-dropdown-item"${click}>` +
      `<span class="${active ? "dot-active" : "dot-inactive"}"></span>` +
      `${escapeHtml(project?.name || "Untitled")}` +
      `</div>`
    );
  }).join("");

  dropdown.innerHTML = items + (items ? `<div class="bc-dropdown-sep"></div>` : "") + `<div class="bc-dropdown-new">+ New Project</div>`;
}

function renderEpisodeDropdown() {
  setText("bc-ep-label", getEpisodeDisplayName());
  const dropdown = document.getElementById("bc-drop-ep");
  if (!dropdown) {
    return;
  }

  const entries = episodesCache.length
    ? episodesCache
    : (currentEpisode ? [{ name: currentEpisode, firstSegment: currentSegment }] : []);

  const items = entries.map((episode) => {
    const active = episode?.name === currentEpisode;
    const hasTarget = Boolean(episode?.firstSegment || currentSegment);
    const click = !active && currentProject && hasTarget
      ? ` onclick="event.stopPropagation(); goEditor(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")}, ${jsLiteral(episode?.firstSegment || currentSegment || "")})"`
      : "";
    return (
      `<div class="bc-dropdown-item"${click}>` +
      `<span class="${active ? "dot-active" : "dot-inactive"}"></span>` +
      `${escapeHtml(episode?.name || "Episode")}` +
      `</div>`
    );
  }).join("");

  dropdown.innerHTML = items + (items ? `<div class="bc-dropdown-sep"></div>` : "") + `<div class="bc-dropdown-new">+ New Episode</div>`;
}

function renderSegmentDropdown() {
  setText("bc-scene-label", getSegmentDisplayName());
  const dropdown = document.getElementById("bc-drop-scene");
  if (!dropdown) {
    return;
  }

  const entries = segmentsCache.length
    ? segmentsCache
    : (currentSegment ? [{ name: currentSegment }] : []);

  dropdown.innerHTML = entries.map((segment) => {
    const active = segment?.name === currentSegment;
    const click = !active && currentProject && currentEpisode
      ? ` onclick="event.stopPropagation(); goEditor(${jsLiteral(currentProject)}, ${jsLiteral(currentEpisode)}, ${jsLiteral(segment?.name || "")})"`
      : "";
    return (
      `<div class="bc-dropdown-item"${click}>` +
      `<span class="${active ? "dot-active" : "dot-inactive"}"></span>` +
      `${escapeHtml(segment?.name || "Segment")}` +
      `</div>`
    );
  }).join("");
}

/* === exports-panel.js === */
function animatePlayer() {
  if (!playerPlaying) {
    return;
  }

  const elapsed = (performance.now() - playerStart) / 1000;
  const pct = Math.min(100, (elapsed / playerDur) * 100);
  document.getElementById("player-progress-fill").style.width = pct + "%";
  document.getElementById("player-tc").textContent =
    formatTC(elapsed) + " / " + formatTC(playerDur);

  if (pct >= 100) {
    playerPlaying = false;
    document.getElementById("player-big-play").classList.remove("playing");
    document.getElementById("player-play-btn").innerHTML = "&#9654;";
    return;
  }

  playerAnim = requestAnimationFrame(animatePlayer);
}

function toggleExports() {
  document.getElementById("settings-overlay").classList.remove("show");
  document.getElementById("settings-panel").classList.remove("show");
  document.getElementById("exports-overlay").classList.toggle("show");
  document.getElementById("exports-panel").classList.toggle("show");
}

function openPlayer(name, dur, size, detail) {
  document.getElementById("exports-overlay").classList.remove("show");
  document.getElementById("exports-panel").classList.remove("show");
  document.getElementById("player-title").textContent = name;
  document.getElementById("player-detail").textContent = detail;
  playerDur = parseFloat(dur) || 26;
  document.getElementById("player-tc").textContent = "00:00 / " + formatTC(playerDur);
  document.getElementById("player-progress-fill").style.width = "0%";
  document.getElementById("player-big-play").classList.remove("playing");
  playerPlaying = false;
  document.getElementById("player-overlay").classList.add("show");
  document.getElementById("player-modal").classList.add("show");
}

function closePlayer() {
  playerPlaying = false;
  if (playerAnim) {
    cancelAnimationFrame(playerAnim);
  }
  document.getElementById("player-overlay").classList.remove("show");
  document.getElementById("player-modal").classList.remove("show");
}

function togglePlayerPlay() {
  playerPlaying = !playerPlaying;
  const bigPlay = document.getElementById("player-big-play");
  const button = document.getElementById("player-play-btn");
  if (playerPlaying) {
    bigPlay.classList.add("playing");
    button.innerHTML = "&#10074;&#10074;";
    playerStart = performance.now();
    animatePlayer();
  } else {
    bigPlay.classList.remove("playing");
    button.innerHTML = "&#9654;";
    if (playerAnim) {
      cancelAnimationFrame(playerAnim);
    }
  }
}

function seekPlayer(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const pct = (event.clientX - rect.left) / rect.width;
  document.getElementById("player-progress-fill").style.width = pct * 100 + "%";
  playerStart = performance.now() - pct * playerDur * 1000;
}

/* === timeline.js === */
function setPlayButtonIcons() {
  const icon = isPlaying ? "\u23F8" : "\u25B6";
  const primary = document.getElementById("btn-play");
  const fullscreen = document.getElementById("btn-play-fs");
  if (primary) primary.innerHTML = icon;
  if (fullscreen) fullscreen.innerHTML = icon;
}

function setPlaybackState(nextPlaying) {
  isPlaying = Boolean(nextPlaying);
  setPlayButtonIcons();
  if (playRAF) {
    cancelAnimationFrame(playRAF);
    playRAF = null;
  }
  lastTS = null;
  if (isPlaying) {
    playRAF = requestAnimationFrame(playLoop);
  }
}

function setTotalDuration(duration) {
  TOTAL_DURATION = Math.max(0, finiteNumber(duration, 0));
  setText("tc-total", formatPreciseTime(TOTAL_DURATION));
  setText("tc-fs-total", formatPreciseTime(TOTAL_DURATION));
  setPlayheadTime(TOTAL_DURATION > 0 ? Math.min(currentTime, TOTAL_DURATION) : 0);
}

/* === Preview frame rendering === */
let _previewTimer = null;
let _previewSeq = 0;
let _previewRendering = false;

function requestPreviewFrame(t) {
  if (!currentSegment || !currentTimeline) return;
  clearTimeout(_previewTimer);
  // debounce 200ms to avoid flooding during playback
  _previewTimer = setTimeout(function() { renderPreviewFrame(t); }, 200);
}

function renderPreviewFrame(t) {
  if (_previewRendering || !currentSegment) return;
  _previewRendering = true;
  var seq = ++_previewSeq;

  bridgeCall("preview.frame", {
    timelinePath: currentSegment,
    t: Math.round(t * 100) / 100,
    width: 960,
    height: 540,
  }).then(function(result) {
    if (seq !== _previewSeq) return; // stale
    var img = document.getElementById("preview-frame-img");
    var placeholder = document.getElementById("preview-placeholder");
    if (img && result && result.dataUrl) {
      img.src = result.dataUrl;
      img.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
    }
  }).catch(function() {
    // silently fail — keep showing placeholder or last frame
  }).finally(function() {
    _previewRendering = false;
  });
}

function setPlayheadTime(time) {
  currentTime = TOTAL_DURATION > 0
    ? Math.min(Math.max(finiteNumber(time, 0), 0), TOTAL_DURATION)
    : 0;

  const px = currentTime * PX_PER_SEC;
  const playhead = document.getElementById("tl-playhead");
  if (playhead) {
    playhead.style.left = px + "px";
  }

  setText("tc-current", formatPreciseTime(currentTime));
  setText("tc-fs-current", formatPreciseTime(currentTime));

  const fill = document.getElementById("progress-fill");
  if (fill) {
    fill.style.width = (TOTAL_DURATION > 0 ? (currentTime / TOTAL_DURATION) * 100 : 0) + "%";
  }

  // request frame render for preview
  requestPreviewFrame(currentTime);
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

  const { name, type, id } = element.dataset;
  const start = finiteNumber(element.dataset.start, 0);
  const duration = finiteNumber(element.dataset.dur, 0);

  setText("insp-scene-name", name || "Clip");
  setText("insp-clip-id", id || "--");
  setText("canvas-title", type || "CLIP");
  setText("canvas-sub", "scene:" + slugify(name || type || "clip") + " · " + formatPreciseTime(start));
  setText("badge-type", type || "CLIP");
  setText("badge-id", id || "--");
  setValue("insp-duration", duration.toFixed(3) + "s");

  setPlayheadTime(start);

  document
    .querySelectorAll(".scene-chip")
    .forEach((chip) => chip.classList.remove("active"));
  const chipText = String(type || "").toLowerCase();
  document.querySelectorAll(".scene-chip").forEach((chip) => {
    if (chip.textContent.toLowerCase() === chipText) {
      chip.classList.add("active");
    }
  });
}

function resetSelection(message) {
  document
    .querySelectorAll(".tl-clip")
    .forEach((clip) => clip.classList.remove("selected"));
  document
    .querySelectorAll(".scene-chip")
    .forEach((chip) => chip.classList.remove("active"));

  setText("insp-scene-name", message || "No clip selected");
  setText("insp-clip-id", "--");
  setText("canvas-title", "TIMELINE");
  setText("canvas-sub", currentSegment ? "segment:" + slugify(currentSegment) : "scene:none");
  setText("badge-type", "TIMELINE");
  setText("badge-id", "--");
  setValue("insp-duration", "0.000s");
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
      `<div class="tl-ruler-tick${major ? " major" : ""}" style="left:${second * PX_PER_SEC}px">` +
      `<div class="tick-line"></div>` +
      (major ? `<span class="tick-label">${second}s</span>` : "") +
      `</div>`
    );
  }

  if (safeDuration > wholeSeconds + 0.001) {
    const endLabel = String(Math.round(safeDuration * 10) / 10).replace(/\.0$/, "") + "s";
    ticks.push(
      `<div class="tl-ruler-tick major" style="left:${safeDuration * PX_PER_SEC}px">` +
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

function renderClipHtml(clip, track, trackIndex, clipIndex) {
  const start = Math.max(0, finiteNumber(clip?.start, 0));
  const duration = Math.max(0, finiteNumber(clip?.dur ?? clip?.duration, 0));
  const label = deriveClipLabel(clip, clipIndex);
  const type = deriveClipType(clip, track);
  const id = String(clip?.id || ("clip-" + (trackIndex + 1) + "-" + (clipIndex + 1)));
  const left = start * PX_PER_SEC;
  const width = Math.max(duration * PX_PER_SEC, 12);
  return (
    `<div class="tl-clip ${deriveClipClass(clip, track)}" id="${escapeAttr(id)}"` +
    ` data-name="${escapeAttr(label)}"` +
    ` data-type="${escapeAttr(type)}"` +
    ` data-id="${escapeAttr(id)}"` +
    ` data-start="${escapeAttr(String(start))}"` +
    ` data-dur="${escapeAttr(String(duration))}"` +
    ` style="left:${left}px;width:${width}px" onclick="selectClip(this)">` +
    `<span class="tl-clip-label">${escapeHtml(label)}</span>` +
    `</div>`
  );
}

function renderEditorNotice(message) {
  const container = document.getElementById("tl-tracks");
  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="tl-tracks-header">` +
    `<div class="tl-track-label">-</div>` +
    `</div>` +
    `<div class="tl-lanes">` +
    `<div class="tl-lanes-inner" style="width:1000px">` +
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
}

function renderTimeline(timeline) {
  const container = document.getElementById("tl-tracks");
  if (!container) {
    return;
  }

  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const duration = deriveTimelineDuration(timeline);
  const width = Math.max(Math.ceil(duration * PX_PER_SEC) + 80, 1000);

  if (!tracks.length) {
    renderEditorNotice("No tracks in timeline");
    return;
  }

  const labels = tracks.map((track, index) =>
    `<div class="tl-track-label">${escapeHtml(deriveTrackLabel(track, index))}</div>`
  ).join("");

  const lanes = tracks.map((track, trackIndex) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    const clipHtml = clips.length
      ? clips.map((clip, clipIndex) => renderClipHtml(clip, track, trackIndex, clipIndex)).join("")
      : `<div style="padding:12px;color:var(--ink-dim);font-size:11px">No clips</div>`;
    return `<div class="tl-track" id="track-${escapeAttr(String(track?.id || ("track-" + (trackIndex + 1))))}">${clipHtml}</div>`;
  }).join("");

  container.innerHTML =
    `<div class="tl-tracks-header">${labels}</div>` +
    `<div class="tl-lanes">` +
    `<div class="tl-lanes-inner" style="width:${width}px">` +
    `<div class="tl-ruler">${renderTimelineRuler(duration)}</div>` +
    lanes +
    `<div class="tl-playhead" id="tl-playhead"><div class="tl-playhead-handle"></div></div>` +
    `</div>` +
    `</div>`;

  setPlaybackState(false);
  setTotalDuration(duration);

  const firstClip = container.querySelector(".tl-clip");
  if (firstClip) {
    selectClip(firstClip);
  } else {
    resetSelection("No clips");
  }
}

function initTimeline() {
  setPlayButtonIcons();
  setText("tc-total", formatPreciseTime(TOTAL_DURATION));
  setText("tc-fs-total", formatPreciseTime(TOTAL_DURATION));
  renderEditorNotice("Select a segment");
}

/* === canvas-drag.js === */
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragElStartX = 0;
let dragElStartY = 0;

function startDrag(event) {
  if (event.target.classList.contains("sel-handle")) {
    return;
  }

  const element = document.getElementById("canvas-el");
  dragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragElStartX = element.offsetLeft;
  dragElStartY = element.offsetTop;
  event.preventDefault();
}

function initCanvasDrag() {
  document.addEventListener("mousemove", (event) => {
    if (!dragging) {
      return;
    }

    const element = document.getElementById("canvas-el");
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    element.style.left = dragElStartX + dx + "px";
    element.style.top = dragElStartY + dy + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

/* === fullscreen.js === */
function toggleFullscreen() {
  document.getElementById("view-editor").classList.toggle("fullscreen");
}

/* === home.js === */
function renderHomeState(projects, message) {
  const grid = document.getElementById("project-grid");
  const list = document.getElementById("project-list");
  if (!grid || !list) {
    return;
  }

  if (message) {
    const html = `<div class="project-card stagger-in" style="cursor:default"><div class="card-info"><div class="card-title">${escapeHtml(message)}</div></div></div>`;
    const listHtml = `<div class="project-list-item stagger-in"><span class="list-dot accent"></span><span class="list-title">${escapeHtml(message)}</span></div>`;
    grid.innerHTML = html;
    list.innerHTML = listHtml;
    return;
  }

  if (!projects.length) {
    const empty = "No projects yet";
    grid.innerHTML = `<div class="project-card stagger-in" style="cursor:default"><div class="card-info"><div class="card-title">${empty}</div></div></div>`;
    list.innerHTML = `<div class="project-list-item stagger-in"><span class="list-dot accent"></span><span class="list-title">${empty}</span></div>`;
    return;
  }

  grid.innerHTML = projects.map((project, index) => {
    const accent = GLOW_NAMES[index % GLOW_NAMES.length];
    const updated = formatRelativeUpdated(project?.updated);
    return (
      `<div class="project-card stagger-in" onclick='goProject(${jsLiteral(project?.name || "")})'>` +
      `<div class="card-thumb"><div class="card-thumb-inner ${accent}"><span class="card-thumb-label">${escapeHtml(project?.name || "Project")}</span></div></div>` +
      `<div class="card-info">` +
      `<div class="card-title">${escapeHtml(project?.name || "Untitled")}</div>` +
      `<div class="card-meta"><span>${escapeHtml(pluralize(finiteNumber(project?.episodes, 0), "episode", "episodes"))}</span><span>${escapeHtml(updated)}</span></div>` +
      `</div>` +
      `</div>`
    );
  }).join("");

  list.innerHTML = projects.map((project, index) => {
    const accent = ACCENT_NAMES[index % ACCENT_NAMES.length];
    const meta = pluralize(finiteNumber(project?.episodes, 0), "episode", "episodes") + " · " + formatRelativeUpdated(project?.updated);
    return (
      `<div class="project-list-item stagger-in" onclick='goProject(${jsLiteral(project?.name || "")})'>` +
      `<span class="list-dot ${accent}"></span>` +
      `<span class="list-title">${escapeHtml(project?.name || "Untitled")}</span>` +
      `<span class="list-meta">${escapeHtml(meta)}</span>` +
      `</div>`
    );
  }).join("");
}

async function initHome() {
  const requestId = ++homeLoadSeq;
  renderHomeState([], "Loading projects...");

  try {
    const result = await bridgeCall("project.list", {});
    if (requestId !== homeLoadSeq) {
      return;
    }
    projectsCache = Array.isArray(result?.projects) ? result.projects : [];
    renderHomeState(projectsCache);
    renderProjectDropdown();
  } catch (error) {
    if (requestId !== homeLoadSeq) {
      return;
    }
    projectsCache = [];
    renderHomeState([], getBridgeMessage(error));
    renderProjectDropdown();
  }
}

/* === project.js === */
function renderProjectState(projectName, episodes, message) {
  const displayName = projectName || "Projects";
  const projectPath = readProjectPath(projectName);
  const totalDuration = episodes.reduce((sum, episode) => sum + finiteNumber(episode?.totalDuration, 0), 0);

  setText("project-topbar-title", displayName);
  setText("project-page-title", displayName);
  setText("project-page-desc", message || projectPath);
  setText("project-page-stats", message ? "" : `${pluralize(episodes.length, "episode", "episodes")} · ${formatCompactDuration(totalDuration)} total`);

  const list = document.getElementById("episode-list");
  if (!list) {
    return;
  }

  if (message) {
    list.innerHTML =
      `<div class="episode-card stagger-in" style="cursor:default">` +
      `<div class="ep-info">` +
      `<div class="ep-title">${escapeHtml(message)}</div>` +
      `</div>` +
      `</div>`;
    return;
  }

  if (!episodes.length) {
    list.innerHTML =
      `<div class="episode-card stagger-in" style="cursor:default">` +
      `<div class="ep-info">` +
      `<div class="ep-title">No episodes yet</div>` +
      `</div>` +
      `</div>`;
    return;
  }

  list.innerHTML = episodes.map((episode, index) => {
    const glow = GLOW_NAMES[index % GLOW_NAMES.length];
    const badgeIndex = String(index + 1).padStart(2, "0");
    const segmentCount = finiteNumber(episode?.segments, 0);
    const duration = formatCompactDuration(episode?.totalDuration);
    const orderLabel = Number.isFinite(finiteNumber(episode?.order, NaN))
      ? "order " + finiteNumber(episode?.order, 0)
      : "bridge";
    const canOpen = Boolean(currentProject && episode?.firstSegment);
    const click = canOpen
      ? ` onclick='goEditor(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")}, ${jsLiteral(episode?.firstSegment || "")})'`
      : "";

    return (
      `<div class="episode-card stagger-in"${click}${canOpen ? "" : ` style="cursor:default"`}>` +
      `<div class="ep-thumb"><div class="ep-thumb-inner ${glow}"><span class="ep-thumb-label">EP${badgeIndex}</span></div></div>` +
      `<div class="ep-info">` +
      `<span class="ep-badge">EP ${badgeIndex}</span>` +
      `<div class="ep-title">${escapeHtml(episode?.name || "Untitled")}</div>` +
      `<div class="ep-meta"><span>${escapeHtml(pluralize(segmentCount, "segment", "segments") + " · " + duration)}</span><span>${escapeHtml(orderLabel)}</span></div>` +
      `</div>` +
      `</div>`
    );
  }).join("");
}

async function goProject(projectName) {
  if (typeof projectName === "string" && projectName) {
    currentProject = projectName;
  }

  currentEpisode = null;
  currentSegment = null;
  segmentsCache = [];
  currentTimeline = null;

  switchView("view-project");
  renderProjectDropdown();
  renderEpisodeDropdown();
  renderSegmentDropdown();

  if (!currentProject) {
    renderProjectState(null, [], "Select a project");
    return;
  }

  renderProjectState(currentProject, [], "Loading episodes...");

  const requestId = ++projectLoadSeq;
  try {
    const result = await bridgeCall("episode.list", { project: currentProject });
    if (requestId !== projectLoadSeq) {
      return;
    }

    const episodes = Array.isArray(result?.episodes) ? result.episodes : [];
    const enriched = await Promise.all(episodes.map(async (episode) => {
      try {
        const segmentResult = await bridgeCall("segment.list", {
          project: currentProject,
          episode: episode?.name,
        });
        const segmentEntries = Array.isArray(segmentResult?.segments) ? segmentResult.segments : [];
        return {
          ...episode,
          firstSegment: segmentEntries[0]?.name || null,
        };
      } catch {
        return {
          ...episode,
          firstSegment: null,
        };
      }
    }));

    if (requestId !== projectLoadSeq) {
      return;
    }

    episodesCache = enriched;
    renderProjectState(currentProject, episodesCache);
    renderProjectDropdown();
    renderEpisodeDropdown();
  } catch (error) {
    if (requestId !== projectLoadSeq) {
      return;
    }
    episodesCache = [];
    renderProjectState(currentProject, [], getBridgeMessage(error));
    renderProjectDropdown();
    renderEpisodeDropdown();
  }
}

/* === editor.js === */
async function goEditor(project, episode, segment) {
  if (typeof project === "string" && project) {
    currentProject = project;
  }
  if (typeof episode === "string" && episode) {
    currentEpisode = episode;
  }
  if (typeof segment === "string" && segment) {
    currentSegment = segment;
  }

  switchView("view-editor");
  renderProjectDropdown();
  renderEpisodeDropdown();
  renderSegmentDropdown();

  if (!currentProject || !currentEpisode) {
    renderEditorNotice("Select an episode");
    return;
  }

  renderEditorNotice(currentSegment ? ("Loading " + currentSegment + "...") : "Loading timeline...");

  const requestId = ++editorLoadSeq;
  try {
    const segmentResult = await bridgeCall("segment.list", {
      project: currentProject,
      episode: currentEpisode,
    });
    if (requestId !== editorLoadSeq) {
      return;
    }

    segmentsCache = Array.isArray(segmentResult?.segments) ? segmentResult.segments : [];
    const selectedSegment = segmentsCache.find((entry) => entry?.name === currentSegment) || segmentsCache[0] || null;
    currentSegment = selectedSegment?.name || null;

    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();

    if (!selectedSegment?.path) {
      renderEditorNotice("No segments yet");
      return;
    }

    const timeline = await bridgeCall("timeline.load", { path: selectedSegment.path });
    if (requestId !== editorLoadSeq) {
      return;
    }

    currentTimeline = timeline || {};
    TOTAL_DURATION = finiteNumber(currentTimeline.duration, 10);
    renderTimeline(currentTimeline);
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    // start watching for CLI changes + render first frame
    startWatching(selectedSegment.path);
    setPlayheadTime(0);
  } catch (error) {
    if (requestId !== editorLoadSeq) {
      return;
    }
    segmentsCache = [];
    currentSegment = null;
    currentTimeline = null;
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    renderEditorNotice(getBridgeMessage(error));
  }
}

/* === app.js === */
function switchView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  target.classList.add("active");
  target.classList.add("view-transition-enter");
  restartStaggerAnimations(target);
  setTimeout(() => target.classList.remove("view-transition-enter"), 500);
  closeAllDropdowns();
  if (id === "view-home") {
    void initHome();
  }
}

function goHome() {
  switchView("view-home");
}

function handleKeydown(event) {
  if (event.code === "Space" && !event.target.matches("input,textarea")) {
    event.preventDefault();
    togglePlay();
  }

  if (event.key === "Escape") {
    closeAllDropdowns();
    const editorView = document.getElementById("view-editor");
    if (editorView.classList.contains("fullscreen")) {
      toggleFullscreen();
    }
  }
}

/* === File watcher (polling) === */
var _watchPath = null;
var _watchMtime = 0;
var _watchInterval = null;

function startWatching(path) {
  stopWatching();
  _watchPath = path;
  _watchMtime = 0;
  // get initial mtime
  bridgeCall("fs.mtime", { path: path }).then(function(r) {
    _watchMtime = (r && r.mtime) || 0;
  }).catch(function() {});
  // poll every 2 seconds
  _watchInterval = setInterval(function() {
    if (!_watchPath) return;
    bridgeCall("fs.mtime", { path: _watchPath }).then(function(r) {
      var newMtime = (r && r.mtime) || 0;
      if (newMtime > 0 && _watchMtime > 0 && newMtime !== _watchMtime) {
        _watchMtime = newMtime;
        // file changed — reload timeline
        reloadCurrentTimeline();
      } else if (_watchMtime === 0) {
        _watchMtime = newMtime;
      }
    }).catch(function() {});
  }, 2000);
}

function stopWatching() {
  if (_watchInterval) clearInterval(_watchInterval);
  _watchInterval = null;
  _watchPath = null;
}

function reloadCurrentTimeline() {
  if (!currentSegment) return;
  bridgeCall("timeline.load", { path: currentSegment }).then(function(result) {
    if (!result) return;
    currentTimeline = result;
    TOTAL_DURATION = finiteNumber(result.duration, 10);
    renderTimeline(result);
    // re-render current frame
    _previewSeq++;
    renderPreviewFrame(currentTime);
  }).catch(function() {});
}

function initApp() {
  initBreadcrumbs();
  initCustomSelect();
  initCanvasDrag();
  initTimeline();
  renderProjectDropdown();
  renderEpisodeDropdown();
  renderSegmentDropdown();
  document.addEventListener("keydown", handleKeydown);
  void initHome();
}

Object.assign(window, {
  closePlayer,
  goEditor,
  goHome,
  goProject,
  openPlayer,
  pickOpt,
  seekPlayer,
  selectClip,
  showOverlay,
  startDrag,
  switchView,
  syncSlider,
  toggleBcDrop,
  toggleCustomSelect,
  toggleExports,
  toggleFullscreen,
  togglePlay,
  togglePlayerPlay,
  toggleSettings,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}
})();
