function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function toNfdataUrl(path: string): string {
  if (!path) return '';
  const marker = path.indexOf('/projects/');
  return marker < 0 ? path : 'nfdata://localhost/' + encodeURI(path.slice(marker + '/projects/'.length));
}

function formatTimecode(ms: number): string {
  const seconds = (ms || 0) / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return String(minutes).padStart(2, '0') + ':' + remainder;
}

function formatClock(totalSeconds: number, withTenths?: boolean): string {
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

function formatExportPercent(percent: unknown): string {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return '0%';
  return Math.max(0, Math.min(100, percent)).toFixed(1) + '%';
}

function formatExportEta(eta: unknown): string {
  if (typeof eta !== 'number' || Number.isNaN(eta) || eta <= 0) return '--';
  if (eta < 60) return Math.round(eta) + 's';
  const minutes = Math.floor(eta / 60);
  const seconds = Math.round(eta % 60);
  return minutes + 'm ' + seconds + 's';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? Math.round(mb) + 'MB' : mb.toFixed(1) + 'MB';
}

function langLabel(key: string): string {
  const labels: Record<string, string> = { zh: '中', ja: '日', ko: '韩', fr: 'FR', es: 'ES', de: 'DE' };
  return labels[key] || String(key || '').slice(0, 2).toUpperCase();
}

function formatResolution(width: number, height: number): string {
  if (!Number.isFinite(height) || height <= 0) return '—';
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (width > 0) return width + '×' + height;
  return String(height) + 'p';
}

function humanizeSlug(value: string): string {
  return String(value || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSourceTitle(source: NfSource, index?: number): string {
  if (source && source.meta && typeof (source.meta as Record<string, unknown>).title === 'string' && ((source.meta as Record<string, unknown>).title as string).trim()) {
    return ((source.meta as Record<string, unknown>).title as string).trim();
  }
  if (source && (source as Record<string, unknown>).planTitle && ((source as Record<string, unknown>).planTitle as string).trim()) {
    return ((source as Record<string, unknown>).planTitle as string).trim();
  }
  return humanizeSlug(((source as Record<string, unknown>)?.slug as string) || ('source-' + index));
}

function stringifyMeta(value: unknown): string {
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

function getCurrentProjectRef(): string {
  return window.currentProjectPath || '';
}

function getCurrentEpisodeRef(): string {
  return window.currentEpisodePath || '';
}

function getProjectNameFromPath(): string {
  const parts = getCurrentProjectRef().replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

function getEpisodeNameFromPath(): string {
  const parts = getCurrentEpisodeRef().replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

function normalizeSegmentPreviewParams(segmentName: string): Record<string, unknown> {
  return {
    project: getCurrentProjectRef(),
    episode: getCurrentEpisodeRef(),
    segment: segmentName,
  };
}

function fallbackSegmentPreviewParams(segmentName: string): Record<string, unknown> {
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
window.formatEditorTimecode = (seconds: number) => formatClock(seconds, true);
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
