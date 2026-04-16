import { BEHAVIORS } from "../../behaviors/index.js";
import { SHAPES } from "../../shapes/index.js";
import { SCENES } from "../../scenes/index.js";
const meta = { name: "list", kind: "cli", description: "List nf-anim registries stub" };
export default function listCmd(args = { _: [] }) {
  // TODO: list and print real registry data
  void BEHAVIORS; void SHAPES; void SCENES; void args._[0];
  if (args.json) console.log(JSON.stringify([], null, 2));
  else console.log("(empty stub)");
  return [];
}
export { meta };
