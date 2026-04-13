window.NF = window.NF || {};

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

var DESKTOP_CONNECT_MESSAGE = "Connect via desktop app to load projects";
var NO_PROJECTS_MESSAGE = "No projects — create one with `nextframe project-new <name>`";
var IPC_HOME_TIMEOUT_MS = 1500;
var IPC_LOAD_TIMEOUT_MS = 4000;
var IPC_POLL_TIMEOUT_MS = 1200;
var IPC_COMPOSE_TIMEOUT_MS = 20000;
var HOME_RETRY_DELAY_MS = 500;
var HOME_RETRY_COUNT = 3;
var ACCENT_NAMES = ["accent", "warm", "blue"];
var GLOW_NAMES = ["glow-accent", "glow-warm", "glow-blue"];

var TOTAL_DURATION = 26;
var isPlaying = false;
var currentTime = 2.4;
var playRAF = null;
var lastTS = null;

var playerPlaying = false;
var playerAnim = null;
var playerStart = 0;
var playerDur = 26;

var overlay = null;

var currentProject = null;
var currentEpisode = null;
var currentSegment = null;
var currentSegmentPath = null;
var currentTimeline = null;
var currentSelectedClipId = null;
var previewEngine = null;
var previewStageHost = null;
var previewTimeline = null;
var previewStageClickHandler = null;
var previewReloadSeq = 0;

var projectsCache = [];
var episodesCache = [];
var segmentsCache = [];
var episodesCacheProject = null;
var exportsCache = [];

var homeLoadSeq = 0;
var projectLoadSeq = 0;
var editorLoadSeq = 0;

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

Object.assign(window.NF, {
  animatePlayer,
  beginTimelineScrub,
  bindPipelineEvents,
  bridgeCall,
  buildNfdataUrl,
  buildPreviewTimeline,
  closeAllDropdowns,
  closePlayer,
  deriveClipClass,
  deriveClipFamily,
  deriveClipInlineStyle,
  deriveClipLabel,
  deriveClipPalette,
  deriveClipTiming,
  deriveClipType,
  deriveTimelineDuration,
  deriveTrackDisplayId,
  deriveTrackLabel,
  destroyDOMPreview,
  endTimelineScrub,
  ensurePreviewInteractivity,
  escHtml,
  escapeAttr,
  escapeHtml,
  findEpisodeEntry,
  findSegmentEntry,
  finiteNumber,
  fitStageToContainer,
  fmtTime,
  formatCompactDuration,
  formatPreciseTime,
  formatProjectUpdated,
  formatRelativeUpdated,
  formatTC,
  getBridgeMessage,
  getCurrentEpisodePath,
  getCurrentSegmentPath,
  getEpisodeDisplayName,
  getOverlay,
  getPlayerVideo,
  getProjectDisplayName,
  getSegmentDisplayName,
  getTimelineTracks,
  goEditor,
  goHome,
  goPipeline,
  goProject,
  handleKeydown,
  initApp,
  initBreadcrumbNavigation,
  initBreadcrumbs,
  initCanvasDrag,
  initCustomSelect,
  initDOMPreview,
  initHome,
  initPreviewSurface,
  initTimeline,
  jsLiteral,
  loadProjectsWithRetry,
  moveTimelineScrub,
  openPlayer,
  percentOfTotal,
  pickOpt,
  plFilterSeg,
  playLoop,
  playPipelineAudio,
  playPipelineVideo,
  pluralize,
  populateEditorClipSidebar,
  prepareTimelineContainer,
  prettifyLabel,
  previewComposed,
  readProjectPath,
  refreshExportsPanel,
  reloadCurrentTimeline,
  renderClipHtml,
  renderEditorClips,
  renderEditorNotice,
  renderEpisodeDropdown,
  renderExportsList,
  renderHomeState,
  renderPipelineAtoms,
  renderPipelineAudio,
  renderPipelineClips,
  renderPipelineOutput,
  renderPipelineScript,
  renderPipelineStage,
  renderProjectDropdown,
  renderProjectState,
  renderSegmentDropdown,
  renderTimeline,
  renderTimelineRuler,
  renderTrackHeader,
  renderTrackRow,
  requestPreviewFrame,
  resetSelection,
  resolveSceneId,
  restartStaggerAnimations,
  seekPlayer,
  selectClip,
  selectEditorClip,
  setPlayButtonIcons,
  setPlaybackState,
  setPlayheadTime,
  setPreviewPlaceholder,
  setReadout,
  setText,
  setTotalDuration,
  setValue,
  showOverlay,
  slugify,
  startDrag,
  startWatching,
  stopWatching,
  stringifyClipParams,
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
  updateInspectorContext,
  updateInspectorFromIframe,
  updatePlayheadFromPointer,
  wait,
});

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
