export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><svg class="nfv2-graph" viewBox="0 0 520 360" width="520" height="360"></svg></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const svg = root.querySelector(".nfv2-graph");
  if (!svg) return;
  svg.style.position = "absolute";
  svg.style.left = `${Number(p.x || 80)}%`;
  svg.style.top = `${Number(p.y || 44)}%`;
  svg.style.transform = "translate(-50%, -50%)";
  const draw = Math.max(0, Math.min(1, ctx.progress * 1.35));
  const dash = 980 * (1 - draw);
  svg.innerHTML = `
    <rect x="1" y="1" width="518" height="358" fill="rgba(5,7,10,0.45)" stroke="rgba(255,255,255,0.16)"/>
    <path d="M48 276 C118 170 178 248 246 132 S390 84 470 54" fill="none" stroke="#62f5d2" stroke-width="10" stroke-linecap="round" stroke-dasharray="980" stroke-dashoffset="${dash}"/>
    <path d="M48 304 H470" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    <path d="M48 304 V42" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    <circle cx="246" cy="132" r="${8 + draw * 8}" fill="#c8ff5d"/>
  `;
}
