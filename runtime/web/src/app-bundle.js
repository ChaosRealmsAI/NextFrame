(function(){
// Bridge IPC client (inline for WKWebView file:// compatibility)
const _ipcPending = new Map();
const _ipcExpired = new Set();
let _ipcNextId = 0;
window.__ipc = window.__ipc || {};
window.__ipc.resolve = function(response) {
  console.log("[bridge] resolve raw:", typeof response === "string" ? response.substring(0, 200) : response);
  const payload = typeof response === "string" ? JSON.parse(response) : response || {};
  const entry = _ipcPending.get(payload.id);
  if (!entry) {
    if (_ipcExpired.has(payload.id)) {
      _ipcExpired.delete(payload.id);
      return;
    }
    console.warn("[bridge] no pending entry for id:", payload.id);
    return;
  }
  _ipcPending.delete(payload.id);
  if (payload.ok) { console.log("[bridge] resolved:", payload.id); entry.resolve(payload.result); }
  else { console.error("[bridge] rejected:", payload.error); entry.reject(new Error(payload.error || "IPC failed")); }
};
function bridgeCall(method, params, timeoutMs) {
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
    const safeTimeoutMs = Math.max(0, finiteNumber(timeoutMs, 0));
    let timeoutId = null;
    const pending = {
      resolve: function(result) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(result);
      },
      reject: function(error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      },
    };
    _ipcPending.set(id, pending);
    if (safeTimeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (!_ipcPending.has(id)) {
          return;
        }
        _ipcPending.delete(id);
        _ipcExpired.add(id);
        reject(new Error(method + " timed out after " + safeTimeoutMs + "ms"));
      }, safeTimeoutMs);
    }
    try { postFn(JSON.stringify({ id, method, params })); }
    catch (e) {
      _ipcPending.delete(id);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(e);
    }
  });
}
window.bridgeCall = bridgeCall;

const DESKTOP_CONNECT_MESSAGE = "Connect via desktop app to load projects";
const NO_PROJECTS_MESSAGE = "No projects — create one with `nextframe project-new <name>`";
const IPC_HOME_TIMEOUT_MS = 1500;
const IPC_LOAD_TIMEOUT_MS = 4000;
const IPC_POLL_TIMEOUT_MS = 1200;
const IPC_COMPOSE_TIMEOUT_MS = 20000;
const HOME_RETRY_DELAY_MS = 500;
const HOME_RETRY_COUNT = 3;
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
let previewEngine = null;
let previewStageHost = null;
let previewTimeline = null;
let previewStageClickHandler = null;
let previewReloadSeq = 0;

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function formatProjectUpdated(raw) {
  const value = formatRelativeUpdated(raw);
  if (value.indexOf("edited ") === 0) {
    return "last updated " + value.slice("edited ".length);
  }
  if (value.indexOf("updated ") === 0) {
    return "last updated " + value.slice("updated ".length);
  }
  return "last updated " + value;
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
  const layers = Array.isArray(timeline?.layers) ? timeline.layers : [];
  const derived = tracks.reduce((maxEnd, track) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    return clips.reduce((clipMax, clip) => {
      const timing = deriveClipTiming(clip);
      const start = timing.start;
      const duration = timing.duration;
      return Math.max(clipMax, start + duration);
    }, maxEnd);
  }, 0);
  const derivedLayers = layers.reduce((maxEnd, layer) => {
    const timing = deriveClipTiming(layer);
    return Math.max(maxEnd, timing.start + timing.duration);
  }, 0);
  return Math.max(direct, meta, derived, derivedLayers);
}

function deriveClipTiming(clip) {
  const start = Math.max(0, finiteNumber(clip?.start, 0));
  const explicitDuration = finiteNumber(clip?.dur ?? clip?.duration, NaN);
  const end = finiteNumber(clip?.end, NaN);
  const duration = Number.isFinite(explicitDuration)
    ? Math.max(0, explicitDuration)
    : Math.max(0, end - start);
  return { start, duration };
}

function getTimelineTracks(timeline) {
  if (Array.isArray(timeline?.tracks) && timeline.tracks.length) {
    return timeline.tracks;
  }
  if (!Array.isArray(timeline?.layers)) {
    return [];
  }
  return timeline.layers.map(function(layer, index) {
    return {
      id: layer?.id || ("layer-" + (index + 1)),
      label: layer?.id || layer?.scene || ("Layer " + (index + 1)),
      kind: "layer",
      clips: [layer],
    };
  });
}

