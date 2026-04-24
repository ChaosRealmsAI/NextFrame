export function mount(root) {
  root.innerHTML = [
    '<div class="nfv2-root">',
    '  <section class="nfv2-dashboard">',
    '    <header><span>Runtime State</span><b data-role="percent">0%</b></header>',
    '    <div class="nfv2-metric-grid" data-role="metrics"></div>',
    '    <div class="nfv2-bars" data-role="bars">',
    '      <i></i><i></i><i></i><i></i>',
    '    </div>',
    '  </section>',
    '</div>'
  ].join("");
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const dashboard = root.querySelector(".nfv2-dashboard");
  if (!dashboard) return;
  dashboard.style.left = `${Number(p.x || 68)}%`;
  dashboard.style.top = `${Number(p.y || 52)}%`;
  dashboard.style.opacity = String(Math.min(1, ctx.progress * 2));
  const metrics = Array.isArray(p.metrics) ? p.metrics : [];
  const percent = dashboard.querySelector('[data-role="percent"]');
  if (percent) percent.textContent = `${Math.round(ctx.progress * 100)}%`;
  const metricsRoot = dashboard.querySelector('[data-role="metrics"]');
  const metricsKey = JSON.stringify(metrics);
  if (metricsRoot && metricsRoot.dataset.metricsKey !== metricsKey) {
    metricsRoot.dataset.metricsKey = metricsKey;
    metricsRoot.innerHTML = metrics.map((metric) => `<article><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></article>`).join("");
  }
  metricsRoot?.querySelectorAll("article").forEach((card, index) => {
    const enter = Math.max(0, Math.min(1, ctx.progress * 2.4 - index * 0.2));
    card.style.opacity = String(enter);
    card.style.transform = `translateY(${(1 - enter) * 18}px)`;
  });
  const heights = [0.86, 0.64, 0.92, 0.74];
  dashboard.querySelectorAll(".nfv2-bars i").forEach((bar, index) => {
    bar.style.height = `${Math.round((heights[index] || 0.5) * ctx.progress * 100)}%`;
    bar.style.setProperty("--i", String(index));
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
