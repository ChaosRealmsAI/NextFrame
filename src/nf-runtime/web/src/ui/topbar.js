"use strict";
class Topbar extends Component {
    icon(markup) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = markup;
        return wrapper.firstElementChild || document.createTextNode('');
    }
    renderPipelineTab(stage, label) {
        const isActive = this.props.activeTab === stage;
        return h('div', {
            class: 'tb-pl-tab' + (isActive ? ' active' : ''),
            'data-stage': stage,
            'data-nf-action': 'tab-' + stage,
            onclick: () => window.switchTabByStage(stage),
        }, label);
    }
    render() {
        const currentView = this.props.currentView || 'home';
        const showBreadcrumb = currentView !== 'home';
        const showPipelineTabs = currentView === 'pipeline';
        const currentProjectName = this.props.currentProjectName || '项目';
        const currentEpisodeName = this.props.currentEpisodeName || '剧集';
        const projectClickable = currentView === 'pipeline';
        return h('header', { class: 'topbar', id: 'global-topbar' }, h('div', { class: 'tb-traffic-lights' }, h('div', { class: 'tb-dot tb-dot--close' }), h('div', { class: 'tb-dot tb-dot--minimize' }), h('div', { class: 'tb-dot tb-dot--zoom' })), h('div', {
            class: 'tb-brand',
            style: { cursor: 'pointer' },
            'data-nf-action': 'go-home',
            onclick: () => window.showView('home'),
        }, this.icon('<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="4" stroke="#a78bfa" stroke-width="1.5" fill="none"/><polygon points="7,5 13,9 7,13" fill="#a78bfa"/></svg>'), ' NextFrame '), h('nav', { class: 'tb-breadcrumb', id: 'global-breadcrumb', style: { display: showBreadcrumb ? 'flex' : 'none' } }, h('span', { class: 'tb-bc-sep' }, '/'), h('span', {
            class: 'tb-bc-item' + (projectClickable ? '' : ' tb-bc-current'),
            id: 'bc-level1',
            'data-view': projectClickable ? 'project' : '',
            'data-nf-action': projectClickable ? 'nav-project' : 'nav-home',
            onclick: projectClickable ? () => window.showView('project') : null,
            style: { cursor: projectClickable ? 'pointer' : 'default' },
        }, String(currentProjectName)), h('span', { class: 'tb-bc-sep', id: 'bc-sep2', style: { display: showPipelineTabs ? '' : 'none' } }, '/'), h('span', { class: 'tb-bc-item tb-bc-current', id: 'bc-level2' }, showPipelineTabs ? String(currentEpisodeName) : '')), h('div', { class: 'tb-pipeline-tabs', id: 'global-pl-tabs', style: { display: showPipelineTabs ? 'flex' : 'none' } }, this.renderPipelineTab('script', '脚本'), this.renderPipelineTab('audio', '音频'), this.renderPipelineTab('clips', '智能切片'), this.renderPipelineTab('atoms', '原子'), this.renderPipelineTab('assembly', '智能剪辑'), this.renderPipelineTab('output', '产出')), h('div', { class: 'tb-spacer' }), h('button', {
            class: 'tb-icon-btn',
            title: 'Settings',
            'data-nf-action': 'open-settings',
            onclick: () => window.toggleSettings(),
        }, this.icon('<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 2h3l.4 1.5a5 5 0 0 1 1.2.7L12.8 3.5l1.5 2.6-1.3 1a5 5 0 0 1 0 1.4l1.3 1-1.5 2.6-1.7-.7a5 5 0 0 1-1.2.7L9.5 14h-3l-.4-1.5a5 5 0 0 1-1.2-.7L3.2 12.5 1.7 9.9l1.3-1a5 5 0 0 1 0-1.4l-1.3-1 1.5-2.6 1.7.7a5 5 0 0 1 1.2-.7Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>')), h('div', { class: 'tb-avatar' }, 'Z'));
    }
}
window.Topbar = Topbar;
