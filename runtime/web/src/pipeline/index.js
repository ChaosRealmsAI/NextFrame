/* === pipeline/index.js === */
let pipelineData = null;
let pipelineStage = "script";
let pipelineClipsSelectedIndex = 0;
let pipelineClipsExpandedClip = -1;

async function goPipeline(project, episode) {
  if (typeof project === "string") {
    currentProject = project;
  }
  if (typeof episode === "string") {
    currentEpisode = episode;
  }

  stopWatching();
  setPlaybackState(false);
  switchView("view-pipeline");

  const plProject = document.getElementById("pl-bc-project");
  const plEpisode = document.getElementById("pl-bc-episode");
  if (plProject) {
    plProject.textContent = currentProject || "Project";
  }
  if (plEpisode) {
    plEpisode.textContent = currentEpisode || "Episode";
  }

  pipelineData = null;
  pipelineClipsSelectedIndex = 0;
  pipelineClipsExpandedClip = -1;
  renderPipelineStage();

  try {
    const homePath = "~/NextFrame/projects/" + currentProject + "/" + currentEpisode + "/pipeline.json";
    const result = await bridgeCall("fs.read", { path: homePath }, 3000);
    pipelineData = JSON.parse(result.contents);
  } catch (_error) {
    pipelineData = {
      version: "0.4",
      script: { principles: {}, arc: [], segments: [] },
      audio: { voice: null, speed: 1, segments: [] },
      atoms: [],
      outputs: [],
    };
  }
  renderPipelineStage();
}

function switchPipelineStage(stage) {
  pipelineStage = stage;
  if (stage === "assembly") {
    if (currentProject && currentEpisode) {
      goEditor(currentProject, currentEpisode);
    }
    return;
  }

  const activeView = document.querySelector(".view.active");
  if (activeView && activeView.id === "view-editor") {
    switchView("view-pipeline");
  }

  document.querySelectorAll(".pl-tab").forEach(function(tab) {
    tab.classList.toggle("active", tab.dataset.stage === stage);
  });
  renderPipelineStage();
}

function renderPipelineStage() {
  const container = document.getElementById("pipeline-content");
  if (!container) {
    return;
  }
  resetPipelineAudioPlayback();

  if (!pipelineData) {
    container.innerHTML = '<div class="pipeline-empty">Loading...</div>';
    return;
  }

  switch (pipelineStage) {
    case "script":
      container.innerHTML = renderPipelineScript(pipelineData);
      break;
    case "audio":
      container.innerHTML = renderPipelineAudio(pipelineData);
      break;
    case "clips":
      container.innerHTML = renderPipelineClips(pipelineData);
      break;
    case "atoms":
      container.innerHTML = renderPipelineAtoms(pipelineData);
      break;
    case "assembly":
      container.innerHTML = '<div class="pipeline-empty">正在加载编辑器...</div>';
      if (currentProject && currentEpisode) {
        goEditor(currentProject, currentEpisode);
      }
      break;
    case "output":
      container.innerHTML = renderPipelineOutput(pipelineData);
      break;
    default:
      container.innerHTML = '<div class="pipeline-empty">Unknown stage</div>';
  }

  bindPipelineEvents(container);
}

function bindPipelineEvents(container) {
  container.querySelectorAll("[data-audio-path]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      playPipelineAudio(btn, btn.dataset.audioPath);
    });
  });

  container.querySelectorAll("[data-video-path]").forEach(function(btn) {
    btn.addEventListener("click", function(event) {
      event.stopPropagation();
      if (btn.dataset.fullscreen === "1") {
        // ⛶ Fullscreen modal
        playPipelineVideo(btn.dataset.videoPath);
      } else {
        // ▶ Inline small-window playback
        playPipelineVideoInline(btn);
      }
    });
  });

  container.querySelectorAll("[data-filter-seg]").forEach(function(pill) {
    pill.addEventListener("click", function() {
      plFilterSeg(parseInt(pill.dataset.filterSeg, 10));
    });
  });

  container.querySelectorAll("[data-filter-type]").forEach(function(pill) {
    pill.addEventListener("click", function() {
      const type = pill.dataset.filterType;
      container.querySelectorAll("[data-filter-type]").forEach(function(entry) {
        entry.classList.toggle("active", entry.dataset.filterType === type);
      });
      container.querySelectorAll("[data-type]").forEach(function(card) {
        card.style.display = (type === "all" || card.dataset.type === type) ? "" : "none";
      });
    });
  });

  const clipsRoot = container.querySelector(".pipeline-clips");
  if (clipsRoot) {
    clipsRoot.addEventListener("click", function(event) {
      // Skip if clicking a play/fullscreen button
      if (event.target.closest("[data-video-path]")) return;

      // Sidebar source click
      const srcItem = event.target.closest ? event.target.closest(".clips-src-item[data-idx]") : null;
      if (srcItem && clipsRoot.contains(srcItem)) {
        const nextIndex = parseInt(srcItem.dataset.idx, 10);
        if (isFinite(nextIndex) && nextIndex !== pipelineClipsSelectedIndex) {
          pipelineClipsSelectedIndex = nextIndex;
          pipelineClipsExpandedClip = -1;
          container.innerHTML = renderPipelineClips(pipelineData);
          bindPipelineEvents(container);
        }
        return;
      }

      // Clip row or timeline block click (expand/collapse detail)
      const clipEl = event.target.closest ? event.target.closest("[data-clips-idx]") : null;
      if (clipEl && clipsRoot.contains(clipEl)) {
        const clipIdx = parseInt(clipEl.dataset.clipsIdx, 10);
        if (isFinite(clipIdx)) {
          pipelineClipsExpandedClip = (pipelineClipsExpandedClip === clipIdx) ? -1 : clipIdx;
          container.innerHTML = renderPipelineClips(pipelineData);
          bindPipelineEvents(container);
        }
        return;
      }
    });
  }
}
