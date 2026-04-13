/* === File watcher (polling) === */
let _watchPath = null;
let _watchMtime = 0;
let _watchInterval = null;

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
      const newMtime = (r && r.mtime) || 0;
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
