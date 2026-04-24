export function mount(root) {
  root.innerHTML = [
    '<div class="nfv2-root">',
    '  <section class="nfv2-browser">',
    '    <div class="nfv2-browser-top">',
    '      <span class="dot"></span><span class="dot"></span><span class="dot"></span>',
    '      <b data-role="title"></b>',
    '    </div>',
    '    <div class="nfv2-browser-tabs" data-role="tabs"></div>',
    '    <div class="nfv2-browser-canvas">',
    '      <div class="hero-line"></div>',
    '      <div class="panel-grid"></div>',
    '    </div>',
    '  </section>',
    '</div>'
  ].join("");
  root.querySelector(".panel-grid").innerHTML = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i};"></i>`).join("");
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const box = root.querySelector(".nfv2-browser");
  if (!box) return;
  const tabs = Array.isArray(p.tabs) ? p.tabs : [];
  const intro = Math.min(1, ctx.progress * 2);
  box.style.left = `${Number(p.x || 50)}%`;
  box.style.top = `${Number(p.y || 48)}%`;
  box.style.opacity = String(intro);
  box.style.transform = `translate(-50%, -50%) scale(${0.94 + intro * 0.06})`;
  const title = box.querySelector('[data-role="title"]');
  if (title) title.textContent = String(p.title || "preview");
  const tabsRoot = box.querySelector('[data-role="tabs"]');
  const tabsKey = JSON.stringify(tabs);
  if (tabsRoot && tabsRoot.dataset.tabsKey !== tabsKey) {
    tabsRoot.dataset.tabsKey = tabsKey;
    tabsRoot.innerHTML = tabs.map((tab) => `<span>${escapeHtml(tab)}</span>`).join("");
  }
  const active = Math.floor(ctx.progress * tabs.length);
  tabsRoot?.querySelectorAll("span").forEach((tab, index) => {
    tab.classList.toggle("active", index <= active);
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