// v0.1 → v0.3 scene ID mapping
var SCENE_ALIASES = {
  kineticHeadline: "headline",
  htmlSlide: "headline",
  svgOverlay: "headline",
  markdownSlide: "headline",
  cornerBadge: "lowerThird",
  orbitRings: "circleRipple",
  lowerThirdVelvet: "lowerThird",
  textOverlay: "headline",
  barChartReveal: "barChart",
  dataPulse: "barChart",
  shapeBurst: "confetti",
  spotlightSweep: "auroraGradient",
  pixelRain: "particleFlow",
  glitchText: "headline",
  countdown: "numberCounter",
  lineChart: "lineChart",
  imageHero: "imageHero",
};

function resolveSceneId(id) {
  if (!id) return id;
  if (window.__engineV2 && window.__engineV2.SCENE_REGISTRY && window.__engineV2.SCENE_REGISTRY[id]) return id;
  return SCENE_ALIASES[id] || id;
}

function buildPreviewTimeline(timeline) {
  const source = timeline && typeof timeline === "object" ? timeline : {};
  const project = source.project && typeof source.project === "object" ? source.project : {};
  const width = Math.max(1, finiteNumber(source.width ?? project.width, 1920));
  const height = Math.max(1, finiteNumber(source.height ?? project.height, 1080));
  const fps = Math.max(1, finiteNumber(source.fps ?? project.fps, 30));
  const duration = Math.max(0, deriveTimelineDuration(source));

  if (Array.isArray(source.layers) && source.layers.length) {
    return {
      width: width,
      height: height,
      fps: fps,
      duration: duration,
      background: source.background || "#05050c",
      layers: source.layers.map(function(layer, index) {
        const timing = deriveClipTiming(layer);
        return Object.assign({}, layer, {
          id: layer?.id || ("layer-" + (index + 1)),
          start: timing.start,
          dur: timing.duration,
        });
      }),
    };
  }

  const layers = [];
  getTimelineTracks(source).forEach(function(track, trackIndex) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    clips.forEach(function(clip, clipIndex) {
      const timing = deriveClipTiming(clip);
      layers.push(Object.assign({}, clip, {
        id: clip?.id || ((track?.id || ("track-" + (trackIndex + 1))) + "-" + (clipIndex + 1)),
        scene: resolveSceneId(clip?.scene || clip?.type || ""),
        start: timing.start,
        dur: timing.duration,
      }));
    });
  });

  return {
    width: width,
    height: height,
    fps: fps,
    duration: duration,
    background: source.background || "#05050c",
    layers: layers,
  };
}

function deriveTrackLabel(track, index) {
  if (track?.label) return String(track.label);
  if (track?.name) return String(track.name);
  const prefix = String(track?.kind || "").toLowerCase() === "audio" ? "A" : "V";
  return prefix + String(index + 1);
}

function deriveTrackDisplayId(track, index) {
  return String(track?.id || deriveTrackLabel(track, index));
}

function deriveClipLabel(clip, clipIndex) {
  return clip?.name || clip?.label || prettifyLabel(clip?.scene || clip?.type || clip?.id || ("Clip " + (clipIndex + 1)));
}

function deriveClipType(clip, track) {
  return prettifyLabel(clip?.type || clip?.scene || track?.kind || "clip").toUpperCase();
}

