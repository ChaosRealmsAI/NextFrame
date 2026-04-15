// Project runtime bindings.
function loadEpisodes(): void {
  if (typeof bridgeCall !== 'function' || !window.currentProjectPath) return;
  bridgeCall<Record<string, unknown>>('episode.list', { project: window.currentProjectPath }).then(function(result: NfBridgeResult<Record<string, unknown>>) {
    const data = result.ok === true ? result.value : {} as Record<string, unknown>;
    const episodes = (data.episodes || []) as Record<string, unknown>[];
    const grid = document.getElementById('vp-episode-grid');
    if (!grid) return;
    let html = '<div class="vp-ep-new glass" data-nf-action="create-episode" onclick="createEpisode()" style="cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:180px"><div style="text-align:center;color:var(--accent)"><div style="font-size:28px;line-height:1">+</div><div style="font-size:13px;margin-top:8px">新建剧集</div></div></div>';
    if (episodes.length === 0) {
      grid.innerHTML = html + '<div class="glass" style="display:flex;align-items:center;justify-content:center;min-height:180px;color:var(--t50)">暂无剧集，点击 + 新建剧集</div>';
      return;
    }
    episodes.forEach(function(ep: Record<string, unknown>, i: number) {
      const num = 'EP' + String(i + 1).padStart(2, '0');
      const segCount = ep.segments || 0;
      html += '<div class="vp-ep-card glass" data-nf-action="open-episode" data-path="' + (ep.path || '') + '" onclick="openEpisode(\'' + String(ep.path || '').replace(/'/g, "\\'") + '\',\'' + String(ep.name || '').replace(/'/g, "\\'") + '\')">' +
        '<div class="vp-ep-thumb">' +
          '<span class="vp-ep-thumb-badge">' + num + '</span>' +
          '<svg class="vp-ep-thumb-icon" width="36" height="36" viewBox="0 0 36 36" fill="none"><polygon points="14,9 27,18 14,27" fill="currentColor"/></svg>' +
        '</div>' +
        '<div class="vp-ep-body">' +
          '<div class="vp-ep-title">' + (ep.name || 'Untitled') + '</div>' +
          '<div class="vp-ep-stats">' +
            '<span class="vp-ep-stat">' + segCount + ' segments</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    grid.innerHTML = html;
  }).catch(function(e: unknown) {
    console.error('[project] load episodes:', e);
  });
}

function renderProjectEpisodes(): void {
  loadEpisodes();
}

function openEpisode(path: string, name: string): void {
  window.currentEpisodePath = path;
  window.currentEpisodeName = name;
  showView('pipeline', { projectName: window.currentProjectName, episodeName: name, episodePath: path });
}

function createEpisode(): void {
  const name = prompt('输入剧集名称:');
  if (!name || !name.trim()) return;
  if (typeof bridgeCall !== 'function' || !window.currentProjectPath) return;
  bridgeCall('episode.create', { project: window.currentProjectPath, name: name.trim() }).then(function() {
    loadEpisodes();
  }).catch(function(e: unknown) {
    console.error('[project] create episode:', e);
  });
}

window.loadEpisodes = loadEpisodes;
window.renderProjectEpisodes = renderProjectEpisodes;
window.openEpisode = openEpisode;
window.createEpisode = createEpisode;
