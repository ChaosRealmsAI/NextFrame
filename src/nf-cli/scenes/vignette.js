// vignette — darkens corners of the frame, emphasizing center.
// Frame-pure: only depends on (t, params, ctx).

export function vignette(t, params = {}, ctx, globalT) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const intensity = clamp(params.intensity, 0, 1, 0.7);
  const hue = clamp(params.hue, 0, 360, 240);
  const radius = clamp(params.radius, 0.2, 1.2, 0.75);
  const pulse = 0.92 + 0.08 * Math.sin((globalT ?? t) * 1.4);
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = Math.max(width, height) * radius * pulse;
  const g = ctx.createRadialGradient(cx, cy, rOuter * 0.3, cx, cy, rOuter);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `hsla(${hue}, 40%, 6%, ${intensity})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
