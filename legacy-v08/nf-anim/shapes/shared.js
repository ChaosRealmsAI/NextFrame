export function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export function attrs(map) { return Object.entries(map).filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "").map(([k, v]) => ` ${k}="${esc(v)}"`).join(""); }
export function num(v, d) { return Number.isFinite(v) ? v : d; }
export function pts(list, fallback) { return (Array.isArray(list) && list.length ? list : fallback).map((p) => [num(p[0], 0), num(p[1], 0)]); }
export function pathD(list, fallback, close = false) { const out = pts(list, fallback).map((p, i) => `${i ? "L" : "M"} ${p[0]},${p[1]}`).join(" "); return out + (close ? " Z" : ""); }
export function pointsAttr(list, fallback) { return pts(list, fallback).map((p) => p.join(",")).join(" "); }
export function slug(v) { return `nf-${Array.from(String(v ?? "")).reduce((a, ch) => ((a * 33) + ch.charCodeAt(0)) >>> 0, 5381).toString(36)}`; }
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (!v || typeof v !== "object") return JSON.stringify(v ?? null);
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined && typeof v[k] !== "function").map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}
