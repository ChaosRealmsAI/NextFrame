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

let _pendingVideoUrl = null;

function openPlayer(name, url, detail) {
  document.getElementById("exports-overlay").classList.remove("show");
  document.getElementById("exports-panel").classList.remove("show");
  document.getElementById("player-title").textContent = name;
  document.getElementById("player-detail").textContent = detail || "";
  document.getElementById("player-tc").textContent = "点击 ▶ 播放";
  document.getElementById("player-progress-fill").style.width = "0%";
  document.getElementById("player-big-play").classList.remove("playing");
  playerPlaying = false;
  playerDur = 0;

  // Store URL — don't load video yet (nfdata:// blocks main thread)
  _pendingVideoUrl = url;
  const video = getPlayerVideo();
  if (video) { video.pause(); video.removeAttribute("src"); }

  // Show modal INSTANTLY — zero blocking
  document.getElementById("player-overlay").classList.add("show");
  document.getElementById("player-modal").classList.add("show");
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

  // Lazy load: first play triggers video.src load
  if (_pendingVideoUrl && (!video.src || video.src === "")) {
    document.getElementById("player-tc").textContent = "加载中...";
    video.src = _pendingVideoUrl;
    _pendingVideoUrl = null;
    video.onloadedmetadata = function() {
      playerDur = finiteNumber(video.duration, playerDur);
      document.getElementById("player-tc").textContent = "00:00 / " + formatTC(playerDur);
    };
    video.oncanplay = function() {
      video.oncanplay = null;
      video.play();
      playerPlaying = true;
      bigPlay.classList.add("playing");
      button.innerHTML = "&#10074;&#10074;";
      animatePlayer();
    };
    video.load();
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
