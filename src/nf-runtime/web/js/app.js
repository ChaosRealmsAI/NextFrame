// Navigation state shared across runtime scripts.
window.currentProjectPath = '';
window.currentProjectName = '';
window.currentEpisodePath = '';
window.currentEpisodeName = '';

const STAGE_TO_TAB = {
  script: 'pl-tab-script',
  audio: 'pl-tab-audio',
  clips: 'pl-tab-asset',
  atoms: 'pl-tab-atom',
  assembly: 'pl-tab-edit',
  output: 'pl-tab-output',
};

function showView(viewName, data) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  const bc = document.getElementById('global-breadcrumb');
  const plTabs = document.getElementById('global-pl-tabs');
  const bc1 = document.getElementById('bc-level1');
  const bc2 = document.getElementById('bc-level2');
  const sep2 = document.getElementById('bc-sep2');

  bc.style.display = 'none';
  plTabs.style.display = 'none';
  sep2.style.display = 'none';
  bc2.textContent = '';
  bc1.dataset.nfAction = 'nav-home';

  if (viewName === 'home') {
    return;
  }

  if (viewName === 'project') {
    if (data?.path) {
      window.currentProjectPath = data.path;
      window.currentProjectName = data.name || '';
    }
    bc.style.display = 'flex';
    bc1.textContent = window.currentProjectName || '项目';
    bc1.dataset.view = '';
    bc1.style.cursor = 'default';
    bc1.classList.add('tb-bc-current');
    const nameEl = document.getElementById('vp-project-name');
    if (nameEl) nameEl.textContent = window.currentProjectName;
    loadEpisodes();
    return;
  }

  if (viewName === 'pipeline') {
    if (data?.episodePath) {
      window.currentEpisodePath = data.episodePath;
      window.currentEpisodeName = data.episodeName || '';
    }
    bc.style.display = 'flex';
    plTabs.style.display = 'flex';
    bc1.textContent = window.currentProjectName || '项目';
    bc1.dataset.view = 'project';
    bc1.dataset.nfAction = 'nav-project';
    bc1.style.cursor = 'pointer';
    bc1.classList.remove('tb-bc-current');
    sep2.style.display = '';
    bc2.textContent = window.currentEpisodeName || '剧集';
    loadPipelineData();
    loadEditorTimeline();
    if (typeof loadSmartClips === 'function') loadSmartClips();
  }
}

function switchTab(tabEl) {
  document.querySelectorAll('.tb-pl-tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');

  const stage = tabEl.dataset.stage;
  const targetId = STAGE_TO_TAB[stage];
  document.querySelectorAll('.pl-tab-content').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');
}

window.__nfDiagnose = function() {
  return JSON.stringify({
    currentView: document.querySelector('.view.active')?.id || 'none',
    currentProject: window.currentProjectPath || null,
    currentEpisode: window.currentEpisodePath || null,
    projectCards: document.querySelectorAll('.project-card').length,
    episodeCards: document.querySelectorAll('.vp-ep-card').length,
    activeTab: document.querySelector('.tb-pl-tab.active')?.dataset.stage || null,
    modals: {
      settings: document.getElementById('settings-panel')?.classList.contains('open') || false,
      aiPrompts: document.getElementById('ai-modal')?.classList.contains('open') || false,
      newProject: document.getElementById('new-project-modal')?.classList.contains('open') || false,
    },
    actions: Array.from(document.querySelectorAll('[data-nf-action]')).map(e => e.dataset.nfAction),
  }, null, 2);
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadProjects, 500);
  renderEditorClipList();
  renderEditorTimeline();
  renderEditorInspector();
  renderProjectEpisodes();
});

window.showView = showView;
window.switchTab = switchTab;
window.STAGE_TO_TAB = STAGE_TO_TAB;
