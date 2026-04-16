import circle from "./circle.js";
import ring from "./ring.js";
import square from "./square.js";
import rect from "./rect.js";
import triangle from "./triangle.js";
import hexagon from "./hexagon.js";
import polygon from "./polygon.js";
import capsule from "./capsule.js";
const meta = { name: "geometric", kind: "shapes", description: "geometric shapes registry" };
export const GEOMETRIC_SHAPES = { circle, ring, square, rect, triangle, hexagon, polygon, capsule };
export function listShapes() {
  // TODO: return richer registry metadata
  return Object.values(GEOMETRIC_SHAPES).map((entry) => entry.meta || entry);
}
export { meta };
export default GEOMETRIC_SHAPES;
