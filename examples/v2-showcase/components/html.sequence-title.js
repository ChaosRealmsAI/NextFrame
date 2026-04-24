export function mount(root) {
  root.innerHTML = [
    '<div class="nfv2-root">',
    '  <section class="nfv2-sequence-title">',
    '    <div class="nfv2-eyebrow"></div>',
    '    <div class="nfv2-title"></div>',
    '    <div class="nfv2-subtitle"></div>',
    '  </section>',
    '</div>'
  ].join("");
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const box = root.querySelector(".nfv2-sequence-title");
  if (!box) return;
  const align = p.align === "center" ? "center" : "left";
  const intro = clamp(ctx.progress * 2.2, 0, 1);
  const outro = clamp((1 - ctx.progress) * 3, 0, 1);
  const opacity = Math.min(intro, outro);
  box.style.left = `${Number(p.x || 50)}%`;
  box.style.top = `${Number(p.y || 43)}%`;
  box.style.textAlign = align;
  box.style.transform = `translate(${align === "center" ? "-50%" : "-8%"}, -50%) translateY(${(1 - intro) * 34}px)`;
  box.style.opacity = String(opacity);
  const title = root.querySelector(".nfv2-title");
  const subtitle = root.querySelector(".nfv2-subtitle");
  root.querySelector(".nfv2-eyebrow").textContent = String(p.eyebrow || "");
  title.textContent = String(p.title || "");
  subtitle.textContent = String(p.subtitle || "");
  if (Number.isFinite(Number(p.title_size))) title.style.fontSize = `${Number(p.title_size)}px`;
  if (Number.isFinite(Number(p.subtitle_size))) subtitle.style.fontSize = `${Number(p.subtitle_size)}px`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
