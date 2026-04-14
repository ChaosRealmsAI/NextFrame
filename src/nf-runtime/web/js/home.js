function pickRatio(card, ratio) {
  card.closest('.ratio-grid').querySelectorAll('.ratio-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
}

document.getElementById('np-tag-input').addEventListener('keyup', function(e) {
  const wrap = document.getElementById('np-tag-wrap');
  const tags = wrap.querySelectorAll('.tag-pill');
  if (tags.length >= 5) {
    this.value = '';
    return;
  }

  const val = this.value.trim();
  if (e.key === ' ' && val.startsWith('#') && val.length > 1) {
    const tag = val;
    this.value = '';
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = tag + ' <span class="tag-pill-x" data-nf-action="remove-tag" onclick="this.parentElement.remove()">×</span>';
    wrap.insertBefore(pill, this);
  }
});

function createProject() {
  const name = document.getElementById('np-name').value || 'Untitled';
  const path = document.getElementById('np-path').textContent;
  const tags = Array.from(document.querySelectorAll('#np-tag-wrap .tag-pill')).map(p => p.textContent.replace('×', '').trim());
  const ratio = document.querySelector('.ratio-card.active .ratio-label').textContent;
  if (typeof bridgeCall === 'function') {
    bridgeCall('project.create', { name, path, ratio, tags }).then(() => {
      toggleNewProject();
      loadProjects();
    });
  } else {
    toggleNewProject();
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + ' 分钟前';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' 小时前';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + ' 天前';
  const weeks = Math.floor(days / 7);
  return weeks + ' 周前';
}

function renderCard(p) {
  var safeName = (p.name || 'Untitled').replace(/'/g, "\\'");
  var safePath = (p.path || '').replace(/'/g, "\\'");
  return '<div class="project-card glass" data-nf-action="open-project" data-path="' + (p.path || '') + '" onclick="showView(\'project\',{name:\'' + safeName + '\',path:\'' + safePath + '\'})">' +
    '<div class="card-thumb"><svg class="card-thumb-icon" width="32" height="32" viewBox="0 0 32 32" fill="none"><polygon points="12,8 24,16 12,24" fill="currentColor"/></svg></div>' +
    '<div class="card-body">' +
      '<div class="card-title">' + (p.name || 'Untitled') + '</div>' +
      '<div class="card-meta"><span class="card-badge">' + (p.episodes || 0) + ' 集</span>' +
      '<span class="card-time">' + (p.updated ? timeAgo(p.updated) : '') + '</span></div>' +
    '</div></div>';
}

function loadProjects() {
  if (typeof bridgeCall !== 'function') return;
  bridgeCall('project.list', {}).then(data => {
    const projects = data.projects || [];
    const recent = projects.slice(0, 3);
    const all = projects;

    const grids = document.querySelectorAll('.project-grid');
    if (grids[0]) grids[0].innerHTML = recent.map(renderCard).join('');
    if (grids[1]) grids[1].innerHTML = all.map(renderCard).join('');
  }).catch(e => {
    console.error('[home] load projects failed:', e);
  });
}

window.pickRatio = pickRatio;
window.createProject = createProject;
window.timeAgo = timeAgo;
window.renderCard = renderCard;
window.loadProjects = loadProjects;
