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
  'smart-edit': 'pl-tab-edit',
  output: 'pl-tab-output',
};

const appStore = new Store({
  currentView: 'home',
  activeTab: 'script',
  settingsOpen: false,
  aiPromptsOpen: false,
});

let topbarComponent: any = null;
let settingsPanelComponent: any = null;
let aiPromptsModalComponent: any = null;
let homeViewComponent = null;
let newProjectModalComponent: any = null;
let transportComponent = null;

function syncTopbar() {
  if (!topbarComponent) return;
  topbarComponent.update({
    currentView: appStore.get('currentView'),
    currentProjectName: window.currentProjectName,
    currentEpisodeName: window.currentEpisodeName,
    activeTab: appStore.get('activeTab'),
  });
}

function switchTabByStage(stage: any) {
  const targetStage = stage in STAGE_TO_TAB ? stage : 'script';
  appStore.set('activeTab', targetStage);
  document.querySelectorAll('.tb-pl-tab').forEach((tabEl) => {
    tabEl.classList.toggle('active', tabEl.dataset.stage === targetStage);
  });
  document.querySelectorAll('.pl-tab-content').forEach((panel) => panel.classList.remove('active'));
  const target = document.getElementById(STAGE_TO_TAB[targetStage]);
  if (target) target.classList.add('active');
  syncTopbar();
}

function showView(viewName: any, data: any) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  if (viewName === 'project') {
    if (data && data.path) {
      window.currentProjectPath = data.path;
      window.currentProjectName = data.name || '';
    }
    const nameEl = document.getElementById('vp-project-name');
    if (nameEl) nameEl.textContent = window.currentProjectName;
    if (typeof loadEpisodes === 'function') loadEpisodes();
  }

  if (viewName === 'pipeline') {
    if (data && data.episodePath) {
      window.currentEpisodePath = data.episodePath;
      window.currentEpisodeName = data.episodeName || '';
    }
    switchTabByStage(appStore.get('activeTab') || 'script');
    if (typeof loadPipelineData === 'function') loadPipelineData();
    if (typeof loadEditorTimeline === 'function') loadEditorTimeline();
    if (typeof loadSmartClips === 'function') loadSmartClips();
  }

  appStore.set('currentView', viewName);
  syncTopbar();
}

function switchTab(tabEl: any) {
  if (!tabEl) return;
  switchTabByStage(tabEl.dataset.stage || 'script');
}

function toggleSettings() {
  const next = !appStore.get('settingsOpen');
  appStore.set('settingsOpen', next);
  if (settingsPanelComponent) settingsPanelComponent.update({ open: next });
}

function toggleAIPrompts() {
  const next = !appStore.get('aiPromptsOpen');
  appStore.set('aiPromptsOpen', next);
  if (aiPromptsModalComponent) aiPromptsModalComponent.update({ open: next });
}

function toggleNewProject() {
  if (newProjectModalComponent) newProjectModalComponent.toggle();
}

function mountComponent(rootId: any, instance: any) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  instance.mount(root);
  return instance;
}

window.__nfDiagnose = function() {
  return JSON.stringify({
    currentView: document.querySelector('.view.active')?.id || 'none',
    currentProject: window.currentProjectPath || null,
    currentEpisode: window.currentEpisodePath || null,
    projectCards: document.querySelectorAll('.project-card').length,
    episodeCards: document.querySelectorAll('.vp-ep-card').length,
    activeTab: appStore.get('activeTab'),
    modals: {
      settings: document.getElementById('settings-panel')?.classList.contains('open') || false,
      aiPrompts: document.getElementById('ai-modal')?.classList.contains('open') || false,
      newProject: document.getElementById('new-project-modal')?.classList.contains('open') || false,
    },
    actions: Array.from(document.querySelectorAll('[data-nf-action]')).map((el) => el.dataset.nfAction),
    editor: typeof window.__nfEditorDiagnose === 'function' ? JSON.parse(window.__nfEditorDiagnose()) : null,
  }, null, 2);
};

document.addEventListener('DOMContentLoaded', () => {
  topbarComponent = mountComponent('topbar-root', new Topbar({
    currentView: 'home',
    currentProjectName: '',
    currentEpisodeName: '',
    activeTab: 'script',
  }));
  settingsPanelComponent = mountComponent('settings-root', new SettingsPanel({
    open: false,
    overlayId: 'settings-overlay',
    panelId: 'settings-panel',
    overlayAction: 'close-settings',
    panelAction: 'settings-panel',
    onOverlayClick: () => toggleSettings(),
  }));
  aiPromptsModalComponent = mountComponent('ai-prompts-root', new AIPromptsModal({
    open: false,
    overlayId: 'ai-overlay',
    panelId: 'ai-modal',
    overlayAction: 'close-modal',
    panelAction: 'ai-modal',
    onOverlayClick: () => toggleAIPrompts(),
  }));
  homeViewComponent = mountComponent('home-root', new HomeView());
  newProjectModalComponent = mountComponent('new-project-root', new NewProjectModal({
    overlayId: 'new-project-overlay',
    panelId: 'new-project-modal',
    overlayAction: 'close-modal',
    panelAction: 'new-project-modal',
    onOverlayClick: () => toggleNewProject(),
  }));
  transportComponent = mountComponent('transport-root', new TransportControls());

  window.__nfHomeView = homeViewComponent;
  window.__nfNewProjectModal = newProjectModalComponent;
  window.__nfStore = appStore;

  syncTopbar();
  switchTabByStage('script');
  window.setTimeout(loadProjects, 500);
  renderEditorClipList();
  renderEditorTimeline();
  renderEditorInspector();
  renderProjectEpisodes();
});

window.showView = showView;
window.switchTab = switchTab;
window.switchTabByStage = switchTabByStage;
window.toggleSettings = toggleSettings;
window.toggleAIPrompts = toggleAIPrompts;
window.toggleNewProject = toggleNewProject;
window.STAGE_TO_TAB = STAGE_TO_TAB;
