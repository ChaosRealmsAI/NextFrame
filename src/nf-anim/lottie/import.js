// TODO: extend the supported subset only when nf-anim can represent it faithfully.
const meta = {
  name: "importLottie",
  kind: "lottie",
  description: "Subset Lottie importer for AI-facing nf-anim JSON",
};
const num = (v, d = 0) => (Number.isFinite(v) ? v : d),
  at = (frame, ip, fr) =>
    +((num(frame) - num(ip)) / Math.max(1, num(fr, 30))).toFixed(4),
  pick = (v) => (Array.isArray(v) && v.length === 1 ? v[0] : v),
  fail = (msg) => {
    throw new Error(`Fix: ${msg}`);
  };
const hex = (v) =>
    `#${Math.max(0, Math.min(255, Math.round(num(v) * 255)))
      .toString(16)
      .padStart(2, "0")}`,
  color = (v) =>
    Array.isArray(v) ? `${hex(v[0])}${hex(v[1])}${hex(v[2])}` : "#000000";
const pt = (v, d = [0, 0]) =>
    Array.isArray(v) ? [num(v[0], d[0]), num(v[1], d[1])] : d.slice(),
  ease = (kf = {}) =>
    kf.h
      ? "linear"
      : num(pick(kf.o?.y), 0.5) > 0.66
        ? "out"
        : num(pick(kf.i?.y), 0.5) > 0.66
          ? "in"
          : "inOut";
const ellipse = ([w, h], [x, y]) =>
  [
    `M ${x},${y - h / 2}`,
    `C ${x + (w / 2) * 0.5523},${y - h / 2} ${x + w / 2},${y - (h / 2) * 0.5523} ${x + w / 2},${y}`,
    `C ${x + w / 2},${y + (h / 2) * 0.5523} ${x + (w / 2) * 0.5523},${y + h / 2} ${x},${y + h / 2}`,
    `C ${x - (w / 2) * 0.5523},${y + h / 2} ${x - w / 2},${y + (h / 2) * 0.5523} ${x - w / 2},${y}`,
    `C ${x - w / 2},${y - (h / 2) * 0.5523} ${x - (w / 2) * 0.5523},${y - h / 2} ${x},${y - h / 2}`,
    "Z",
  ].join(" ");
