let aiPromptsRendered = false;

function toggleAIPrompts() {
  document.getElementById('ai-overlay').classList.toggle('open');
  document.getElementById('ai-modal').classList.toggle('open');
  if (!aiPromptsRendered) {
    let html = '';
    for (const s of window.AI_PROMPTS) {
      html += '<div class="prompt-section"><div class="prompt-section-title">' + s.icon + ' ' + s.title + '</div>';
      for (const p of s.prompts) {
        html += '<div class="prompt-item" data-nf-action="copy-ai-prompt" onclick="copyPrompt(this)"><span class="prompt-text">' + p.replace(/</g, '&lt;') + '</span><span class="prompt-copy">复制</span></div>';
      }
      html += '</div>';
    }
    document.getElementById('ai-prompts-body').innerHTML = html;
    aiPromptsRendered = true;
  }
}

function copyPrompt(el) {
  const text = el.querySelector('.prompt-text').textContent;
  const copy = el.querySelector('.prompt-copy');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
  copy.textContent = '已复制';
  copy.classList.add('copied');
  setTimeout(() => {
    copy.textContent = '复制';
    copy.classList.remove('copied');
  }, 1500);
}

function toggleSettings() {
  document.getElementById('settings-overlay').classList.toggle('open');
  document.getElementById('settings-panel').classList.toggle('open');
}

function toggleSelect(trigger) {
  const sel = trigger.closest('.nf-select');
  document.querySelectorAll('.nf-select.open').forEach(s => {
    if (s !== sel) s.classList.remove('open');
  });
  sel.classList.toggle('open');
}

function pickOption(opt) {
  const sel = opt.closest('.nf-select');
  sel.querySelector('.nf-select-value').textContent = opt.textContent;
  sel.querySelectorAll('.nf-select-option').forEach(o => o.classList.remove('active'));
  opt.classList.add('active');
  sel.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.nf-select')) {
    document.querySelectorAll('.nf-select.open').forEach(s => s.classList.remove('open'));
  }
});

function toggleNewProject() {
  document.getElementById('new-project-overlay').classList.toggle('open');
  document.getElementById('new-project-modal').classList.toggle('open');
}

window.toggleAIPrompts = toggleAIPrompts;
window.copyPrompt = copyPrompt;
window.toggleSettings = toggleSettings;
window.toggleSelect = toggleSelect;
window.pickOption = pickOption;
window.toggleNewProject = toggleNewProject;
