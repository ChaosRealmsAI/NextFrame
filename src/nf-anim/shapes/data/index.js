import bar from "./bar.js";
import line from "./line.js";
import pie from "./pie.js";
import area from "./area.js";
const meta = { name: "data", kind: "shapes", description: "data shapes registry" };
export const DATA_SHAPES = { bar, line, pie, area };
export function listShapes() {
  // TODO: return richer registry metadata
  return Object.values(DATA_SHAPES).map((entry) => entry.meta || entry);
}
export { meta };
export default DATA_SHAPES;
