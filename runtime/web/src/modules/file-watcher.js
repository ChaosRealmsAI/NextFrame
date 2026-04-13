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
  playPipelineAudio,
  playPipelineVideo,
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
