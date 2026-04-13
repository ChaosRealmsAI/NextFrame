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
