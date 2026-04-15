function createMarkupNode(markup: string): Node {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = markup;
  return wrapper.firstElementChild || document.createTextNode('');
}

interface SelectOption {
  value: string;
  label: string;
}

function createSelect(options: SelectOption[], activeValue: string, onPick: (value: string) => void) {
  return h(
    'div',
    { class: 'nf-select', 'data-value': activeValue },
    h(
      'div',
      {
        class: 'nf-select-trigger',
        'data-nf-action': 'toggle-select',
        onclick: (event: MouseEvent) => window.toggleSelect((event.currentTarget as HTMLElement)),
      },
      h('span', { class: 'nf-select-value' }, options.find((option: SelectOption) => option.value === activeValue)?.label || options[0].label),
      h('span', { class: 'nf-select-arrow' }, '▾'),
    ),
    h(
      'div',
      { class: 'nf-select-dropdown' },
      ...options.map((option: SelectOption) => h(
        'div',
        {
          class: 'nf-select-option' + (option.value === activeValue ? ' active' : ''),
          'data-val': option.value,
          'data-nf-action': 'pick-option',
          onclick: (event: MouseEvent) => {
            window.pickOption((event.currentTarget as HTMLElement));
            if (typeof onPick === 'function') onPick(option.value);
          },
        },
        option.label,
      ),
      ),
    ),
  );
}

class SettingsPanel extends Modal {
  constructor(props: Record<string, unknown> = {}) {
    super(props);
    this.state = {
      language: 'zh',
      resolution: '1080p',
      fps: '30',
      codec: 'h264',
    };
  }

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
            ], this.state.language as string, (value: string) => this.setState({ language: value })),
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
            ], this.state.resolution as string, (value: string) => this.setState({ resolution: value })),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'FPS'),
            createSelect([
              { value: '30', label: '30' },
              { value: '24', label: '24' },
              { value: '60', label: '60' },
            ], this.state.fps as string, (value: string) => this.setState({ fps: value })),
          ),
          h(
            'div',
            { class: 'settings-row' },
            h('span', { class: 'settings-label' }, 'Codec'),
            createSelect([
              { value: 'h264', label: 'h264' },
              { value: 'h265', label: 'h265' },
              { value: 'prores', label: 'ProRes' },
            ], this.state.codec as string, (value: string) => this.setState({ codec: value })),
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

function toggleSelect(trigger: HTMLElement): void {
  const select = trigger.closest('.nf-select');
  document.querySelectorAll('.nf-select.open').forEach((item) => {
    if (item !== select) item.classList.remove('open');
  });
  if (select) select.classList.toggle('open');
}

function pickOption(option: HTMLElement): void {
  const select = option.closest('.nf-select');
  if (!select) return;
  const valueEl = select.querySelector('.nf-select-value');
  if (valueEl) valueEl.textContent = option.textContent;
  select.querySelectorAll('.nf-select-option').forEach((item: Element) => item.classList.remove('active'));
  option.classList.add('active');
  select.classList.remove('open');
  if (option.dataset.val) (select as HTMLElement).dataset.value = option.dataset.val;
}

document.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('.nf-select')) return;
  document.querySelectorAll('.nf-select.open').forEach((item) => item.classList.remove('open'));
});

window.SettingsPanel = SettingsPanel;
window.toggleSelect = toggleSelect;
window.pickOption = pickOption;
window.createMarkupNode = createMarkupNode;
