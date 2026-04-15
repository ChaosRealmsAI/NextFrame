function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function toNfdataUrl(path) {
  if (!path) return '';
  const marker = path.indexOf('/projects/');
  return marker < 0 ? path : 'nfdata://localhost/' + encodeURI(path.slice(marker + '/projects/'.length));
}

function formatTimecode(ms) {
  const seconds = (ms || 0) / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return String(minutes).padStart(2, '0') + ':' + remainder;
}

function formatClock(totalSeconds, withTenths) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return withTenths ? '00:00.0' : '00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (withTenths) {
    const base = String(minutes).padStart(2, '0') + ':' + seconds.toFixed(1).padStart(4, '0');
    return hours > 0 ? String(hours).padStart(2, '0') + ':' + base : base;
  }
  const mm = hours > 0 ? Math.floor((totalSeconds % 3600) / 60) : Math.floor(totalSeconds / 60);
  const ss = Math.floor(totalSeconds % 60);
  const core = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  return hours > 0 ? String(hours).padStart(2, '0') + ':' + core : core;
}

function formatExportPercent(percent) {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '0%';
  return Math.max(0, Math.min(100, percent)).toFixed(1) + '%';
}

function formatExportEta(eta) {
  if (typeof eta !== 'number' || Number.isNaN(eta) || eta <= 0) return '--';
  if (eta < 60) return Math.round(eta) + 's';
  const minutes = Math.floor(eta / 60);
  const seconds = Math.round(eta % 60);
  return minutes + 'm ' + seconds + 's';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? Math.round(mb) + 'MB' : mb.toFixed(1) + 'MB';
}

function langLabel(key) {
  const labels = { zh: '中', ja: '日', ko: '韩', fr: 'FR', es: 'ES', de: 'DE' };
  return labels[key] || String(key || '').slice(0, 2).toUpperCase();
}

function formatResolution(width, height) {
  if (!Number.isFinite(height) || height <= 0) return '—';
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (width > 0) return width + '×' + height;
  return String(height) + 'p';
}

function humanizeSlug(value) {
  return String(value || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSourceTitle(source, index) {
  if (source && source.meta && typeof source.meta.title === 'string' && source.meta.title.trim()) {
    return source.meta.title.trim();
  }
  if (source && source.planTitle && source.planTitle.trim()) {
    return source.planTitle.trim();
  }
  return humanizeSlug((source && source.slug) || ('source-' + index));
}

function stringifyMeta(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map(stringifyMeta).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '[object]';
    }
  }
  return String(value);
}

function getCurrentProjectRef() {
  return window.currentProjectPath || '';
}

function getCurrentEpisodeRef() {
  return window.currentEpisodePath || '';
}

function getProjectNameFromPath() {
  const parts = getCurrentProjectRef().replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

function getEpisodeNameFromPath() {
  const parts = getCurrentEpisodeRef().replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

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

window.escapeHtml = escapeHtml;
window.escapeJsString = escapeJsString;
window.toNfdataUrl = toNfdataUrl;
window.formatTimecode = formatTimecode;
window.formatClock = formatClock;
window.formatEditorTimecode = (seconds) => formatClock(seconds, true);
window.formatExportPercent = formatExportPercent;
window.formatExportEta = formatExportEta;
window.formatBytes = formatBytes;
window.langLabel = langLabel;
window.formatResolution = formatResolution;
window.humanizeSlug = humanizeSlug;
window.formatSourceTitle = formatSourceTitle;
window.stringifyMeta = stringifyMeta;
window.getCurrentProjectRef = getCurrentProjectRef;
window.getCurrentEpisodeRef = getCurrentEpisodeRef;
window.getProjectNameFromPath = getProjectNameFromPath;
window.getEpisodeNameFromPath = getEpisodeNameFromPath;
window.normalizeSegmentPreviewParams = normalizeSegmentPreviewParams;
window.fallbackSegmentPreviewParams = fallbackSegmentPreviewParams;
