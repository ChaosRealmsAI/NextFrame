export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><div class="nfv2-layer-stack"></div></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const stack = root.querySelector(".nfv2-layer-stack");
  if (!stack) return;
  const layers = Array.isArray(p.layers) ? p.layers : [];
  stack.style.left = `${Number(p.x || 68)}%`;
  stack.style.top = `${Number(p.y || 52)}%`;
  stack.innerHTML = layers.map((label, index) => {
    const enter = clamp(ctx.progress * 2.4 - index * 0.16, 0, 1);
    const lift = index * -18;
    return `<div class="nfv2-layer-card" style="--i:${index};opacity:${enter};transform:translate(-50%, -50%) translate(${index * 24}px, ${lift + (1 - enter) * 40}px) rotateX(58deg) rotateZ(-22deg);">
      <span>${escapeHtml(label)}</span>
    </div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
