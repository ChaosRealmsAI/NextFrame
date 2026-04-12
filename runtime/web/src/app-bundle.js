(function(){
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
let overlay = null;

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

/* === exports-panel.js === */
let playerPlaying = false;
let playerAnim = null;
let playerStart = 0;
let playerDur = 26;

function formatTC(seconds) {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return String(minutes).padStart(2, "0") + ":" + String(wholeSeconds).padStart(2, "0");
}

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
const TOTAL_DURATION = 26;
const PX_PER_SEC = 61.33;

let isPlaying = false;
let currentTime = 2.4;
let playRAF = null;
let lastTS = null;

function formatTC(seconds) {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return String(minutes).padStart(2, "0") + ":" + String(wholeSeconds).padStart(2, "0");
}

function playLoop(timestamp) {
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

function generateAudioBars() {
  const container = document.getElementById("audio-bars");
  const count = 200;
  for (let index = 0; index < count; index += 1) {
    const bar = document.createElement("div");
    bar.className = "tl-audio-bar";
    const height = Math.random() * 24 + 4;
    bar.style.height = height + "px";
    container.appendChild(bar);
  }
}

function selectClip(element) {
  document
    .querySelectorAll(".tl-clip")
    .forEach((clip) => clip.classList.remove("selected"));
  element.classList.add("selected");

  const { name, type, id } = element.dataset;
  const start = parseFloat(element.dataset.start);

  document.getElementById("insp-scene-name").textContent = name;
  document.getElementById("insp-clip-id").textContent = id;
  document.getElementById("canvas-title").textContent = type;
  document.getElementById("canvas-sub").textContent =
    "scene:" + name.toLowerCase().replace(/\s+/g, "-") + " · " + formatTC(start);
  document.getElementById("badge-type").textContent = type;
  document.getElementById("badge-id").textContent = id;

  setPlayheadTime(start);

  document
    .querySelectorAll(".scene-chip")
    .forEach((chip) => chip.classList.remove("active"));
  const chipText = type.toLowerCase();
  document.querySelectorAll(".scene-chip").forEach((chip) => {
    if (chip.textContent.toLowerCase() === chipText) {
      chip.classList.add("active");
    }
  });
}

function setPlayheadTime(time) {
  currentTime = time;
  const px = time * PX_PER_SEC;
  document.getElementById("tl-playhead").style.left = px + "px";
  document.getElementById("tc-current").textContent = formatTC(time);
  document.getElementById("tc-fs-current").textContent = formatTC(time);
  document.getElementById("progress-fill").style.width =
    (time / TOTAL_DURATION) * 100 + "%";
}

function togglePlay() {
  isPlaying = !isPlaying;
  const icon = isPlaying ? "\u23F8" : "\u25B6";
  document.getElementById("btn-play").innerHTML = icon;
  document.getElementById("btn-play-fs").innerHTML = icon;

  if (isPlaying) {
    lastTS = null;
    playRAF = requestAnimationFrame(playLoop);
  } else {
    cancelAnimationFrame(playRAF);
  }
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

function initTimeline() {
  generateAudioBars();
  setPlayheadTime(2.4);
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

/* === app.js === */
  closeAllDropdowns,
  initBreadcrumbs,
  showOverlay,
  toggleBcDrop,
} from "./breadcrumbs.js";
  closePlayer,
  openPlayer,
  seekPlayer,
  toggleExports,
  togglePlayerPlay,
} from "./exports-panel.js";

{ closeAllDropdowns, showOverlay };

function switchView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const target = document.getElementById(id);
  target.classList.add("active");
  target.classList.add("view-transition-enter");
  target.querySelectorAll(".stagger-in").forEach((element) => {
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  });
  setTimeout(() => target.classList.remove("view-transition-enter"), 500);
  closeAllDropdowns();
}

function goHome() {
  switchView("view-home");
}

function goProject() {
  switchView("view-project");
}

function goEditor() {
  switchView("view-editor");
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

function initApp() {
  initBreadcrumbs();
  initCustomSelect();
  initCanvasDrag();
  initTimeline();
  document.addEventListener("keydown", handleKeydown);
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
