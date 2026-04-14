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
