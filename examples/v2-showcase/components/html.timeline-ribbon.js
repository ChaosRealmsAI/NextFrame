export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><div class="nfv2-showreel-ribbon"></div></div>';
}

export function update(root, ctx) {
  const steps = Array.isArray(ctx.params.steps) ? ctx.params.steps : [];
  const active = Math.floor(ctx.progress * steps.length);
  const ribbon = root.querySelector(".nfv2-showreel-ribbon");
  if (!ribbon) return;
  const stepsKey = JSON.stringify(steps);
  if (ribbon.dataset.stepsKey !== stepsKey) {
    ribbon.dataset.stepsKey = stepsKey;
    ribbon.innerHTML = steps.map((step) => `<div class="nfv2-ribbon-step"><span>${String(step)}</span><i></i></div>`).join("");
  }
  ribbon.querySelectorAll(".nfv2-ribbon-step").forEach((step, index) => {
    const fill = index < active ? 100 : index === active ? Math.round((ctx.progress * steps.length % 1) * 100) : 0;
    step.classList.toggle("active", index <= active);
    const bar = step.querySelector("i");
    if (bar) bar.style.width = `${fill}%`;
  });
}
