function loadEpisodes() {
  if (typeof bridgeCall !== 'function' || !window.currentProjectPath) return;
  bridgeCall('episode.list', { project: window.currentProjectPath }).then(function(data) {
    const episodes = data.episodes || [];
    const grid = document.getElementById('vp-episode-grid');
    if (!grid) return;
    if (episodes.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--t50)">暂无剧集，点击上方 + 新建</div>';
      return;
    }
    let html = '';
    episodes.forEach(function(ep, i) {
      const num = 'EP' + String(i + 1).padStart(2, '0');
      const segCount = ep.segments || 0;
      html += '<div class="vp-ep-card glass" data-nf-action="open-episode" data-path="' + (ep.path || '') + '" onclick="openEpisode(\'' + (ep.path || '').replace(/'/g, "\\'") + '\',\'' + (ep.name || '').replace(/'/g, "\\'") + '\')">' +
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
  }).catch(function(e) {
    console.error('[project] load episodes:', e);
  });
}

function renderProjectEpisodes() {
  loadEpisodes();
}

function openEpisode(path, name) {
  window.currentEpisodePath = path;
  window.currentEpisodeName = name;
  showView('pipeline', { projectName: window.currentProjectName, episodeName: name, episodePath: path });
}

window.loadEpisodes = loadEpisodes;
window.renderProjectEpisodes = renderProjectEpisodes;
window.openEpisode = openEpisode;
