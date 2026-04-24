export function mount(root) {
  root.innerHTML = '<div class="nfv2-root"><canvas class="nfv2-particles" width="1920" height="1080"></canvas></div>';
}

export function update(root, ctx) {
  const canvas = root.querySelector(".nfv2-particles");
  if (!canvas) return;
  const g = canvas.getContext("2d");
  const p = ctx.params || {};
  const count = Math.max(24, Math.min(120, Number(p.density || 72)));
  const energy = Math.max(0.2, Math.min(1.4, Number(p.energy || 0.8)));
  const t = ctx.timeMs * 0.00018;
  g.clearRect(0, 0, 1920, 1080);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i += 1) {
    const seed = i * 9973;
    const x = 960 + Math.sin(seed * 0.017 + t * (1.2 + i % 5)) * (220 + (i % 9) * 48);
    const y = 540 + Math.cos(seed * 0.013 + t * (1.7 + i % 7)) * (130 + (i % 11) * 32);
    const r = 1.6 + (i % 5) * 0.9;
    g.fillStyle = i % 3 === 0 ? "rgba(98,245,210,0.52)" : i % 3 === 1 ? "rgba(120,167,255,0.42)" : "rgba(200,255,93,0.34)";
    g.beginPath();
    g.arc(x, y, r * energy, 0, Math.PI * 2);
    g.fill();
    if (i > 0 && i % 2 === 0) {
      const x2 = 960 + Math.sin((seed - 9973) * 0.017 + t * (1.2 + (i - 1) % 5)) * (220 + ((i - 1) % 9) * 48);
      const y2 = 540 + Math.cos((seed - 9973) * 0.013 + t * (1.7 + (i - 1) % 7)) * (130 + ((i - 1) % 11) * 32);
      const dist = Math.hypot(x - x2, y - y2);
      if (dist < 230) {
        g.strokeStyle = `rgba(98,245,210,${(1 - dist / 230) * 0.2})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x2, y2);
        g.stroke();
      }
    }
  }
  g.globalCompositeOperation = "source-over";
}
