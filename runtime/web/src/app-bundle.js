(function(){
// Bridge IPC client (inline for WKWebView file:// compatibility)
const _ipcPending = new Map();
let _ipcNextId = 0;
window.__ipc = window.__ipc || {};
window.__ipc.resolve = function(response) {
  console.log("[bridge] resolve raw:", typeof response === "string" ? response.substring(0, 200) : response);
  const payload = typeof response === "string" ? JSON.parse(response) : response || {};
  const entry = _ipcPending.get(payload.id);
  if (!entry) { console.warn("[bridge] no pending entry for id:", payload.id); return; }
  _ipcPending.delete(payload.id);
  if (payload.ok) { console.log("[bridge] resolved:", payload.id); entry.resolve(payload.result); }
  else { console.error("[bridge] rejected:", payload.error); entry.reject(new Error(payload.error || "IPC failed")); }
};
function bridgeCall(method, params) {
  // wry 0.55 injects window.ipc via webkit.messageHandlers — may also be directly on window.ipc
  var postFn = null;
  if (typeof window.ipc?.postMessage === "function") {
    postFn = function(s) { window.ipc.postMessage(s); };
  } else if (typeof window.webkit?.messageHandlers?.ipc?.postMessage === "function") {
    postFn = function(s) { window.webkit.messageHandlers.ipc.postMessage(s); };
  }
  if (!postFn) {
    console.warn("[bridge] IPC unavailable — no postMessage found");
    return Promise.reject(new Error("IPC unavailable"));
  }
  const id = "ipc-" + Date.now() + "-" + (++_ipcNextId);
  return new Promise((resolve, reject) => {
    _ipcPending.set(id, { resolve, reject });
    try { postFn(JSON.stringify({ id, method, params })); }
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
let currentSegmentPath = null;
let currentTimeline = null;
let currentSelectedClipId = null;
let currentPreviewVideoUrl = null;

let projectsCache = [];
let episodesCache = [];
let segmentsCache = [];
let episodesCacheProject = null;
let exportsCache = [];

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

function buildNfdataUrl(parts) {
  return "nfdata://localhost/" + parts.map((part) => encodeURIComponent(String(part ?? ""))).join("/");
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

function findSegmentEntry(segmentName) {
  return segmentsCache.find((entry) => entry?.name === segmentName) || null;
}

function getCurrentEpisodePath() {
  const episodeEntry = findEpisodeEntry(currentEpisode);
  if (episodeEntry?.path) {
    return episodeEntry.path;
  }
  if (currentSegmentPath) {
    const normalized = String(currentSegmentPath);
    const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return slashIndex >= 0 ? normalized.slice(0, slashIndex) : null;
  }
  return null;
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
  const direct = finiteNumber(timeline?.duration, 0);
  const meta = finiteNumber(timeline?.meta?.duration, 0);
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const derived = tracks.reduce((maxEnd, track) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    return clips.reduce((clipMax, clip) => {
      const start = Math.max(0, finiteNumber(clip?.start, 0));
      const duration = Math.max(0, finiteNumber(clip?.dur ?? clip?.duration, 0));
      return Math.max(clipMax, start + duration);
    }, maxEnd);
  }, 0);
  return Math.max(direct, meta, derived);
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

function setReadout(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
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
    : (currentEpisode ? [{ name: currentEpisode }] : []);

  const items = entries.map((episode) => {
    const active = episode?.name === currentEpisode;
    const click = !active && currentProject
      ? ` onclick="event.stopPropagation(); goEditor(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")}, null)"`
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

  if (!entries.length) {
    dropdown.innerHTML =
      `<div class="bc-dropdown-item">` +
      `<span class="dot-inactive"></span>` +
      `No segments` +
      `</div>`;
    return;
  }

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
function getPlayerVideo() {
  const container = document.getElementById("player-canvas-inner");
  if (!container) {
    return null;
  }

  let video = document.getElementById("player-video");
  if (video) {
    return video;
  }

  video = document.createElement("video");
  video.id = "player-video";
  video.playsInline = true;
  video.preload = "metadata";
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.style.background = "#000";
  container.insertBefore(video, container.firstChild);
  return video;
}

function animatePlayer() {
  const video = getPlayerVideo();
  if (!video) {
    return;
  }

  const duration = finiteNumber(video.duration, playerDur);
  const current = finiteNumber(video.currentTime, 0);
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  document.getElementById("player-progress-fill").style.width = pct + "%";
  document.getElementById("player-tc").textContent =
    formatTC(current) + " / " + formatTC(duration);

  if (video.paused || video.ended) {
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

function renderExportsList(entries, emptyMessage) {
  const container = document.getElementById("exports-list");
  if (!container) {
    return;
  }

  const safeEntries = Array.isArray(entries) ? entries : [];
  exportsCache = safeEntries;

  if (!safeEntries.length) {
    container.innerHTML =
      `<div class="export-item" style="cursor:default">` +
      `<div class="export-thumb"><span class="export-play-icon">&#9675;</span></div>` +
      `<div class="export-info">` +
      `<div class="export-name">${escapeHtml(emptyMessage || "No exports yet")}</div>` +
      `<div class="export-meta">Rendered MP4 files for this episode will appear here.</div>` +
      `</div>` +
      `</div>`;
    return;
  }

  container.innerHTML = safeEntries.map((entry) => {
    const stem = String(entry?.name || "").replace(/\.mp4$/i, "");
    const segment = findSegmentEntry(stem);
    const duration = finiteNumber(segment?.duration, 0);
    const durationMeta = duration > 0
      ? formatCompactDuration(duration) + " · segment " + prettifyLabel(stem)
      : "MP4 export · segment " + prettifyLabel(stem);
    const detail = duration > 0
      ? "Timeline duration " + formatPreciseTime(duration)
      : "Timeline duration unavailable";
    const url = buildNfdataUrl([currentProject, currentEpisode, entry.name]);

    return (
      `<div class="export-item" onclick='openPlayer(${jsLiteral(entry.name)}, ${jsLiteral(url)}, ${jsLiteral(detail)})'>` +
      `<div class="export-thumb"><span class="export-play-icon">&#9654;</span></div>` +
      `<div class="export-info">` +
      `<div class="export-name">${escapeHtml(entry.name || "export.mp4")}</div>` +
      `<div class="export-meta">${escapeHtml(durationMeta)}</div>` +
      `<div class="export-meta">${escapeHtml(detail)}</div>` +
      `</div>` +
      `</div>`
    );
  }).join("");
}

function openPlayer(name, url, detail) {
  const video = getPlayerVideo();
  if (!video) {
    return;
  }

  document.getElementById("exports-overlay").classList.remove("show");
  document.getElementById("exports-panel").classList.remove("show");
  document.getElementById("player-title").textContent = name;
  document.getElementById("player-detail").textContent = detail;
  video.pause();
  video.src = url;
  video.load();
  playerDur = 26;
  document.getElementById("player-tc").textContent = "00:00 / " + formatTC(playerDur);
  document.getElementById("player-progress-fill").style.width = "0%";
  document.getElementById("player-big-play").classList.remove("playing");
  playerPlaying = false;
  document.getElementById("player-overlay").classList.add("show");
  document.getElementById("player-modal").classList.add("show");

  video.onloadedmetadata = function() {
    playerDur = finiteNumber(video.duration, playerDur);
    document.getElementById("player-tc").textContent = "00:00 / " + formatTC(playerDur);
  };
}

function closePlayer() {
  const video = getPlayerVideo();
  playerPlaying = false;
  if (playerAnim) {
    cancelAnimationFrame(playerAnim);
    playerAnim = null;
  }
  if (video) {
    video.pause();
  }
  document.getElementById("player-overlay").classList.remove("show");
  document.getElementById("player-modal").classList.remove("show");
}

function togglePlayerPlay() {
  const video = getPlayerVideo();
  const bigPlay = document.getElementById("player-big-play");
  const button = document.getElementById("player-play-btn");
  if (!video) {
    return;
  }

  if (video.paused) {
    playerPlaying = true;
    bigPlay.classList.add("playing");
    button.innerHTML = "&#10074;&#10074;";
    const playResult = video.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(function() {
        playerPlaying = false;
        bigPlay.classList.remove("playing");
        button.innerHTML = "&#9654;";
      });
    }
    if (playerAnim) {
      cancelAnimationFrame(playerAnim);
    }
    animatePlayer();
  } else {
    playerPlaying = false;
    video.pause();
    bigPlay.classList.remove("playing");
    button.innerHTML = "&#9654;";
    if (playerAnim) {
      cancelAnimationFrame(playerAnim);
      playerAnim = null;
    }
  }
}

function seekPlayer(event) {
  const video = getPlayerVideo();
  if (!video) {
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const pct = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  const duration = finiteNumber(video.duration, playerDur);
  if (duration > 0) {
    video.currentTime = pct * duration;
  }
  document.getElementById("player-progress-fill").style.width = pct * 100 + "%";
  document.getElementById("player-tc").textContent =
    formatTC(duration > 0 ? video.currentTime : 0) + " / " + formatTC(duration);
}

async function refreshExportsPanel(requestId) {
  const episodePath = getCurrentEpisodePath();
  if (!episodePath) {
    renderExportsList([], "Open an episode to view exports");
    return;
  }

  try {
    const result = await bridgeCall("fs.listDir", { path: episodePath });
    if (requestId !== editorLoadSeq) {
      return;
    }

    const entries = Array.isArray(result?.entries) ? result.entries : [];
    const exports = entries
      .filter((entry) => !entry?.isDir && /\.mp4$/i.test(String(entry?.name || "")))
      .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || "")));
    renderExportsList(exports);
  } catch (error) {
    if (requestId !== editorLoadSeq) {
      return;
    }
    renderExportsList([], getBridgeMessage(error));
  }
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

  const previewVideo = document.getElementById("preview-video");
  if (previewVideo && currentPreviewVideoUrl) {
    if (isPlaying) {
      syncPreviewVideoTime(true);
      const playResult = previewVideo.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(function() {
          isPlaying = false;
          setPlayButtonIcons();
        });
      }
    } else {
      previewVideo.pause();
    }
  }

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
let _previewPendingTime = null;

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

function setPreviewPlaceholder(title, subtitle, preserveFrame) {
  const img = document.getElementById("preview-frame-img");
  const video = document.getElementById("preview-video");
  const placeholder = document.getElementById("preview-placeholder");
  if (img && !preserveFrame) {
    img.style.display = "none";
    img.removeAttribute("src");
  }
  if (video) {
    video.pause();
    video.style.display = "none";
    if (!preserveFrame) {
      video.removeAttribute("src");
      video.load();
    }
  }
  if (placeholder) {
    placeholder.style.display = "flex";
  }
  setText("canvas-title", title || "TIMELINE");
  setText("canvas-sub", subtitle || "Load a segment to preview video");
}

function syncPreviewVideoTime(force) {
  const video = document.getElementById("preview-video");
  if (!video || !currentPreviewVideoUrl) {
    return;
  }

  const duration = finiteNumber(video.duration, TOTAL_DURATION);
  const targetTime = duration > 0 ? Math.min(currentTime, duration) : currentTime;
  if (force || Math.abs(finiteNumber(video.currentTime, 0) - targetTime) > 0.08) {
    try {
      video.currentTime = targetTime;
    } catch (error) {
      console.warn("[preview] failed to seek video", error);
    }
  }
}

function setPreviewVideoSource(videoUrl) {
  const video = document.getElementById("preview-video");
  const img = document.getElementById("preview-frame-img");
  const placeholder = document.getElementById("preview-placeholder");
  if (!video) {
    return;
  }

  currentPreviewVideoUrl = videoUrl || null;
  if (img) {
    img.style.display = "none";
    img.removeAttribute("src");
  }
  if (placeholder) {
    placeholder.style.display = "none";
  }

  if (video.getAttribute("src") !== currentPreviewVideoUrl) {
    video.pause();
    if (currentPreviewVideoUrl) {
      video.src = currentPreviewVideoUrl;
    } else {
      video.removeAttribute("src");
    }
    video.load();
  }

  video.style.display = currentPreviewVideoUrl ? "block" : "none";
  syncPreviewVideoTime(true);
}

async function refreshSegmentPreviewVideo(requestId) {
  if (!currentProject || !currentEpisode || !currentSegment) {
    currentPreviewVideoUrl = null;
    setPreviewPlaceholder("TIMELINE", "Select a segment");
    return;
  }

  try {
    const result = await bridgeCall("segment.videoUrl", {
      project: currentProject,
      episode: currentEpisode,
      segment: currentSegment,
    });
    if (requestId !== editorLoadSeq) {
      return;
    }

    if (result?.exists) {
      setPreviewVideoSource(buildNfdataUrl([currentProject, currentEpisode, currentSegment + ".mp4"]));
      return;
    }
  } catch (error) {
    if (requestId !== editorLoadSeq) {
      return;
    }
  }

  currentPreviewVideoUrl = null;
  setPreviewPlaceholder("NO VIDEO YET", "No video yet - run `nextframe render` to export");
}

function updateInspectorContext() {
  setReadout("insp-project", currentProject || "--");
  setReadout("insp-episode", currentEpisode || "--");
  setReadout("insp-segment", currentSegment || "--");
}

function requestPreviewFrame(t) {
  const timelinePath = getCurrentSegmentPath();
  if (!timelinePath || !currentTimeline) return;
  clearTimeout(_previewTimer);
  _previewPendingTime = Math.max(0, finiteNumber(t, 0));
  _previewTimer = setTimeout(function() {
    renderPreviewFrame(_previewPendingTime);
  }, 200);
}

function renderPreviewFrame(t) {
  const timelinePath = getCurrentSegmentPath();
  if (!timelinePath || !currentTimeline) {
    return;
  }
  if (_previewRendering) {
    _previewPendingTime = t;
    return;
  }
  _previewRendering = true;
  _previewPendingTime = null;
  var seq = ++_previewSeq;

  bridgeCall("preview.frame", {
    timelinePath: timelinePath,
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
  }).catch(function(error) {
    if (seq !== _previewSeq) return;
    const hasFrame = Boolean(document.getElementById("preview-frame-img")?.getAttribute("src"));
    setPreviewPlaceholder("PREVIEW", getBridgeMessage(error), hasFrame);
  }).finally(function() {
    _previewRendering = false;
    if (_previewPendingTime != null) {
      const nextTime = _previewPendingTime;
      _previewPendingTime = null;
      renderPreviewFrame(nextTime);
    }
  });
}

function setPlayheadTime(time) {
  const options = arguments[1] || {};
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

  if (currentPreviewVideoUrl && options.syncVideo !== false) {
    syncPreviewVideoTime(false);
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

  const previewVideo = document.getElementById("preview-video");
  if (previewVideo && currentPreviewVideoUrl) {
    setPlayheadTime(previewVideo.currentTime, { syncVideo: false });
    if (previewVideo.ended) {
      setPlaybackState(false);
      setPlayheadTime(0, { syncVideo: false });
      return;
    }
    if (isPlaying) {
      playRAF = requestAnimationFrame(playLoop);
    }
    return;
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
  setReadout("insp-start", formatPreciseTime(start));
  setReadout("insp-duration", duration.toFixed(3) + "s");
  setReadout("insp-params", paramsText);
  if (currentPreviewVideoUrl) {
    setText("canvas-title", prettifyLabel(scene || name || type || "Clip").toUpperCase());
    setText("canvas-sub", "scene:" + slugify(scene || name || type || "clip") + " · " + formatPreciseTime(start));
  }
  setText("badge-type", (kind || type || "clip").toUpperCase());
  setText("badge-id", id || "--");

  setPlayheadTime(start);

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
  if (currentPreviewVideoUrl) {
    setText("canvas-title", "TIMELINE");
    setText("canvas-sub", currentSegment ? "segment:" + slugify(currentSegment) : "Load a segment to preview video");
  }
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

function percentOfTotal(value, total) {
  const safeValue = Math.max(0, finiteNumber(value, 0));
  const safeTotal = Math.max(0, finiteNumber(total, 0));
  return safeTotal > 0 ? (safeValue / safeTotal) * 100 : 0;
}

function renderClipHtml(clip, track, trackIndex, clipIndex, totalDuration) {
  const start = Math.max(0, finiteNumber(clip?.start, 0));
  const duration = Math.max(0, finiteNumber(clip?.dur ?? clip?.duration, 0));
  const label = deriveClipLabel(clip, clipIndex);
  const type = deriveClipType(clip, track);
  const scene = String(clip?.scene || clip?.type || label || "clip");
  const sceneLabel = prettifyLabel(scene);
  const kind = deriveClipClass(clip, track).replace(/^type-/, "");
  const id = String(clip?.id || ("clip-" + (trackIndex + 1) + "-" + (clipIndex + 1)));
  const left = percentOfTotal(start, totalDuration);
  const width = percentOfTotal(duration, totalDuration);
  return (
    `<div class="tl-clip ${deriveClipClass(clip, track)}" id="${escapeAttr(id)}"` +
    ` data-name="${escapeAttr(label)}"` +
    ` data-scene="${escapeAttr(scene)}"` +
    ` data-type="${escapeAttr(type)}"` +
    ` data-kind="${escapeAttr(kind)}"` +
    ` data-id="${escapeAttr(id)}"` +
    ` data-start="${escapeAttr(String(start))}"` +
    ` data-dur="${escapeAttr(String(duration))}"` +
    ` data-params="${escapeAttr(stringifyClipParams(clip?.params))}"` +
    ` title="${escapeAttr(scene + " · " + id)}"` +
    ` style="left:${left}%;width:${width}%;min-width:12px" onclick="selectClip(this)">` +
    `<span class="tl-clip-label">${escapeHtml(sceneLabel)}</span>` +
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
  currentPreviewVideoUrl = null;
  resetSelection(message);
  setPreviewPlaceholder("TIMELINE", message || "Load a segment to preview video");
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
  setPlayheadTime(time);
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

  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const duration = deriveTimelineDuration(timeline);
  TOTAL_DURATION = duration;
  const width = Math.max(Math.ceil(duration * PX_PER_SEC) + 80, 1000);

  if (!tracks.length) {
    renderEditorNotice("No tracks in timeline");
    return;
  }

  const labels = tracks.map((track, index) =>
    `<div class="tl-track-label">${escapeHtml(deriveTrackLabel(track, index))}</div>`
  ).join("");

  const trackRows = tracks.map((track, trackIndex) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    const clipHtml = clips.length
      ? clips.map((clip, clipIndex) => renderClipHtml(clip, track, trackIndex, clipIndex, duration)).join("")
      : `<div style="padding:12px;color:var(--ink-dim);font-size:11px">No clips</div>`;
    return `<div class="tl-track" id="track-${escapeAttr(String(track?.id || ("track-" + (trackIndex + 1))))}">${clipHtml}</div>`;
  }).join("");

  container.innerHTML =
    `<div class="tl-tracks-header">${labels}</div>` +
    `<div class="tl-lanes">` +
    `<div class="tl-lanes-inner" style="width:${width}px">` +
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
  setPreviewPlaceholder("TIMELINE", "Load a segment to preview video");
  renderExportsList([], "Open an episode to view exports");
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
    const canOpen = Boolean(currentProject);
    const click = canOpen
      ? ` onclick='goEditor(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")}, null)'`
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
  if (arguments.length === 0) {
    currentProject = null;
  } else if (typeof projectName === "string") {
    currentProject = projectName || null;
  }

  stopWatching();
  setPlaybackState(false);
  currentEpisode = null;
  currentSegment = null;
  currentSegmentPath = null;
  segmentsCache = [];
  currentTimeline = null;
  currentSelectedClipId = null;

  switchView("view-project");
  updateInspectorContext();
  renderProjectDropdown();
  renderEpisodeDropdown();
  renderSegmentDropdown();

  if (!currentProject) {
    episodesCache = [];
    episodesCacheProject = null;
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

    episodesCache = Array.isArray(result?.episodes) ? result.episodes : [];
    episodesCacheProject = currentProject;
    renderProjectState(currentProject, episodesCache);
    renderProjectDropdown();
    renderEpisodeDropdown();
  } catch (error) {
    if (requestId !== projectLoadSeq) {
      return;
    }
    episodesCache = [];
    episodesCacheProject = null;
    renderProjectState(currentProject, [], getBridgeMessage(error));
    renderProjectDropdown();
    renderEpisodeDropdown();
  }
}

/* === editor.js === */
async function goEditor(project, episode, segment) {
  if (typeof project === "string") {
    currentProject = project || null;
  }
  if (typeof episode === "string") {
    currentEpisode = episode || null;
  }
  if (arguments.length >= 3) {
    currentSegment = (typeof segment === "string" && segment) ? segment : null;
  }

  stopWatching();
  setPlaybackState(false);
  currentSegmentPath = null;
  currentTimeline = null;
  currentSelectedClipId = null;
  currentPreviewVideoUrl = null;
  segmentsCache = [];
  exportsCache = [];

  switchView("view-editor");
  updateInspectorContext();
  renderProjectDropdown();
  renderEpisodeDropdown();
  renderSegmentDropdown();
  renderExportsList([], currentEpisode ? "Loading exports..." : "Open an episode to view exports");

  if (!currentProject || !currentEpisode) {
    renderEditorNotice("Select an episode");
    return;
  }

  renderEditorNotice(currentSegment ? ("Loading " + currentSegment + "...") : "Loading timeline...");

  const requestId = ++editorLoadSeq;
  try {
    if (episodesCacheProject !== currentProject || !findEpisodeEntry(currentEpisode)) {
      const episodeResult = await bridgeCall("episode.list", { project: currentProject });
      if (requestId !== editorLoadSeq) {
        return;
      }
      episodesCache = Array.isArray(episodeResult?.episodes) ? episodeResult.episodes : [];
      episodesCacheProject = currentProject;
      renderProjectDropdown();
      renderEpisodeDropdown();
    }

    const segmentResult = await bridgeCall("segment.list", {
      project: currentProject,
      episode: currentEpisode,
    });
    if (requestId !== editorLoadSeq) {
      return;
    }

    segmentsCache = Array.isArray(segmentResult?.segments) ? segmentResult.segments : [];
    const selectedSegment = findSegmentEntry(currentSegment) || segmentsCache[0] || null;
    currentSegment = selectedSegment?.name || null;
    currentSegmentPath = selectedSegment?.path || null;

    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    void refreshExportsPanel(requestId);

    if (!currentSegmentPath) {
      renderEditorNotice("No segments yet");
      return;
    }

    const timeline = await bridgeCall("timeline.load", { path: currentSegmentPath });
    if (requestId !== editorLoadSeq) {
      return;
    }

    currentTimeline = timeline || {};
    renderTimeline(currentTimeline);
    await refreshSegmentPreviewVideo(requestId);
    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    startWatching(currentSegmentPath);
  } catch (error) {
    if (requestId !== editorLoadSeq) {
      return;
    }
    segmentsCache = [];
    currentSegment = null;
    currentSegmentPath = null;
    currentTimeline = null;
    currentSelectedClipId = null;
    currentPreviewVideoUrl = null;
    exportsCache = [];
    updateInspectorContext();
    renderProjectDropdown();
    renderEpisodeDropdown();
    renderSegmentDropdown();
    renderExportsList([], getBridgeMessage(error));
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
  if (id !== "view-editor") {
    stopWatching();
    setPlaybackState(false);
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
  const timelinePath = getCurrentSegmentPath();
  if (!timelinePath) return;
  const selectedClipId = currentSelectedClipId;
  bridgeCall("timeline.load", { path: timelinePath }).then(function(result) {
    if (!result) return;
    currentTimeline = result;
    renderTimeline(result, selectedClipId);
    syncPreviewVideoTime(true);
  }).catch(function() {});
}

function initPreviewVideo() {
  const video = document.getElementById("preview-video");
  if (!video) {
    return;
  }

  video.preload = "metadata";
  video.addEventListener("loadedmetadata", function() {
    syncPreviewVideoTime(true);
  });
}

function initApp() {
  initBreadcrumbs();
  initCustomSelect();
  initCanvasDrag();
  initTimeline();
  initPreviewVideo();
  document.addEventListener("mousemove", moveTimelineScrub);
  document.addEventListener("mouseup", endTimelineScrub);
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
