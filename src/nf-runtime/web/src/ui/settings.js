function createMarkupNode(markup) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = markup;
  return wrapper.firstElementChild || document.createTextNode('');
}

function createSelect(options, activeValue) {
  return h(
    'div',
    { class: 'nf-select', 'data-value': activeValue },
    h(
      'div',
      {
        class: 'nf-select-trigger',
        'data-nf-action': 'toggle-select',
        onclick: (event) => window.toggleSelect(event.currentTarget),
      },
      h('span', { class: 'nf-select-value' }, options.find((option) => option.value === activeValue)?.label || options[0].label),
      h('span', { class: 'nf-select-arrow' }, '▾'),
    ),
    h(
      'div',
      { class: 'nf-select-dropdown' },
      options.map((option) =>
        h(
          'div',
          {
            class: 'nf-select-option' + (option.value === activeValue ? ' active' : ''),
            'data-val': option.value,
            'data-nf-action': 'pick-option',
            onclick: (event) => window.pickOption(event.currentTarget),
          },
          option.label,
        ),
      ),
    ),
  );
}

class SettingsPanel extends Modal {
  overlayClassName() {
    return 'settings-overlay';
  }

  panelClassName() {
    return 'settings-panel';
  }

  renderBody() {
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'settings-header' },
        h('span', { class: 'settings-title' }, 'SETTINGS'),
        h(
          'button',
          { class: 'settings-close', 'data-nf-action': 'close-settings', onclick: () => window.toggleSettings() },
          '×',
        ),
      ),
      h(
        'div',
        { class: 'settings-body' },
        h(
          'div',
          { class: 'settings-section' },
          h('div', { class: 'settings-section-title' }, 'GENERAL'),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Language'),
            createSelect([
              { value: 'en', label: 'English' },
              { value: 'zh', label: '简体中文' },
              { value: 'ja', label: '日本語' },
            ], 'zh'),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Project Path'),
            h('span', { class: 'settings-value' }, '~/NextFrame/projects'),
          ),
        ),
        h(
          'div',
          { class: 'settings-section' },
          h('div', { class: 'settings-section-title' }, 'EXPORT'),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Resolution'),
            createSelect([
              { value: '1080p', label: '1920×1080' },
              { value: '4k', label: '3840×2160' },
              { value: '720p', label: '1280×720' },
            ], '1080p'),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'FPS'),
            createSelect([
              { value: '30', label: '30' },
              { value: '24', label: '24' },
              { value: '60', label: '60' },
            ], '30'),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Codec'),
            createSelect([
              { value: 'h264', label: 'h264' },
              { value: 'h265', label: 'h265' },
              { value: 'prores', label: 'ProRes' },
            ], 'h264'),
          ),
        ),
        h(
          'div',
          { class: 'settings-section' },
          h('div', { class: 'settings-section-title' }, 'ABOUT'),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Version'),
            h('span', { class: 'settings-value' }, 'NextFrame v0.5'),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Shell'),
            h('span', { class: 'settings-value' }, 'objc2 + AppKit'),
          ),
        ),
      ),
    );
  }
}

class AIPromptsModal extends Modal {
  renderBody() {
    const sections = Array.isArray(window.AI_PROMPTS) ? window.AI_PROMPTS : [];
    return h(
      'div',
      {
        id: this.props.panelId,
        class: 'modal-panel' + (this.props.open ? ' open' : ''),
        'data-nf-action': this.props.panelAction || 'ai-modal',
        style: { width: '520px', maxHeight: '580px' },
      },
      h(
        'div',
        { class: 'modal-header' },
        h('span', { class: 'modal-title' }, '✨ AI 指令库'),
        h('button', { class: 'settings-close', 'data-nf-action': 'close-modal', onclick: () => window.toggleAIPrompts() }, '×'),
      ),
      h(
        'div',
        { class: 'modal-body', id: 'ai-prompts-body' },
        sections.map((section) =>
          h(
            'div',
            { class: 'prompt-section' },
            h('div', { class: 'prompt-section-title' }, section.icon + ' ' + section.title),
            section.prompts.map((prompt) =>
              h(
                'div',
                {
                  class: 'prompt-item',
                  'data-nf-action': 'copy-ai-prompt',
                  onclick: (event) => window.copyPrompt(event.currentTarget),
                },
                h('span', { class: 'prompt-text' }, prompt),
                h('span', { class: 'prompt-copy' }, '复制'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  renderPanel() {
    return this.renderBody();
  }
}

function copyPrompt(el) {
  const text = el.querySelector('.prompt-text')?.textContent || '';
  const copy = el.querySelector('.prompt-copy');
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  if (!copy) return;
  copy.textContent = '已复制';
  copy.classList.add('copied');
  window.setTimeout(() => {
    copy.textContent = '复制';
    copy.classList.remove('copied');
  }, 1500);
}

function toggleSelect(trigger) {
  const select = trigger.closest('.nf-select');
  document.querySelectorAll('.nf-select.open').forEach((item) => {
    if (item !== select) item.classList.remove('open');
  });
  if (select) select.classList.toggle('open');
}

function pickOption(option) {
  const select = option.closest('.nf-select');
  if (!select) return;
  const valueEl = select.querySelector('.nf-select-value');
  if (valueEl) valueEl.textContent = option.textContent;
  select.querySelectorAll('.nf-select-option').forEach((item) => item.classList.remove('active'));
  option.classList.add('active');
  select.classList.remove('open');
  if (option.dataset.val) select.dataset.value = option.dataset.val;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('.nf-select')) return;
  document.querySelectorAll('.nf-select.open').forEach((item) => item.classList.remove('open'));
});

window.SettingsPanel = SettingsPanel;
window.AIPromptsModal = AIPromptsModal;
window.copyPrompt = copyPrompt;
window.toggleSelect = toggleSelect;
window.pickOption = pickOption;
window.createMarkupNode = createMarkupNode;
