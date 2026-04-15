"use strict";
function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60)
        return minutes + ' 分钟前';
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return hours + ' 小时前';
    const days = Math.floor(hours / 24);
    if (days < 7)
        return days + ' 天前';
    const weeks = Math.floor(days / 7);
    return weeks + ' 周前';
}
function buildProjectThumb(project) {
    const thumbUrl = project.thumbnail ? 'nfdata://localhost/' + encodeURI(String(project.name || '')) + '/' + project.thumbnail : '';
    if (!thumbUrl) {
        return h('div', { class: 'card-thumb' }, createMarkupNode('<svg class="card-thumb-icon" width="32" height="32" viewBox="0 0 32 32" fill="none"><polygon points="12,8 24,16 12,24" fill="currentColor"/></svg>'));
    }
    return h('div', {
        class: 'card-thumb',
        style: {
            backgroundImage: 'url(' + thumbUrl + ')',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        },
    });
}
function buildProjectCardElement(project) {
    return h('div', {
        class: 'project-card glass',
        'data-nf-action': 'open-project',
        'data-path': project.path || '',
        onclick: () => window.showView('project', { name: project.name || 'Untitled', path: project.path || '' }),
    }, buildProjectThumb(project), h('div', { class: 'card-body' }, h('div', { class: 'card-title' }, String(project.name || 'Untitled')), h('div', { class: 'card-meta' }, h('span', { class: 'card-badge' }, String(project.episodes || 0) + ' 集'), h('span', { class: 'card-time' }, project.updated ? timeAgo(project.updated) : ''))));
}
function renderCard(project) {
    const safeName = escapeJsString(String(project.name || 'Untitled'));
    const safePath = escapeJsString(String(project.path || ''));
    const thumbUrl = project.thumbnail ? 'nfdata://localhost/' + encodeURI(String(project.name || '')) + '/' + project.thumbnail : '';
    const thumbStyle = thumbUrl ? ' style="background-image:url(' + thumbUrl + ');background-size:cover;background-position:center"' : '';
    return '<div class="project-card glass" data-nf-action="open-project" data-path="' + escapeHtml(String(project.path || '')) + '" onclick="showView(\'project\',{name:\'' + safeName + '\',path:\'' + safePath + '\'})">' +
        '<div class="card-thumb"' + thumbStyle + '>' +
        (thumbUrl ? '' : '<svg class="card-thumb-icon" width="32" height="32" viewBox="0 0 32 32" fill="none"><polygon points="12,8 24,16 12,24" fill="currentColor"/></svg>') +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-title">' + escapeHtml(String(project.name || 'Untitled')) + '</div>' +
        '<div class="card-meta"><span class="card-badge">' + String(project.episodes || 0) + ' 集</span>' +
        '<span class="card-time">' + (project.updated ? timeAgo(project.updated) : '') + '</span></div>' +
        '</div></div>';
}
class NewProjectModal extends Modal {
    constructor(props = {}) {
        super(props);
        this.state = {
            name: '',
            path: '~/NextFrame/projects',
            ratio: '16:9',
            tags: [],
            tagInput: '',
            open: false,
        };
    }
    isOpen() {
        return !!this.state.open;
    }
    syncDraftFromDom() {
        const nameEl = document.getElementById('np-name');
        const pathEl = document.getElementById('np-path');
        const tagInputEl = document.getElementById('np-tag-input');
        if (nameEl)
            this.state.name = nameEl.value;
        if (pathEl)
            this.state.path = pathEl.textContent || this.state.path;
        if (tagInputEl)
            this.state.tagInput = tagInputEl.value;
    }
    toggle() {
        this.syncDraftFromDom();
        this.setState({ open: !this.state.open });
    }
    close() {
        this.syncDraftFromDom();
        this.setState({ open: false });
    }
    addTagFromInput(event) {
        const target = event.currentTarget;
        const value = (target.value || '').trim();
        if (event.key !== ' ' || !value.startsWith('#') || value.length <= 1)
            return;
        const tags = this.state.tags;
        if (tags.length >= 5) {
            target.value = '';
            return;
        }
        this.syncDraftFromDom();
        this.setState({ tags: tags.concat(value), tagInput: '' });
    }
    removeTag(tag) {
        this.syncDraftFromDom();
        this.setState({ tags: this.state.tags.filter((item) => item !== tag) });
    }
    setRatio(ratio) {
        this.syncDraftFromDom();
        this.setState({ ratio });
    }
    createProject() {
        this.syncDraftFromDom();
        const name = this.state.name || 'Untitled';
        const path = this.state.path || '~/NextFrame/projects';
        if (typeof bridgeCall === 'function') {
            bridgeCall('project.create', { name, path, ratio: this.state.ratio, tags: this.state.tags }).then(() => {
                this.close();
                loadProjects();
            });
            return;
        }
        this.close();
    }
    renderRatioCard(ratio, desc, previewClass) {
        const active = this.state.ratio === ratio;
        return h('div', {
            class: 'ratio-card' + (active ? ' active' : ''),
            'data-nf-action': 'select-ratio',
            onclick: () => this.setRatio(ratio),
        }, h('div', { class: 'ratio-preview ' + previewClass }), h('span', { class: 'ratio-label' }, ratio), h('span', { class: 'ratio-desc' }, desc));
    }
    renderBody() {
        return h('div', { class: 'modal-panel' + (this.state.open ? ' open' : ''), id: 'new-project-modal', 'data-nf-action': 'new-project-modal' }, h('div', { class: 'modal-header' }, h('span', { class: 'modal-title' }, '新建项目'), h('button', { class: 'settings-close', 'data-nf-action': 'close-modal', onclick: () => window.toggleNewProject() }, '×')), h('div', { class: 'modal-body' }, h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, '项目名称'), h('input', {
            class: 'form-input',
            type: 'text',
            placeholder: 'My Video Project',
            id: 'np-name',
            'data-nf-action': 'input-name',
            value: this.state.name,
        })), h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, '保存位置'), h('div', { class: 'form-path-row' }, h('span', { class: 'form-path', id: 'np-path' }, String(this.state.path || '')), h('button', { class: 'form-path-btn', 'data-nf-action': 'select-folder', onclick: () => window.alert('选择文件夹') }, '选择'))), h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, '画面比例'), h('div', { class: 'ratio-grid' }, this.renderRatioCard('16:9', '横屏', 'r-16-9'), this.renderRatioCard('9:16', '竖屏', 'r-9-16'), this.renderRatioCard('1:1', '方形', 'r-1-1'), this.renderRatioCard('4:3', 'PPT', 'r-4-3'))), h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, '标签 ', h('span', { style: { color: 'var(--t50)', fontWeight: '400' } }, '（最多 5 个，输入 # 加空格添加）')), h('div', { class: 'tag-input-wrap', id: 'np-tag-wrap' }, ...this.state.tags.map((tag) => h('span', { class: 'tag-pill' }, tag + ' ', h('span', { class: 'tag-pill-x', 'data-nf-action': 'remove-tag', onclick: () => this.removeTag(tag) }, '×'))), h('input', {
            class: 'tag-input',
            type: 'text',
            placeholder: '# 输入标签后按空格',
            id: 'np-tag-input',
            'data-nf-action': 'input-tags',
            value: this.state.tagInput,
            onkeyup: (event) => this.addTagFromInput(event),
        })))), h('div', { class: 'modal-footer' }, h('button', { class: 'btn-ghost', 'data-nf-action': 'close-modal', onclick: () => window.toggleNewProject() }, '取消'), h('button', { class: 'btn-primary', 'data-nf-action': 'new-project', onclick: () => this.createProject() }, '创建')));
    }
    renderPanel() {
        return this.renderBody();
    }
}
class HomeView extends Component {
    constructor(props = {}) {
        super(props);
        this.state = { projects: [], search: '' };
    }
    setProjects(projects) {
        this.setState({ projects: Array.isArray(projects) ? projects : [] });
    }
    setSearch(value) {
        this.setState({ search: value || '' });
    }
    filteredProjects() {
        const search = this.state.search.trim().toLowerCase();
        const projects = this.state.projects;
        if (!search)
            return projects;
        return projects.filter((project) => {
            return String(project.name || '').toLowerCase().includes(search);
        });
    }
    renderSection(title, projects) {
        return h('section', { class: 'section' }, h('div', { class: 'section-header' }, h('h2', { class: 'section-title' }, title)), h('div', { class: 'project-grid' }, ...projects.map((project) => buildProjectCardElement(project))));
    }
    render() {
        const filtered = this.filteredProjects();
        const recent = filtered.slice(0, 3);
        return h('main', { class: 'main' }, h('div', { class: 'content' }, h('div', { class: 'action-bar stagger-in' }, h('div', { class: 'tb-search' }, createMarkupNode('<svg class="tb-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'), h('input', {
            class: 'tb-search-input',
            'data-nf-action': 'search',
            type: 'text',
            placeholder: '搜索项目...',
            value: this.state.search,
            oninput: (event) => this.setSearch(event.currentTarget.value),
        })), h('button', { class: 'btn-primary', 'data-nf-action': 'new-project', onclick: () => window.toggleNewProject() }, createMarkupNode('<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'), ' 新建项目 ')), this.renderSection('最近项目', recent), this.renderSection('所有项目', filtered)));
    }
}
function pickRatio(card, ratio) {
    if (window.__nfNewProjectModal)
        window.__nfNewProjectModal.setRatio(ratio);
    if (!card || !card.closest)
        return;
    card.closest('.ratio-grid')?.querySelectorAll('.ratio-card').forEach((item) => item.classList.remove('active'));
    card.classList.add('active');
}
function createProject() {
    if (window.__nfNewProjectModal)
        window.__nfNewProjectModal.createProject();
}
function loadProjects() {
    if (typeof bridgeCall !== 'function')
        return;
    bridgeCall('project.list', {}).then((result) => {
        const data = result.ok === true ? result.value : {};
        const projects = (data.projects || []);
        if (window.__nfHomeView)
            window.__nfHomeView.setProjects(projects);
    }).catch((error) => {
        console.error('[home] load projects failed:', error);
    });
}
window.HomeView = HomeView;
window.NewProjectModal = NewProjectModal;
window.pickRatio = pickRatio;
window.createProject = createProject;
window.timeAgo = timeAgo;
window.renderCard = renderCard;
window.loadProjects = loadProjects;
