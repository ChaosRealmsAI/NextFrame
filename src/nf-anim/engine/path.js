// TODO: extend geometric sampling to arcs and smooth shorthand parity if nf-anim needs it.
const meta = { name: "path", kind: "engine", description: "SVG path parsing with geometric sampling and fallback morphing" };
const COUNTS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TOKENS = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const CURVE_STEPS = 16;
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const fmt = (v) => `${Object.is(+v.toFixed(4), -0) ? 0 : +v.toFixed(4)}`;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerpNum = (a, b, t) => a + (b - a) * t;
const lerpPt = (a, b, t) => [lerpNum(a[0], b[0], t), lerpNum(a[1], b[1], t)];
const cubicAt = (p0, p1, p2, p3, t) => lerpPt(lerpPt(lerpPt(p0, p1, t), lerpPt(p1, p2, t), t), lerpPt(lerpPt(p1, p2, t), lerpPt(p2, p3, t), t), t);
const quadAt = (p0, p1, p2, t) => lerpPt(lerpPt(p0, p1, t), lerpPt(p1, p2, t), t);
const point = (x, y) => [x || 0, y || 0];
const sameShape = (a = [], b = []) => a.length === b.length && a.every((seg, i) => seg.cmd === b[i].cmd && seg.args.length === b[i].args.length);
const stringify = (parsed = []) => parsed.map(({ cmd, args = [] }) => args.length ? `${cmd}${args.map(fmt).join(" ")}` : cmd).join(" ");
const isClosed = (parsed = []) => parsed.some(({ cmd }) => cmd && cmd.toUpperCase() === "Z");
function traceCurve(out, at, pts, steps = CURVE_STEPS) {
  let prev = pts[0];
  for (let i = 1; i <= steps; i += 1) {
    const next = at(...pts, i / steps);
    out.push({ a: prev, b: next });
    prev = next;
  }
}
function segmentsOf(parsed = []) {
  let x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, prev = "";
  const out = [];
  for (const { cmd, args = [] } of parsed) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const from = [x, y];
    const abs = (i, axis) => (rel ? (axis ? y : x) : 0) + (+args[i] || 0);
    if (upper === "M") { x = abs(0, 0); y = abs(1, 1); sx = x; sy = y; }
    else if (upper === "L") { x = abs(0, 0); y = abs(1, 1); out.push({ a: from, b: [x, y] }); }
    else if (upper === "H") { x = abs(0, 0); out.push({ a: from, b: [x, y] }); }
    else if (upper === "V") { y = abs(0, 1); out.push({ a: from, b: [x, y] }); }
    else if (upper === "C") {
      const p1 = point(abs(0, 0), abs(1, 1)), p2 = point(abs(2, 0), abs(3, 1)), p3 = point(abs(4, 0), abs(5, 1));
      traceCurve(out, cubicAt, [from, p1, p2, p3]); x = p3[0]; y = p3[1]; cx = p2[0]; cy = p2[1];
    } else if (upper === "S") {
      const p1 = prev === "C" || prev === "S" ? [x * 2 - cx, y * 2 - cy] : [x, y];
      const p2 = point(abs(0, 0), abs(1, 1)), p3 = point(abs(2, 0), abs(3, 1));
      traceCurve(out, cubicAt, [from, p1, p2, p3]); x = p3[0]; y = p3[1]; cx = p2[0]; cy = p2[1];
    } else if (upper === "Q") {
      const p1 = point(abs(0, 0), abs(1, 1)), p2 = point(abs(2, 0), abs(3, 1));
      traceCurve(out, quadAt, [from, p1, p2]); x = p2[0]; y = p2[1]; qx = p1[0]; qy = p1[1];
    } else if (upper === "T") {
      const p1 = prev === "Q" || prev === "T" ? [x * 2 - qx, y * 2 - qy] : [x, y];
      const p2 = point(abs(0, 0), abs(1, 1));
      traceCurve(out, quadAt, [from, p1, p2]); x = p2[0]; y = p2[1]; qx = p1[0]; qy = p1[1];
    } else if (upper === "Z") { out.push({ a: from, b: [sx, sy] }); x = sx; y = sy; }
    else if (args.length >= 2) { x = abs(args.length - 2, 0); y = abs(args.length - 1, 1); out.push({ a: from, b: [x, y] }); }
    if (upper !== "C" && upper !== "S") { cx = x; cy = y; }
    if (upper !== "Q" && upper !== "T") { qx = x; qy = y; }
    prev = upper;
  }
  return out.filter(({ a, b }) => dist(a, b) > 0);
}
function metricsOf(parsed = []) {
  let total = 0;
  const parts = segmentsOf(parsed).map(({ a, b }) => {
    const len = dist(a, b);
    total += len;
    return { a, b, len, total };
  });
  return { total, parts };
}
function pointAtLength(metrics, progress) {
  const { total, parts } = metrics;
  if (!parts.length) return null;
  if (total <= 0) return { x: parts[0].a[0], y: parts[0].a[1] };
  const target = clamp01(progress) * total;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (target <= part.total || i === parts.length - 1) {
      const start = part.total - part.len;
      const local = part.len ? (target - start) / part.len : 0;
      return { x: lerpNum(part.a[0], part.b[0], local), y: lerpNum(part.a[1], part.b[1], local) };
    }
  }
  return { x: parts[parts.length - 1].b[0], y: parts[parts.length - 1].b[1] };
}
function linePath(points, closed) {
  if (!points.length) return "";
  const head = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const body = points.slice(1).map(({ x, y }) => `L${fmt(x)} ${fmt(y)}`).join(" ");
  return `${head}${body ? ` ${body}` : ""}${closed ? " Z" : ""}`;
}
export function parsePath(d = "") {
  const tokens = `${d || ""}`.match(TOKENS) || [];
  const out = [];
  let i = 0, cmd = null;
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const upper = cmd.toUpperCase();
    const size = COUNTS[upper];
    if (size === undefined) break;
    if (!size) { out.push({ cmd, args: [] }); cmd = null; continue; }
    let next = cmd;
    do {
      if (i + size > tokens.length || /^[A-Za-z]$/.test(tokens[i])) break;
      const args = tokens.slice(i, i + size).map(Number);
      if (args.some((value) => !Number.isFinite(value))) break;
      out.push({ cmd: next, args });
      i += size;
      next = upper === "M" ? (cmd === "m" ? "l" : "L") : cmd;
    } while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]));
  }
  return out;
}
export function measurePath(parsed = []) {
  return metricsOf(Array.isArray(parsed) ? parsed : parsePath(parsed)).total;
}
export function samplePath(parsed = [], t = 1, n = 64) {
  const shape = Array.isArray(parsed) ? parsed : parsePath(parsed);
  const count = Math.max(1, Math.floor(n) || 1);
  const end = clamp01(t);
  const metrics = metricsOf(shape);
  if (!metrics.parts.length) return [];
  if (count === 1) return [pointAtLength(metrics, end)];
  const closed = isClosed(shape) && end >= 1;
  const denom = closed ? count : count - 1;
  return Array.from({ length: count }, (_, i) => pointAtLength(metrics, end * (denom ? i / denom : 0)));
}
export function lerpPath(a = "", b = "", t = 0, rawA = a, rawB = b) {
  const left = Array.isArray(a) ? a : parsePath(a);
  const right = Array.isArray(b) ? b : parsePath(b);
  const progress = clamp01(t);
  if (sameShape(left, right)) {
    return stringify(left.map((seg, i) => ({ cmd: seg.cmd, args: seg.args.map((value, j) => value + (right[i].args[j] - value) * progress) })));
  }
  const closed = isClosed(left) && isClosed(right);
  const leftPoints = samplePath(left, 1, 64);
  const rightPoints = samplePath(right, 1, 64);
  if (!leftPoints.length || !rightPoints.length) return progress < 0.5 ? `${rawA}` : `${rawB}`;
  return linePath(leftPoints.map((p, i) => {
    const q = rightPoints[Math.min(i, rightPoints.length - 1)];
    return { x: lerpNum(p.x, q.x, progress), y: lerpNum(p.y, q.y, progress) };
  }), closed);
}
export { meta };
