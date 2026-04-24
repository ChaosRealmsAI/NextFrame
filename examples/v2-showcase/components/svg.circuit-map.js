export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><svg class="nfv2-circuit" viewBox="0 0 760 520" width="760" height="520"></svg></div>';
}

export function update(root, ctx) {
  const p = ctx.params || {};
  const svg = root.querySelector(".nfv2-circuit");
  if (!svg) return;
  svg.style.position = "absolute";
  svg.style.left = `${Number(p.x || 32)}%`;
  svg.style.top = `${Number(p.y || 58)}%`;
  svg.style.transform = "translate(-50%, -50%)";
  const draw = Math.max(0, Math.min(1, ctx.progress * 1.5));
  const pulse = 0.5 + Math.sin(ctx.timeMs / 260) * 0.5;
  const dash = 1600 * (1 - draw);
  svg.innerHTML = `
    <rect x="1" y="1" width="758" height="518" fill="rgba(5,7,10,0.34)" stroke="rgba(255,255,255,0.14)"/>
    <path d="M80 370 C150 220 240 310 310 160 C390 20 520 120 610 70" fill="none" stroke="#62f5d2" stroke-width="8" stroke-linecap="round" stroke-dasharray="1600" stroke-dashoffset="${dash}"/>
    <path d="M90 100 H250 V250 H420 V420 H660" fill="none" stroke="rgba(120,167,255,0.55)" stroke-width="4" stroke-dasharray="1600" stroke-dashoffset="${dash * 0.8}"/>
    ${node(80, 370, draw, pulse)}
    ${node(310, 160, draw, pulse)}
    ${node(610, 70, draw, pulse)}
    ${node(660, 420, draw, pulse)}
  `;
}

function node(x, y, draw, pulse) {
  const r = 8 + pulse * 7;
  const o = Math.max(0, Math.min(1, draw * 2));
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(200,255,93,${0.25 * o})"/><circle cx="${x}" cy="${y}" r="6" fill="#c8ff5d" opacity="${o}"/>`;
}
