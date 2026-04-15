// Project runtime bindings.
function loadEpisodes() {
  if (typeof bridgeCall !== 'function' || !window.currentProjectPath) return;
  bridgeCall('episode.list', { project: window.currentProjectPath }).then(function(data) {
    const episodes = data.episodes || [];
    const grid = document.getElementById('vp-episode-grid');
    if (!grid) return;
    let html = '<div class="vp-ep-new glass" data-nf-action="create-episode" onclick="createEpisode()" style="cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:180px"><div style="text-align:center;color:var(--accent)"><div style="font-size:28px;line-height:1">+</div><div style="font-size:13px;margin-top:8px">新建剧集</div></div></div>';
    if (episodes.length === 0) {
      grid.innerHTML = html + '<div class="glass" style="display:flex;align-items:center;justify-content:center;min-height:180px;color:var(--t50)">暂无剧集，点击 + 新建剧集</div>';
      return;
    }
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

function createEpisode() {
  const name = prompt('输入剧集名称:');
  if (!name || !name.trim()) return;
  if (typeof bridgeCall !== 'function' || !window.currentProjectPath) return;
  bridgeCall('episode.create', { project: window.currentProjectPath, name: name.trim() }).then(function() {
    loadEpisodes();
  }).catch(function(e) {
    console.error('[project] create episode:', e);
  });
}

window.loadEpisodes = loadEpisodes;
window.renderProjectEpisodes = renderProjectEpisodes;
window.openEpisode = openEpisode;
window.createEpisode = createEpisode;