const rect = ([w, h], [x, y], r = 0) => {
  const rx = Math.max(0, Math.min(num(r), Math.min(w, h) / 2)),
    l = x - w / 2,
    t = y - h / 2,
    rr = l + w,
    b = t + h;
  return rx
    ? [
        `M ${l + rx},${t} H ${rr - rx}`,
        `Q ${rr},${t} ${rr},${t + rx} V ${b - rx}`,
        `Q ${rr},${b} ${rr - rx},${b} H ${l + rx}`,
        `Q ${l},${b} ${l},${b - rx} V ${t + rx}`,
        `Q ${l},${t} ${l + rx},${t} Z`,
      ].join(" ")
    : `M ${l},${t} H ${rr} V ${b} H ${l} Z`;
};
function track(prop, ip, fr, map = (v) => v) {
  if (!prop) return null;
  if (prop.x || prop.expression)
    fail("expressions are not supported in this importer");
  if (!prop.a) return null;
  if (!Array.isArray(prop.k)) fail("animated properties must use keyframes");
  const out = [];
  for (let i = 0; i < prop.k.length; i++) {
    const kf = prop.k[i],
      next = prop.k[i + 1],
      t = at(kf.t, ip, fr),
      start = map(pick(kf.s ?? kf.k));
    if (!i) out.push([t, start]);
    if (next)
      out.push([
        at(next.t, ip, fr),
        map(pick(kf.e ?? next.s ?? next.k)),
        ease(kf),
      ]);
  }
  return out;
}
function pathFromShape(shape = {}) {
  if (shape.ty === "sh") {
    if (shape.ks?.a) fail("animated shape path morphs are not supported");
    const k = shape.ks?.k || {},
      v = k.v || [],
      i = k.i || [],
      o = k.o || [];
    if (!v.length) return "";
    let d = `M ${num(v[0][0])},${num(v[0][1])}`;
    for (let idx = 1; idx < v.length; idx++)
      d += [
        " C",
        ` ${num(v[idx - 1][0] + (o[idx - 1]?.[0] || 0))},${num(v[idx - 1][1] + (o[idx - 1]?.[1] || 0))}`,
        ` ${num(v[idx][0] + (i[idx]?.[0] || 0))},${num(v[idx][1] + (i[idx]?.[1] || 0))}`,
        ` ${num(v[idx][0])},${num(v[idx][1])}`,
      ].join("");
    return k.c
      ? [
          d,
          " C",
          ` ${num(v[v.length - 1][0] + (o[v.length - 1]?.[0] || 0))},${num(v[v.length - 1][1] + (o[v.length - 1]?.[1] || 0))}`,
          ` ${num(v[0][0] + (i[0]?.[0] || 0))},${num(v[0][1] + (i[0]?.[1] || 0))}`,
          ` ${num(v[0][0])},${num(v[0][1])} Z`,
        ].join("")
      : d;
  }
  if (shape.ty === "el")
    return ellipse(pt(shape.s?.k, [40, 40]), pt(shape.p?.k));
  if (shape.ty === "rc")
    return rect(pt(shape.s?.k, [40, 40]), pt(shape.p?.k), num(shape.r?.k));
  return "";
}
function styleFrom(items = []) {
  const fill = items.find((item) => item.ty === "fl"),
    stroke = items.find((item) => item.ty === "st");
  if (fill?.c?.a || stroke?.c?.a || stroke?.w?.a)
    fail("animated fill and stroke styling is not supported");
  return {
    fill: fill ? color(fill.c?.k) : "#000000",
    stroke: stroke ? color(stroke.c?.k) : null,
    strokeWidth: stroke ? num(stroke.w?.k, 1) : 0,
  };
}
function flatten(items = [], out = []) {
  for (const item of items)
    item.ty === "gr" ? flatten(item.it || [], out) : out.push(item);
  return out;
}
function layerToMotion(layer = {}, ip, fr) {
  if (layer.ddd)
    fail(`3D layers are not supported (${layer.nm || layer.ind || "layer"})`);
  if (layer.parent)
    fail(
      `parented layers are not supported (${layer.nm || layer.ind || "layer"})`,
    );
  if (layer.masksProperties?.length)
    fail(`masks are not supported (${layer.nm || layer.ind || "layer"})`);
  if (layer.ty !== 4)
    fail(
      `only shape layers are supported (${layer.nm || layer.ind || "layer"})`,
    );
  const items = flatten(layer.shapes || []),
    shape = items.find((item) => ["sh", "el", "rc"].includes(item.ty));
  if (!shape)
    fail(
      `shape layer ${layer.nm || layer.ind || "layer"} has no supported vector path`,
    );
  const anchor = layer.ks?.a?.a
      ? fail("animated anchors are not supported")
      : pt(layer.ks?.a?.k),
    p = layer.ks?.p,
    staticPos = p?.s ? [num(p.x?.k), num(p.y?.k)] : pt(p?.k, [0, 0]),
    mapPos = (v) => {
      const q = p?.s ? [num(v.x), num(v.y)] : pt(v);
      return [q[0] - anchor[0], q[1] - anchor[1]];
    };
  return {
    id: layer.nm || `layer-${layer.ind || 0}`,
    path: pathFromShape(shape),
    at: mapPos(staticPos),
    scale: pt(layer.ks?.s?.k, [100, 100]).map((v) => v / 100),
    rotate: num(layer.ks?.r?.k ?? layer.ks?.rz?.k),
    opacity: num(layer.ks?.o?.k, 100) / 100,
    ...styleFrom(items),
    tracks: Object.fromEntries(
      Object.entries({
        position: track(p, ip, fr, mapPos),
        scale: track(layer.ks?.s, ip, fr, (v) =>
          pt(v, [100, 100]).map((n) => n / 100),
        ),
        rotate: track(layer.ks?.r || layer.ks?.rz, ip, fr, (v) => num(v)),
        opacity: track(layer.ks?.o, ip, fr, (v) => num(v) / 100),
      }).filter(([, v]) => v),
    ),
  };
}
export function importLottie(lottieJson = {}) {
  const fr = num(lottieJson.fr, 30),
    ip = num(lottieJson.ip),
    op = num(lottieJson.op, ip + fr);
  if (!Array.isArray(lottieJson.layers))
    fail("Lottie JSON must contain a layers array");
  return {
    motion: {
      version: "1.0.0",
      frameRate: fr,
      size: [num(lottieJson.w, 1920), num(lottieJson.h, 1080)],
      duration: at(op, ip, fr),
      layers: lottieJson.layers.map((layer) => layerToMotion(layer, ip, fr)),
    },
  };
}
export function convert(lottieJson = {}) {
  return importLottie(lottieJson);
}
export default importLottie;
export { meta };