function deriveClipFamily(clip, track) {
  const raw = String(clip?.scene || clip?.type || track?.kind || "").toLowerCase();
  if (raw.includes("kineticheadline")) return "canvas";
  if (raw.includes("htmlslide") || raw.includes("html") || raw.includes("audio")) return "html";
  if (raw.includes("svgoverlay") || raw.includes("svg")) return "svg";
  if (raw.includes("markdownslide") || raw.includes("markdown") || raw.includes("md")) return "md";
  if (raw.includes("videoclip")) return "video";
  return "";
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

function deriveClipPalette(clip, track) {
  const raw = String(clip?.scene || clip?.type || track?.kind || "").toLowerCase();
  if (raw.includes("auroragradient") || raw.includes("fluidbackground") || raw.includes("cornerbadge")) {
    return {
      background: "rgba(160,160,170,0.18)",
      border: "rgba(160,160,170,0.28)",
      color: "rgba(226,226,232,0.88)",
    };
  }
  if (raw.includes("kineticheadline")) {
    return {
      background: "rgba(218,119,86,0.26)",
      border: "rgba(218,119,86,0.44)",
      color: "rgba(255,201,181,0.96)",
    };
  }
  if (raw.includes("htmlslide")) {
    return {
      background: "rgba(124,179,122,0.24)",
      border: "rgba(124,179,122,0.4)",
      color: "rgba(203,236,193,0.96)",
    };
  }
  if (raw.includes("svgoverlay")) {
    return {
      background: "rgba(138,111,174,0.28)",
      border: "rgba(138,111,174,0.46)",
      color: "rgba(226,203,255,0.96)",
    };
  }
  if (raw.includes("markdownslide")) {
    return {
      background: "rgba(201,123,158,0.26)",
      border: "rgba(201,123,158,0.42)",
      color: "rgba(255,205,226,0.96)",
    };
  }
  if (raw.includes("videoclip")) {
    return {
      background: "rgba(110,158,207,0.26)",
      border: "rgba(110,158,207,0.42)",
      color: "rgba(206,228,255,0.96)",
    };
  }
  if (raw.includes("circleripple") || raw.includes("orbitrings")) {
    return {
      background: "rgba(222,193,92,0.26)",
      border: "rgba(222,193,92,0.42)",
      color: "rgba(255,238,180,0.96)",
    };
  }
  return {
    background: "rgba(160,160,170,0.18)",
    border: "rgba(160,160,170,0.28)",
    color: "rgba(226,226,232,0.88)",
  };
}

function deriveClipInlineStyle(clip, track, totalDuration) {
  const timing = deriveClipTiming(clip);
  const start = timing.start;
  const duration = timing.duration;
  const left = Math.max(0, Math.min(100, percentOfTotal(start, totalDuration)));
  const width = Math.max(0, Math.min(100 - left, percentOfTotal(duration, totalDuration)));
  const palette = deriveClipPalette(clip, track);
  return (
    "left:" + left + "%;" +
    "width:" + width + "%;" +
    "min-width:12px;" +
    "background:" + palette.background + ";" +
    "border:1px solid " + palette.border + ";" +
    "color:" + palette.color + ";"
  );
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
    const click = project?.name
      ? ` onclick="event.stopPropagation(); goProject(${jsLiteral(project?.name || "")})"`
      : "";
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
    const click = currentProject
      ? ` onclick="event.stopPropagation(); goPipeline(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")})"`
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
    const click = currentProject && currentEpisode
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
    const result = await bridgeCall("fs.listDir", { path: episodePath }, IPC_LOAD_TIMEOUT_MS);
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
  requestAnimationFrame(fitStageToContainer);
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
    const empty = NO_PROJECTS_MESSAGE;
    grid.innerHTML = `<div class="project-card stagger-in" style="cursor:default"><div class="card-info"><div class="card-title">${escapeHtml(empty)}</div></div></div>`;
    list.innerHTML = `<div class="project-list-item stagger-in"><span class="list-dot accent"></span><span class="list-title">${escapeHtml(empty)}</span></div>`;
    return;
  }

  grid.innerHTML = projects.map((project, index) => {
    const accent = GLOW_NAMES[index % GLOW_NAMES.length];
    const updated = formatProjectUpdated(project?.updated);
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
    const meta = pluralize(finiteNumber(project?.episodes, 0), "episode", "episodes") + " · " + formatProjectUpdated(project?.updated);
    return (
      `<div class="project-list-item stagger-in" onclick='goProject(${jsLiteral(project?.name || "")})'>` +
      `<span class="list-dot ${accent}"></span>` +
      `<span class="list-title">${escapeHtml(project?.name || "Untitled")}</span>` +
      `<span class="list-meta">${escapeHtml(meta)}</span>` +
      `</div>`
    );
  }).join("");
}

