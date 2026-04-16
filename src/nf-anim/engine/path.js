// TODO: upgrade mismatch handling to geometric resampling when nf-anim needs topology bridging.
const meta = { name: "path", kind: "engine", description: "SVG path parsing and direct arg-wise morphing" };
const COUNTS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TOKENS = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const warned = new Set();
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const fmt = (v) => `${Object.is(+v.toFixed(4), -0) ? 0 : +v.toFixed(4)}`;
const pointsOf = (parsed = []) => {
  let x = 0, y = 0, sx = 0, sy = 0;
  const out = [];
  for (const { cmd, args = [] } of parsed) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (upper === "Z") { x = sx; y = sy; out.push([x, y]); continue; }
    if (upper === "H") x = rel ? x + (+args[0] || 0) : (+args[0] || 0);
    else if (upper === "V") y = rel ? y + (+args[0] || 0) : (+args[0] || 0);
    else {
      x = rel ? x + (+args[args.length - 2] || 0) : (+args[args.length - 2] || 0);
      y = rel ? y + (+args[args.length - 1] || 0) : (+args[args.length - 1] || 0);
      if (upper === "M") { sx = x; sy = y; }
    }
    out.push([x, y]);
  }
  return out;
};
const stringify = (parsed = []) => parsed.map(({ cmd, args = [] }) => args.length ? `${cmd}${args.map(fmt).join(" ")}` : cmd).join(" ");
const sameShape = (a = [], b = []) => a.length === b.length && a.every((seg, i) => seg.cmd === b[i].cmd && seg.args.length === b[i].args.length);
function warnMismatch(a, b) {
  const key = `${a}\n${b}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("nf-anim:path morph fallback: v1 only supports matching SVG path command sequences");
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
export function samplePath(parsed = [], t = 0) {
  const points = pointsOf(parsed);
  if (!points.length) return null;
  if (points.length === 1) return { x: points[0][0], y: points[0][1] };
  const scaled = clamp01(t) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const progress = scaled - index;
  return {
    x: points[index][0] + (points[index + 1][0] - points[index][0]) * progress,
    y: points[index][1] + (points[index + 1][1] - points[index][1]) * progress,
  };
}
export function lerpPath(a = "", b = "", t = 0, rawA = a, rawB = b) {
  const left = Array.isArray(a) ? a : parsePath(a);
  const right = Array.isArray(b) ? b : parsePath(b);
  const progress = clamp01(t);
  if (!sameShape(left, right)) {
    warnMismatch(`${rawA}`, `${rawB}`);
    return progress < 0.5 ? `${rawA}` : `${rawB}`;
  }
  return stringify(left.map((seg, i) => ({ cmd: seg.cmd, args: seg.args.map((value, j) => value + (right[i].args[j] - value) * progress) })));
}
export { meta };
