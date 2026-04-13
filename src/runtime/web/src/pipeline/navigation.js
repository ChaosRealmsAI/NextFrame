/* === pipeline/navigation.js === */
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