async function loadProjectsWithRetry(requestId) {
  let lastError = new Error("IPC unavailable");
  for (let attempt = 0; attempt <= HOME_RETRY_COUNT; attempt += 1) {
    if (requestId !== homeLoadSeq) {
      return null;
    }
    try {
      return await bridgeCall("project.list", {}, IPC_HOME_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (attempt >= HOME_RETRY_COUNT) {
        break;
      }
      await wait(HOME_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

async function initHome() {
  const requestId = ++homeLoadSeq;
  renderHomeState([], "Loading projects...");

  try {
    const result = await loadProjectsWithRetry(requestId);
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
      ? ` onclick='goPipeline(${jsLiteral(currentProject)}, ${jsLiteral(episode?.name || "")})'`
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
  previewReloadSeq += 1;
  setPlaybackState(false);
  currentEpisode = null;
  currentSegment = null;
  currentSegmentPath = null;
  segmentsCache = [];
  currentTimeline = null;
  currentSelectedClipId = null;
  destroyDOMPreview();

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
    const result = await bridgeCall("episode.list", { project: currentProject }, IPC_LOAD_TIMEOUT_MS);
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
  previewReloadSeq += 1;
  setPlaybackState(false);
  currentSegmentPath = null;
  currentTimeline = null;
  currentSelectedClipId = null;
  destroyDOMPreview();
  segmentsCache = [];
  exportsCache = [];

  switchView("view-editor");
  updateInspectorContext();
  renderProjectDropdown();
  renderEpisodeDropdown();
  populateEditorClipSidebar();
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
      const episodeResult = await bridgeCall("episode.list", { project: currentProject }, IPC_LOAD_TIMEOUT_MS);
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
    }, IPC_LOAD_TIMEOUT_MS);
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

    const timeline = await bridgeCall("timeline.load", { path: currentSegmentPath }, IPC_LOAD_TIMEOUT_MS);
    if (requestId !== editorLoadSeq) {
      return;
    }

    currentTimeline = timeline || {};
    renderTimeline(currentTimeline);
    initDOMPreview(currentTimeline);
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
    destroyDOMPreview();
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
    destroyDOMPreview();
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

/* === pipeline.js (v0.4) === */
let pipelineData = null;
let pipelineStage = "script";

async function goPipeline(project, episode) {
  if (typeof project === "string") currentProject = project;
  if (typeof episode === "string") currentEpisode = episode;

  stopWatching();
  setPlaybackState(false);
  switchView("view-pipeline");

  var plProject = document.getElementById("pl-bc-project");
  var plEpisode = document.getElementById("pl-bc-episode");
  if (plProject) plProject.textContent = currentProject || "Project";
  if (plEpisode) plEpisode.textContent = currentEpisode || "Episode";

  pipelineData = null;
  renderPipelineStage();

  try {
    var homePath = "~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/pipeline.json";
    var result = await bridgeCall("fs.read", { path: homePath }, 3000);
    pipelineData = JSON.parse(result.contents);
  } catch (_e) {
    pipelineData = { version: "0.4", script: { principles: {}, arc: [], segments: [] }, audio: { voice: null, speed: 1, segments: [] }, atoms: [], outputs: [] };
  }
  renderPipelineStage();
}

function switchPipelineStage(stage) {
  pipelineStage = stage;
  if (stage === "assembly") {
    // Switch to editor view — it has matching tabs with 剪辑 active
    if (currentProject && currentEpisode) {
      goEditor(currentProject, currentEpisode);
    }
    return;
  }
  // For non-assembly stages, ensure we're in pipeline view
  var activeView = document.querySelector(".view.active");
  if (activeView && activeView.id === "view-editor") {
    switchView("view-pipeline");
  }
  // Update tab highlights across BOTH pipeline and editor tabs
  document.querySelectorAll(".pl-tab").forEach(function(tab) {
    tab.classList.toggle("active", tab.dataset.stage === stage);
  });
  renderPipelineStage();
}

function renderPipelineStage() {
  var container = document.getElementById("pipeline-content");
  if (!container) return;

  if (!pipelineData) {
    container.innerHTML = '<div class="pipeline-empty">Loading...</div>';
    return;
  }

  switch (pipelineStage) {
    case "script": container.innerHTML = renderPipelineScript(pipelineData); break;
    case "audio": container.innerHTML = renderPipelineAudio(pipelineData); break;
    case "clips": container.innerHTML = renderPipelineClips(pipelineData); break;
    case "atoms": container.innerHTML = renderPipelineAtoms(pipelineData); break;
    case "assembly":
      container.innerHTML = '<div class="pipeline-empty">正在加载编辑器...</div>';
      if (currentProject && currentEpisode) goEditor(currentProject, currentEpisode);
      break;
    case "output": container.innerHTML = renderPipelineOutput(pipelineData); break;
    default: container.innerHTML = '<div class="pipeline-empty">Unknown stage</div>';
  }
}


/**
 * Render pipeline script view: toolbar (principles + segment filter) + two-column table.
 * @param {Object} data
 * @param {Object} data.script.principles  - { audience, tone, style, pace, ... }
 * @param {Array}  data.script.segments    - [{ segment, narration, visual, role, logic }, ...]
 * @returns {string} HTML string
 */
function renderPipelineScript(data) {
  var script = data && data.script;
  if (!script || !script.segments || script.segments.length === 0) {
    return '<div class="pipeline-empty" style="padding:40px;text-align:center;color:rgba(228,228,232,0.5);font-size:13px;">No script data</div>';
  }

  var principles = script.principles || {};
  var segments = script.segments;
  var html = '';

  // ── Toolbar: principle chips ──
  html += '<div class="pl-toolbar" style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-wrap:wrap;gap:20px;align-items:center;">';
  var pKeys = Object.keys(principles);
  for (var p = 0; p < pKeys.length; p++) {
    var k = pKeys[p];
    html += '<div class="pl-chip" style="display:flex;align-items:center;gap:6px;">';
    html += '<span class="pl-chip-label" style="font-size:11px;color:rgba(228,228,232,0.5);">' + escHtml(k) + '</span>';
    html += '<span class="pl-chip-val" style="font-size:12px;color:rgba(228,228,232,0.5);font-weight:500;">' + escHtml(principles[k]) + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── Toolbar: divider ──
  html += '<div class="pl-divider" style="height:0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>';

  // ── Toolbar: segment filter pills ──
  html += '<div class="pl-toolbar" style="padding:8px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;align-items:center;">';
  html += '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-right:8px;">Segments</span>';
  html += '<span class="pl-seg-pill" data-seg="-1" onclick="plFilterSeg(-1)" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid rgba(124,106,239,0.2);background:rgba(124,106,239,0.15);color:#7c6aef;cursor:pointer;">All</span>';
  for (var s = 0; s < segments.length; s++) {
    html += '<span class="pl-seg-pill" data-seg="' + s + '" onclick="plFilterSeg(' + s + ')" style="font-size:12px;padding:4px 14px;border-radius:5px;border:1px solid transparent;background:transparent;color:rgba(228,228,232,0.5);cursor:pointer;">' + escHtml(String(segments[s].segment)) + '</span>';
  }
  html += '</div>';

  // ── Two-column table ──
  html += '<div class="pl-table" style="width:100%;overflow-y:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr>';
  html += '<th style="width:55%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Narration</th>';
  html += '<th style="width:45%;padding:10px 24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(228,228,232,0.5);text-align:left;font-weight:400;border-bottom:1px solid rgba(255,255,255,0.06);background:#111114;position:sticky;top:0;z-index:2;">Details</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    html += '<tr data-seg="' + i + '">';

    // Left column: narration (Georgia 17px)
    html += '<td style="font-family:Georgia,\'Times New Roman\',serif;font-size:17px;line-height:1.9;color:#e4e4e8;width:55%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';
    html += escHtml(seg.narration || '');
    html += '</td>';

    // Right column: visual + role/intent + logic
    html += '<td style="background:#111114;width:45%;padding:28px 24px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;">';

    if (seg.visual) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Visual</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.visual) + '</div>';
      html += '</div>';
    }

    if (seg.role) {
      html += '<div class="pl-meta-item" style="margin-bottom:10px;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Intent</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;">' + escHtml(seg.role) + '</div>';
      html += '</div>';
    }

    if (seg.logic) {
      html += '<div class="pl-meta-item" style="margin-bottom:0;">';
      html += '<div class="pl-meta-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(228,228,232,0.5);margin-bottom:3px;">Logic</div>';
      html += '<div class="pl-meta-value" style="font-size:13px;color:rgba(228,228,232,0.5);line-height:1.5;font-style:italic;">' + escHtml(seg.logic) + '</div>';
      html += '</div>';
    }

    html += '</td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  return html;
}

/**
 * Segment filter: show/hide table rows + toggle active pill styling.
 * @param {number} idx  -1 = show all, 0..N = show only that segment index
 */
function plFilterSeg(idx) {
  var pills = document.querySelectorAll('.pl-seg-pill');
  for (var i = 0; i < pills.length; i++) {
    var isActive = (idx === -1) ? (i === 0) : (parseInt(pills[i].getAttribute('data-seg'), 10) === idx);
    if (isActive) {
      pills[i].style.background = 'rgba(124,106,239,0.15)';
      pills[i].style.color = '#7c6aef';
      pills[i].style.borderColor = 'rgba(124,106,239,0.2)';
    } else {
      pills[i].style.background = 'transparent';
      pills[i].style.color = 'rgba(228,228,232,0.5)';
      pills[i].style.borderColor = 'transparent';
    }
  }
  var rows = document.querySelectorAll('.pl-table tbody tr[data-seg]');
  for (var r = 0; r < rows.length; r++) {
    rows[r].style.display = (idx === -1 || parseInt(rows[r].getAttribute('data-seg'), 10) === idx) ? '' : 'none';
  }
}

function renderPipelineAudio(data) {
  var voice = escHtml(data.audio.voice);
  var speed = data.audio.speed;
  var segments = data.audio.segments;
  var scriptSegs = data.script.segments;

  var generated = segments.filter(function(s) { return s.status === 'generated'; });
  var totalDur = generated.reduce(function(sum, s) { return sum + (s.duration || 0); }, 0);

  // --- Toolbar ---
  var html = '<div class="pl-toolbar">';
  html += '<div class="pl-chip pl-chip-accent"><span class="pl-chip-label">\u58F0\u7EBF</span><span class="pl-chip-val">' + voice + '</span></div>';
  html += '<div class="pl-chip"><span class="pl-chip-label">\u8BED\u901F</span><span class="pl-chip-val">' + speed.toFixed(1) + 'x</span></div>';
  html += '<div class="pl-chip pl-chip-green"><span class="pl-chip-label">\u5DF2\u751F\u6210</span><span class="pl-chip-val">' + generated.length + '/' + segments.length + '</span></div>';
  html += '<div class="pl-chip"><span class="pl-chip-label">\u603B\u65F6\u957F</span><span class="pl-chip-val">' + totalDur.toFixed(1) + 's</span></div>';
  html += '<div class="pl-divider"></div>';
  html += '<span class="pl-seg-pill active" onclick="plFilterSeg(-1)">\u5168\u90E8</span>';
  for (var i = 0; i < segments.length; i++) {
    html += '<span class="pl-seg-pill" onclick="plFilterSeg(' + i + ')">\u6BB5 ' + (i + 1) + '</span>';
  }
  html += '</div>';

  // --- Table ---
  html += '<div class="pl-table"><table><thead><tr>';
  html += '<th style="width:45%">\u6587\u6848</th>';
  html += '<th style="width:55%">\u97F3\u9891</th>';
  html += '</tr></thead><tbody>';

  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    var script = scriptSegs[si];
    var isGenerated = seg.status === 'generated';
    var trClass = isGenerated ? '' : ' class="seg-pending"';

    html += '<tr data-seg="' + si + '"' + trClass + '>';

    // Left column: narration
    html += '<td class="col-text">' + escHtml(script.narration) + '</td>';

    // Right column: audio metadata
    html += '<td class="col-audio">';
    html += '<div class="audio-head">';

    if (isGenerated) {
      html += '<span class="pl-tag-generated">\u5DF2\u751F\u6210</span>';
      html += '<span class="audio-duration">' + seg.duration.toFixed(1) + 's</span>';
    } else {
      html += '<span class="pl-tag-pending">\u5F85\u751F\u6210</span>';
    }

    html += '</div>';

    // Sentence rows (karaoke) - only for generated segments
    if (isGenerated && seg.sentences && seg.sentences.length > 0) {
      html += '<div class="sentence-list">';
      for (var j = 0; j < seg.sentences.length; j++) {
        var sent = seg.sentences[j];
        var startFmt = fmtTime(sent.start);
        var endFmt = fmtTime(sent.end);
        var durVal = (sent.end - sent.start).toFixed(1);

        html += '<div class="sentence-row">';
        html += '<span class="s-timecode">' + startFmt + ' <span class="s-arrow">&rarr;</span> ' + endFmt + '</span>';
        html += '<span class="s-text">' + escHtml(sent.text) + '</span>';
        html += '<span class="s-dur">' + durVal + 's</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    html += '</td></tr>';
  }

  html += '</tbody></table></div>';

  return html;
}

function fmtTime(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  var mm = (m < 10 ? '0' : '') + m;
  var whole = Math.floor(s);
  var frac = Math.round((s - whole) * 10);
  var ss = (whole < 10 ? '0' : '') + whole;
  return mm + ':' + ss + '.' + frac;
}

function renderPipelineClips(data) {
  var atoms = (data.atoms || []).filter(function (a) { return a.type === 'video'; });

  var header =
    '<div class="clip-list-header" style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);' +
    'font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(228,228,232,0.5)">' +
    'VIDEO CLIPS &middot; ' + atoms.length +
    '</div>';

  var rows = '';
  atoms.forEach(function (a) {
    var dur = (typeof a.duration === 'number') ? a.duration.toFixed(1) : '0.0';

    // --- status tags ---
    var tags = '';

    // subtitle tag
    if (a.subtitles && a.subtitles.length > 0) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(224,160,64,0.12);color:#e0a040">' +
        escHtml('字幕✓') + '</span>';
    } else {
      tags += '<span class="pl-tag-pending" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(228,228,232,0.05);color:rgba(228,228,232,0.25)">' +
        escHtml('无字幕') + '</span>';
    }

    // timeline tag
    if (a.hasTl) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(124,106,239,0.06);color:#7c6aef">' +
        escHtml('时间轴✓') + '</span>';
    } else {
      tags += '<span class="pl-tag-pending" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;background:rgba(228,228,232,0.05);color:rgba(228,228,232,0.25)">' +
        escHtml('无时间轴') + '</span>';
    }

    // segment tag
    if (a.segment != null) {
      tags += '<span class="pl-tag-generated" style="font-size:11px;padding:2px 10px;border-radius:3px;' +
        'font-weight:500;font-family:\'SF Mono\',Menlo,monospace;background:rgba(124,106,239,0.15);color:#7c6aef">' +
        escHtml('段' + a.segment) + '</span>';
    }

    // --- thumbnail placeholder ---
    var thumb =
      '<div style="width:100px;height:56px;background:#111114;border-radius:4px;flex-shrink:0;' +
      'display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(228,228,232,0.25)">' +
      '16:9</div>';

    // --- row ---
    rows +=
      '<div class="clip-row" style="display:flex;align-items:center;gap:12px;padding:7px 10px;' +
      'border-radius:6px;border:1px solid transparent">' +
        thumb +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">' +
          '<span style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escHtml(a.name) +
          '</span>' +
          '<span style="font-family:\'SF Mono\',Menlo,monospace;font-size:11px;color:rgba(228,228,232,0.5);' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escHtml(a.file || '') +
          '</span>' +
        '</div>' +
        '<span style="font-family:\'SF Mono\',Menlo,monospace;font-size:11px;color:#7c6aef;white-space:nowrap;flex-shrink:0">' +
          escHtml(dur + 's') +
        '</span>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;align-items:center">' +
          tags +
        '</div>' +
      '</div>';
  });

  return header + '<div class="clip-list" style="padding:6px 20px">' + rows + '</div>';
}

function renderPipelineAtoms(data) {
  var atoms = data.atoms || [];

  var counts = { all: atoms.length, component: 0, video: 0, image: 0 };
  atoms.forEach(function(a) { if (counts[a.type] !== undefined) counts[a.type]++; });

  var typeLabels = { component: '组件', video: '视频', image: '图片' };

  // --- Toolbar ---
  var html = '<div class="pl-toolbar">';
  html += '<span class="pl-seg-pill active" data-filter="all">全部 ' + counts.all + '</span>';
  html += '<span class="pl-seg-pill" data-filter="component">' + typeLabels.component + ' ' + counts.component + '</span>';
  html += '<span class="pl-seg-pill" data-filter="video">' + typeLabels.video + ' ' + counts.video + '</span>';
  html += '<span class="pl-seg-pill" data-filter="image">' + typeLabels.image + ' ' + counts.image + '</span>';
  html += '</div>';

  // --- Grid ---
  html += '<div class="pl-atoms-grid">';
  atoms.forEach(function(a) {
    var typeClass = a.type; // component | video | image
    var typeLabel = typeLabels[a.type] || a.type;

    // Build info / description line
    var desc = '';
    if (a.type === 'component') {
      desc = 'scene &middot; ' + escHtml(a.scene || a.name) + '.js';
    } else if (a.type === 'video') {
      var parts = [];
      if (a.duration != null) parts.push(a.duration + 's');
      if (a.dimensions) parts.push(a.dimensions);
      desc = parts.join(' &middot; ');
    } else if (a.type === 'image') {
      var parts = [];
      if (a.dimensions) parts.push(a.dimensions);
      if (a.size) parts.push(a.size);
      desc = parts.join(' &middot; ');
    }

    html += '<div class="pl-atom-card" data-type="' + escHtml(a.type) + '">';

    // Preview area
    html += '<div class="pl-atom-preview">';
    if (a.type === 'component') {
      html += '<span>' + escHtml(a.scene || a.name) + '</span>';
    } else {
      html += '<span>' + escHtml(a.file || a.name) + '</span>';
    }
    html += '</div>';

    // Info area
    html += '<div class="pl-atom-info">';

    // Name + type tag row
    html += '<div class="pl-atom-name">';
    html += '<span>' + escHtml(a.name) + '</span>';
    html += '<span class="pl-atom-type-tag ' + typeClass + '">' + escHtml(typeLabel) + '</span>';
    if (a.segment != null) {
      html += '<span class="pl-atom-seg">段 ' + escHtml(String(a.segment)) + '</span>';
    }
    html += '</div>';

    // Description
    if (desc) {
      html += '<div class="pl-atom-desc">' + desc + '</div>';
    }

    // File path for video/image
    if (a.file && (a.type === 'video' || a.type === 'image')) {
      html += '<div class="pl-atom-path">' + escHtml(a.file) + '</div>';
    }

    html += '</div>'; // .pl-atom-info
    html += '</div>'; // .pl-atom-card
  });
  html += '</div>';

  return html;
}

function renderPipelineOutput(data) {
  var outputs = (data.outputs || []).slice().sort(function(a, b) { return b.id - a.id; });
  var count = outputs.length;

  var html = '<div class="pl-outputs">';

  // Header
  html += '<div class="count-bar"><span>' + escHtml(String(count)) + ' 个版本</span></div>';

  // Version cards
  for (var i = 0; i < outputs.length; i++) {
    var o = outputs[i];
    var specs = o.specs || {};
    var published = o.published || [];
    var dateStr = '';
    if (o.date) {
      var d = new Date(o.date);
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      dateStr = d.getFullYear() + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
    }

    html += '<div class="pl-output-card">';

    // Thumbnail
    html += '<div class="pl-output-thumb"><span class="v-thumb-play">&#x25B6;</span></div>';

    // Info
    html += '<div class="pl-output-info">';
    html += '<div class="pl-output-name">' + escHtml(o.name || '') + '</div>';
    html += '<div class="pl-output-date">' + escHtml(dateStr) + '</div>';

    // Spec tags
    html += '<div class="pl-output-specs">';
    if (specs.width && specs.height) {
      html += '<span class="spec-tag pl-spec-res">' + escHtml(specs.width + '\u00d7' + specs.height) + '</span>';
    }
    if (specs.fps) {
      html += '<span class="spec-tag pl-spec-fps">' + escHtml(specs.fps + 'fps') + '</span>';
    }
    if (specs.codec) {
      html += '<span class="spec-tag pl-spec-codec">' + escHtml(specs.codec) + '</span>';
    }
    if (o.duration != null) {
      html += '<span class="spec-tag pl-spec-dur">' + escHtml(o.duration + 's') + '</span>';
    }
    if (o.size) {
      html += '<span class="spec-tag pl-spec-size">' + escHtml(o.size) + '</span>';
    }
    html += '</div>';

    // Changes
    if (o.changes) {
      html += '<div class="pl-output-changes">' + escHtml(o.changes) + '</div>';
    }

    // File path
    if (o.file) {
      html += '<div class="pl-meta-path">' + escHtml(o.file) + '</div>';
    }

    html += '</div>'; // pl-output-info

    // Publish status
    html += '<div class="pl-output-status">';
    if (published.length > 0) {
      for (var j = 0; j < published.length; j++) {
        html += '<span class="pl-tag-published">' + escHtml(published[j].platform) + ' \u2713</span>';
      }
    } else {
      html += '<span class="pl-tag-unpublished">未发布</span>';
    }
    html += '</div>';

    html += '</div>'; // pl-output-card
  }

  html += '</div>'; // pl-outputs
  return html;
}

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "\&lt;").replace(/>/g, "\&gt;").replace(/"/g, "\&quot;");
}

function initBreadcrumbNavigation() {
  const projectLabel = document.getElementById("bc-show-label");
  if (projectLabel) {
    projectLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject) {
        void goProject(currentProject);
      } else {
        goHome();
      }
    });
  }

  const episodeLabel = document.getElementById("bc-ep-label");
  if (episodeLabel) {
    episodeLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject && currentEpisode) {
        void goEditor(currentProject, currentEpisode, null);
      } else if (currentProject) {
        void goProject(currentProject);
      } else {
        goHome();
      }
    });
  }

  const segmentLabel = document.getElementById("bc-scene-label");
  if (segmentLabel) {
    segmentLabel.addEventListener("click", function(event) {
      event.stopPropagation();
      if (currentProject && currentEpisode) {
        void goEditor(currentProject, currentEpisode, currentSegment);
      }
    });
  }
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
  bridgeCall("fs.mtime", { path: path }, IPC_POLL_TIMEOUT_MS).then(function(r) {
    _watchMtime = (r && r.mtime) || 0;
  }).catch(function() {});
  // poll every 2 seconds
  _watchInterval = setInterval(function() {
    if (!_watchPath) return;
    bridgeCall("fs.mtime", { path: _watchPath }, IPC_POLL_TIMEOUT_MS).then(function(r) {
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
  const reloadSeq = ++previewReloadSeq;
  bridgeCall("timeline.load", { path: timelinePath }, IPC_LOAD_TIMEOUT_MS).then(function(result) {
    if (!result) return;
    if (reloadSeq !== previewReloadSeq) return;
    if (timelinePath !== getCurrentSegmentPath()) return;
    currentTimeline = result;
    renderTimeline(result, selectedClipId);
    initDOMPreview(result);
  }).catch(function() {});
}

function initPreviewSurface() {
  window.addEventListener("resize", fitStageToContainer);
}

async function previewComposed() {
  var segPath = getCurrentSegmentPath();
  if (!segPath) {
    setPreviewPlaceholder("PREVIEW", "Open a segment before composing");
    return;
  }

  var htmlPath = segPath.replace(/\.json$/i, ".html");
  setPlaybackState(false);

  try {
    await bridgeCall("compose.generate", {
      timelinePath: segPath,
      outputPath: htmlPath,
      open: true,
    }, IPC_COMPOSE_TIMEOUT_MS);
    requestPreviewFrame(currentTime);
  } catch (error) {
    console.error("[preview] compose failed", error);
    setText("canvas-title", "PREVIEW");
    setText("canvas-sub", getBridgeMessage(error));
  }
}

function initApp() {
  initBreadcrumbs();
  initBreadcrumbNavigation();
  initCustomSelect();
  initCanvasDrag();
  initTimeline();
  initPreviewSurface();
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
  goPipeline,
  goProject,
  plFilterSeg,
  selectEditorClip,
  openPlayer,
  pickOpt,
  seekPlayer,
  selectClip,
  showOverlay,
  startDrag,
  switchPipelineStage,
  switchView,
  syncSlider,
  toggleBcDrop,
  toggleCustomSelect,
  toggleExports,
  toggleFullscreen,
  togglePlay,
  togglePlayerPlay,
  toggleSettings,
  previewComposed,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}
})();
