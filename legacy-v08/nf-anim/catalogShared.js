import { BEHAVIORS } from "./behaviors/index.js";
import { SHAPES } from "./shapes/index.js";
import { SCENES } from "./scenes/index.js";

const GROUPS = { behavior: BEHAVIORS, shape: SHAPES, scene: SCENES };

const clone = (v) =>
  Array.isArray(v) ? v.map(clone) : v && typeof v === "object" ? { ...v } : v;

const title = (s = "") =>
  s
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (m) => m.toUpperCase())
    .trim();

const paramsOf = (item) =>
  item.meta?.params ||
  item.params || [
    {
      name: "params",
      type: "object",
      default: item.sample?.() || {},
      semantic: "scene parameter bag",
    },
  ];

const defaultsOf = (params = []) =>
  Object.fromEntries(
    params.filter((p) => "default" in p).map((p) => [p.name, clone(p.default)]),
  );

export { GROUPS, clone, defaultsOf, paramsOf, title };
