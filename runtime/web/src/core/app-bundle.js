(function() {
  const ipcPending = new Map();
  const ipcExpired = new Set();
  let ipcNextId = 0;

  function toTimeoutMs(value) {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(0, next) : 0;
  }

  window.__ipc = window.__ipc || {};
  window.__ipc.resolve = function(response) {
    console.log("[bridge] resolve raw:", typeof response === "string" ? response.substring(0, 200) : response);
    const payload = typeof response === "string" ? JSON.parse(response) : response || {};
    const entry = ipcPending.get(payload.id);
    if (!entry) {
      if (ipcExpired.has(payload.id)) {
        ipcExpired.delete(payload.id);
        return;
      }
      console.warn("[bridge] no pending entry for id:", payload.id);
      return;
    }

    ipcPending.delete(payload.id);
    if (payload.ok) {
      console.log("[bridge] resolved:", payload.id);
      entry.resolve(payload.result);
    } else {
      console.error("[bridge] rejected:", payload.error);
      entry.reject(new Error(payload.error || "IPC failed"));
    }
  };

  window.bridgeCall = function bridgeCall(method, params, timeoutMs) {
    var postFn = null;
    if (typeof window.ipc?.postMessage === "function") {
      postFn = function(message) { window.ipc.postMessage(message); };
    } else if (typeof window.webkit?.messageHandlers?.ipc?.postMessage === "function") {
      postFn = function(message) { window.webkit.messageHandlers.ipc.postMessage(message); };
    }
    if (!postFn) {
      console.warn("[bridge] IPC unavailable — no postMessage found");
      return Promise.reject(new Error("IPC unavailable"));
    }

    const id = "ipc-" + Date.now() + "-" + (++ipcNextId);
    return new Promise((resolve, reject) => {
      const safeTimeoutMs = toTimeoutMs(timeoutMs);
      let timeoutId = null;
      ipcPending.set(id, {
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
      });

      if (safeTimeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (!ipcPending.has(id)) {
            return;
          }
          ipcPending.delete(id);
          ipcExpired.add(id);
          reject(new Error(method + " timed out after " + safeTimeoutMs + "ms"));
        }, safeTimeoutMs);
      }

      try {
        postFn(JSON.stringify({ id: id, method: method, params: params }));
      } catch (error) {
        ipcPending.delete(id);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      }
    });
  };
})();

function initApp() {
  if (window.__nfAppInitialized) {
    return;
  }
  window.__nfAppInitialized = true;

  // Move player modal to body root (it's inside view-editor which gets display:none)
  var playerOverlay = document.getElementById("player-overlay");
  var playerModal = document.getElementById("player-modal");
  if (playerOverlay && playerOverlay.parentElement !== document.body) document.body.appendChild(playerOverlay);
  if (playerModal && playerModal.parentElement !== document.body) document.body.appendChild(playerModal);

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
  openPlayer,
  pickOpt,
  playPipelineAudio,
  playPipelineVideo,
  plFilterSeg,
  previewComposed,
  seekPlayer,
  selectClip,
  selectEditorClip,
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
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}
