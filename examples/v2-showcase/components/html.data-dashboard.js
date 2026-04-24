export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><section class="nfv2-dashboard"></section></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const dashboard = root.querySelector(".nfv2-dashboard");
  if (!dashboard) return;
  dashboard.style.left = `${Number(p.x || 68)}%`;
  dashboard.style.top = `${Number(p.y || 52)}%`;
  dashboard.style.opacity = String(Math.min(1, ctx.progress * 2));
  const metrics = Array.isArray(p.metrics) ? p.metrics : [];
  dashboard.innerHTML = `
    <header><span>Runtime State</span><b>${Math.round(ctx.progress * 100)}%</b></header>
    <div class="nfv2-metric-grid">
      ${metrics.map((metric, index) => card(metric, index, ctx)).join("")}
    </div>
    <div class="nfv2-bars">
      ${[0.86, 0.64, 0.92, 0.74].map((value, index) => `<i style="height:${Math.round(value * ctx.progress * 100)}%;--i:${index};"></i>`).join("")}
    </div>
  `;
}

function card(metric, index, ctx) {
  const enter = Math.max(0, Math.min(1, ctx.progress * 2.4 - index * 0.2));
  return `<article style="opacity:${enter};transform:translateY(${(1 - enter) * 18}px);"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></article>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
