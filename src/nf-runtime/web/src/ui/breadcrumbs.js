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
