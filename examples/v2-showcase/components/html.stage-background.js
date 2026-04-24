export function mount(root) {
  root.innerHTML = '<div class="nfv2-root nfv2-stage"><div class="nfv2-grid"></div></div>';
}

export function update(root, ctx) {
  const grid = root.querySelector(".nfv2-grid");
  if (grid) {
    const shift = Math.round(ctx.progress * 72);
    grid.style.backgroundPosition = `${shift}px ${shift}px`;
  }
}
