// Pipeline shared utility functions.

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNfdataUrl(path) {
  if (!path) return '';
  const idx = path.indexOf('/projects/');
  if (idx >= 0) return 'nfdata://localhost/' + encodeURI(path.substring(idx + '/projects/'.length));
  return path;
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function formatExportPercent(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '0%';
  return Math.max(0, Math.min(100, percent)).toFixed(1) + '%';
}

function formatExportEta(eta) {
  if (typeof eta !== 'number' || Number.isNaN(eta) || eta <= 0) return '--';
  if (eta < 60) return Math.round(eta) + 's';
  const mins = Math.floor(eta / 60);
  const secs = Math.round(eta % 60);
  return mins + 'm ' + secs + 's';
}

function formatTimecode(ms) {
  const s = (ms || 0) / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return String(m).padStart(2, '0') + ':' + sec;
}

function getCurrentProjectRef() { return window.currentProjectPath || ''; }
function getCurrentEpisodeRef() { return window.currentEpisodePath || ''; }

function getProjectNameFromPath() { const parts = getCurrentProjectRef().replace(/\/+$/, '').split('/'); return parts[parts.length - 1] || ''; }
function getEpisodeNameFromPath() { const parts = getCurrentEpisodeRef().replace(/\/+$/, '').split('/'); return parts[parts.length - 1] || ''; }

function normalizeSegmentPreviewParams(segmentName) {
  return {
    project: getCurrentProjectRef(),
    episode: getCurrentEpisodeRef(),
    segment: segmentName,
  };
}

function fallbackSegmentPreviewParams(segmentName) {
  return {
    project: getProjectNameFromPath(),
    episode: getEpisodeNameFromPath(),
    segment: segmentName,
  };
}
