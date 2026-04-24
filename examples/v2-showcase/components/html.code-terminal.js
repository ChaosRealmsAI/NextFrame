export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><section class="nfv2-code-terminal"><div class="nfv2-window-bar"><b></b><b></b><b></b><span>component.js</span></div><pre></pre></section></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const terminal = root.querySelector(".nfv2-code-terminal");
  const pre = root.querySelector("pre");
  if (!terminal || !pre) return;
  terminal.style.left = `${Number(p.x || 34)}%`;
  terminal.style.top = `${Number(p.y || 50)}%`;
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const chars = Math.floor(ctx.progress * lines.join("\n").length * 1.35);
  pre.textContent = lines.join("\n").slice(0, chars);
  terminal.style.opacity = String(Math.min(1, ctx.progress * 2.3));
  terminal.style.transform = `translate(-50%, -50%) translateY(${(1 - Math.min(1, ctx.progress * 2)) * 24}px)`;
}
