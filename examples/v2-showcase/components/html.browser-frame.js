export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><section class="nfv2-browser"></section></div>';
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
  box.innerHTML = `
    <div class="nfv2-browser-top">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <b>${escapeHtml(p.title || "preview")}</b>
    </div>
    <div class="nfv2-browser-tabs">${tabs.map((tab, i) => `<span class="${i <= Math.floor(ctx.progress * tabs.length) ? "active" : ""}">${escapeHtml(tab)}</span>`).join("")}</div>
    <div class="nfv2-browser-canvas">
      <div class="hero-line"></div>
      <div class="panel-grid">${Array.from({ length: 9 }, (_, i) => `<i style="--i:${i};"></i>`).join("")}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
