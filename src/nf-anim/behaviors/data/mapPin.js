import { at, metaOf, p } from "../shared.js";
const meta = metaOf("mapPin", "data", "Map pin drop whose bounce intensity derives from a value", 1, [p("value", "number", 64, "data magnitude used to scale the drop and settle intensity")], { value: 64 });
function mapPin(startAt = 0, duration = 1, opts = {}) {
  const value = opts.value ?? 64;
  const lift = Math.max(12, Math.min(42, Math.abs(value) * 0.35));
  return { tracks: { y: [[startAt, -lift], [at(startAt, duration, 0.62), 8, "out"], [at(startAt, duration), 0, "inOut"]], scale: [[startAt, 0.7], [at(startAt, duration, 0.62), 1.08, "out"], [at(startAt, duration), 1, "inOut"]], opacity: [[startAt, 0], [at(startAt, duration * 0.2), 1, "out"]] } };
}
mapPin.meta = meta;
export default mapPin;
