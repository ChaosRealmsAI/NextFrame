export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><div class="nfv2-strip"></div></div>';
}

export function update(root, ctx) {
  const steps = Array.isArray(ctx.params.steps) ? ctx.params.steps : [];
  const active = Math.floor(ctx.progress * steps.length);
  const strip = root.querySelector(".nfv2-strip");
  if (!strip) return;
  strip.innerHTML = steps.map((step, index) => {
    const cls = index <= active ? "nfv2-step active" : "nfv2-step";
    return `<div class="${cls}">${String(step)}</div>`;
  }).join("");
}
