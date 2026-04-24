export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><div class="nfv2-cards"></div></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const cards = root.querySelector(".nfv2-cards");
  if (!cards) return;
  cards.style.left = `${Number(p.x || 50)}%`;
  cards.style.top = `${Number(p.y || 74)}%`;
  cards.style.opacity = String(Math.min(1, ctx.progress * 2));
  const items = Array.isArray(p.items) ? p.items : [];
  cards.innerHTML = items.map((item, index) => {
    const delay = Math.max(0, Math.min(1, ctx.progress * 2.4 - index * 0.18));
    return `<article class="nfv2-card" style="transform:translateY(${(1 - delay) * 22}px);opacity:${delay.toFixed(3)};">
      <div class="value">${escapeHtml(item.value)}</div>
      <div class="label">${escapeHtml(item.label)}</div>
    </article>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
