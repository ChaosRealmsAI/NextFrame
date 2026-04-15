window.currentProjectPath = '';
window.currentProjectName = '';
window.currentEpisodePath = '';
window.currentEpisodeName = '';

const STAGE_TO_TAB: Record<string, string> = {
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
});

let topbarComponent: Component | null = null;
let settingsPanelComponent: Component | null = null;
let homeViewComponent: Component | null = null;
let newProjectModalComponent: (Component & { toggle?(): void }) | null = null;
let transportComponent: Component | null = null;

function syncTopbar(): void {
  if (!topbarComponent) return;
  topbarComponent.update({
    currentView: appStore.get('currentView'),
    currentProjectName: window.currentProjectName,
    currentEpisodeName: window.currentEpisodeName,
    activeTab: appStore.get('activeTab'),
  });
}

function switchTabByStage(stage: string): void {
  const targetStage = stage in STAGE_TO_TAB ? stage : 'script';
  appStore.set('activeTab', targetStage);
  document.querySelectorAll<HTMLElement>('.tb-pl-tab').forEach((tabEl) => {
    tabEl.classList.toggle('active', tabEl.dataset.stage === targetStage);
  });
  document.querySelectorAll('.pl-tab-content').forEach((panel) => panel.classList.remove('active'));
  const target = document.getElementById(STAGE_TO_TAB[targetStage]);
  if (target) target.classList.add('active');
  syncTopbar();
}

function showView(viewName: string, data?: Record<string, unknown>): void {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  if (viewName === 'project') {
    if (data && data.path) {
      window.currentProjectPath = data.path as string;
      window.currentProjectName = (data.name || '') as string;
    }
    const nameEl = document.getElementById('vp-project-name');
    if (nameEl) nameEl.textContent = window.currentProjectName;
    if (typeof loadEpisodes === 'function') loadEpisodes();
  }

  if (viewName === 'pipeline') {
    if (data && data.episodePath) {
      window.currentEpisodePath = data.episodePath as string;
      window.currentEpisodeName = (data.episodeName || '') as string;
    }
    switchTabByStage((appStore.get('activeTab') as string) || 'script');
    if (typeof loadPipelineData === 'function') loadPipelineData();
    if (typeof loadEditorTimeline === 'function') loadEditorTimeline();
    if (typeof loadSmartClips === 'function') loadSmartClips();
  }

  appStore.set('currentView', viewName);
  syncTopbar();
}

function switchTab(tab: string): void {
  switchTabByStage(tab || 'script');
}

function toggleSettings(): void {
  const next = !appStore.get('settingsOpen');
  appStore.set('settingsOpen', next);
  if (settingsPanelComponent) settingsPanelComponent.update({ open: next });
}

function toggleNewProject(): void {
  if (newProjectModalComponent && newProjectModalComponent.toggle) newProjectModalComponent.toggle();
}

function mountComponent(rootId: string, instance: Component): Component | null {
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
      newProject: document.getElementById('new-project-modal')?.classList.contains('open') || false,
    },
    actions: Array.from(document.querySelectorAll<HTMLElement>('[data-nf-action]')).map((el) => el.dataset.nfAction),
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
  homeViewComponent = mountComponent('home-root', new HomeView());
  newProjectModalComponent = mountComponent('new-project-root', new NewProjectModal({
    overlayId: 'new-project-overlay',
    panelId: 'new-project-modal',
    overlayAction: 'close-modal',
    panelAction: 'new-project-modal',
    onOverlayClick: () => toggleNewProject(),
  })) as (Component & { toggle?(): void }) | null;
  transportComponent = mountComponent('transport-root', new TransportControls());

  window.__nfHomeView = homeViewComponent as typeof window.__nfHomeView;
  window.__nfNewProjectModal = newProjectModalComponent as typeof window.__nfNewProjectModal;
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
window.toggleNewProject = toggleNewProject;
window.STAGE_TO_TAB = STAGE_TO_TAB;
