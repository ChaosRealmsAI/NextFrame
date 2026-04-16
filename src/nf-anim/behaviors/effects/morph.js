import { at, metaOf, p } from "../shared.js";
const meta = metaOf("morph", "effects", "Shape morph settle with axis rebalancing", 1.2, [p("fromScaleX", "number", 0.8, "starting horizontal scale before the form rebalances"), p("fromScaleY", "number", 1.2, "starting vertical scale before the form rebalances"), p("rotate", "number", 16, "starting rotation offset in degrees")], { fromScaleX: 0.8, fromScaleY: 1.2, rotate: 16 });
function morph(startAt = 0, duration = 1.2, opts = {}) {
  const fromScaleX = opts.fromScaleX ?? 0.8;
  const fromScaleY = opts.fromScaleY ?? 1.2;
  const rotate = opts.rotate ?? 16;
  return { tracks: { scaleX: [[startAt, fromScaleX], [at(startAt, duration), 1, "inOut"]], scaleY: [[startAt, fromScaleY], [at(startAt, duration), 1, "inOut"]], rotate: [[startAt, rotate], [at(startAt, duration), 0, "inOut"]], opacity: [[startAt, 0.4], [at(startAt, duration * 0.2), 1, "out"]] } };
}
morph.meta = meta;
export default morph;
