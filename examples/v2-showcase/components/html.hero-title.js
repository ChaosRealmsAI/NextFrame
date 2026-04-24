export function mount(root) {
  root.innerHTML = [
    '<div class="nfv2-root">',
    '  <section class="nfv2-hero">',
    '    <div class="nfv2-eyebrow"></div>',
    '    <div class="nfv2-title"></div>',
    '    <div class="nfv2-subtitle"></div>',
    '  </section>',
    '</div>'
  ].join("");
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const hero = root.querySelector(".nfv2-hero");
  if (!hero) return;
  hero.style.left = `${Number(p.x || 50)}%`;
  hero.style.top = `${Number(p.y || 43)}%`;
  hero.style.opacity = String(Math.min(1, ctx.progress * 1.8));
  hero.style.transform = `translate(-50%, -50%) translateY(${(1 - Math.min(1, ctx.progress * 1.4)) * 26}px)`;
  root.querySelector(".nfv2-eyebrow").textContent = String(p.eyebrow || "");
  root.querySelector(".nfv2-title").textContent = String(p.title || "");
  root.querySelector(".nfv2-subtitle").textContent = String(p.subtitle || "");
}
