export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><div class="nfv2-showreel-ribbon"></div></div>';
}

export function update(root, ctx) {
  const steps = Array.isArray(ctx.params.steps) ? ctx.params.steps : [];
  const active = Math.floor(ctx.progress * steps.length);
  const ribbon = root.querySelector(".nfv2-showreel-ribbon");
  if (!ribbon) return;
  ribbon.innerHTML = steps.map((step, index) => {
    const state = index <= active ? "active" : "";
    const fill = index < active ? 100 : index === active ? Math.round((ctx.progress * steps.length % 1) * 100) : 0;
    return `<div class="nfv2-ribbon-step ${state}"><span>${String(step)}</span><i style="width:${fill}%;"></i></div>`;
  }).join("");
}
