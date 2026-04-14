/**
 * AI Prompts — shared component.
 * Renders prompt library from prompts.json, supports search + copy.
 *
 * Usage:
 *   <div id="ai-prompts-root"></div>
 *   <script src="shared/ai-prompts/ai-prompts.js"></script>
 *   // auto-initializes on DOMContentLoaded if #ai-prompts-root exists
 *   // or call: AIPrompts.init(containerEl, promptsData)
 */

const AIPrompts = (() => {
  let allSections = [];

  function render(container, sections) {
    allSections = sections;

    let html = '<div class="ai-prompts">';
    html += '<div class="ai-prompts-search-wrap">';
    html += '<svg class="ai-prompts-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">';
    html += '<circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>';
    html += '<line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    html += '</svg>';
    html += '<input class="ai-prompts-search" type="text" placeholder="搜索指令..." id="ai-prompts-filter">';
    html += '</div>';

    for (const section of sections) {
      html += renderSection(section);
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelector('#ai-prompts-filter').addEventListener('input', (e) => {
      filter(container, e.target.value.trim().toLowerCase());
    });
  }

  function renderSection(section) {
    let html = '<div class="prompt-section">';
    html += '<div class="prompt-section-title">' + section.icon + ' ' + section.title + '</div>';
    for (const prompt of section.prompts) {
      html += '<div class="prompt-item" onclick="AIPrompts.copy(this)">';
      html += '<span class="prompt-text">' + escapeHtml(prompt) + '</span>';
      html += '<span class="prompt-copy">复制</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function filter(container, query) {
    const sectionEls = container.querySelectorAll('.prompt-section');
    let idx = 0;
    for (const section of allSections) {
      const el = sectionEls[idx++];
      if (!el) continue;
      const items = el.querySelectorAll('.prompt-item');
      let visibleCount = 0;
      section.prompts.forEach((prompt, i) => {
        const match = !query || prompt.toLowerCase().includes(query) || section.title.toLowerCase().includes(query);
        if (items[i]) {
          items[i].style.display = match ? '' : 'none';
          if (match) visibleCount++;
        }
      });
      el.style.display = visibleCount > 0 ? '' : 'none';
    }
  }

  function copy(itemEl) {
    const text = itemEl.querySelector('.prompt-text').textContent;
    const copyEl = itemEl.querySelector('.prompt-copy');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    copyEl.textContent = '已复制';
    copyEl.classList.add('copied');
    setTimeout(() => {
      copyEl.textContent = '复制';
      copyEl.classList.remove('copied');
    }, 1500);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function init(container, data) {
    if (data) {
      render(container, data.sections);
      return;
    }
    try {
      const resp = await fetch('shared/ai-prompts/prompts.json');
      const json = await resp.json();
      render(container, json.sections);
    } catch (e) {
      const scriptDir = document.querySelector('script[src*="ai-prompts"]');
      const base = scriptDir ? scriptDir.src.replace(/ai-prompts\.js$/, '') : '';
      try {
        const resp = await fetch(base + 'prompts.json');
        const json = await resp.json();
        render(container, json.sections);
      } catch (e2) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;padding:40px">无法加载指令库</p>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('ai-prompts-root');
    if (root) init(root);
  });

  return { init, copy };
})();
