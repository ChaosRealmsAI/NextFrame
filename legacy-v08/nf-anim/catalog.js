import {
  GROUPS,
  clone,
  defaultsOf,
  paramsOf,
} from "./catalogShared.js";
import { sampleMotion } from "./catalogSampleMotion.js";

// TODO: promote this into a first-class public API if external tools start depending on it.
const meta = {
  name: "catalog",
  kind: "nf-anim",
  description: "Shared AI-facing catalog helpers",
};

export function describeEntry(kind = "", id = "") {
  const one = GROUPS[kind]?.[id];
  if (!one) return null;

  return kind === "scene"
    ? {
        kind,
        id: one.id,
        name: one.id,
        category: one.category,
        description: one.description,
        ratio: one.ratio,
        type: one.type,
        duration_hint: one.duration_hint,
        params: paramsOf(one),
        sample: one.sample?.() || {},
      }
    : { kind, ...(one.meta || { id }), id: one.meta?.name || id };
}

export function listCatalog(kind = "", category = "") {
  const pick = (name) =>
    Object.keys(GROUPS[name] || {})
      .sort()
      .map((id) => describeEntry(name, id))
      .filter((entry) => !category || entry.category === category);

  return kind
    ? pick(kind)
    : {
        behaviors: pick("behavior"),
        shapes: pick("shape"),
        scenes: pick("scene"),
      };
}

export function sampleFor(kind = "", id = "") {
  const entry = describeEntry(kind, id);
  if (!entry) return null;

  return {
    kind,
    id,
    name: entry.name || entry.id,
    params:
      kind === "scene" ? clone(entry.sample || {}) : defaultsOf(entry.params),
    motion: sampleMotion(kind, GROUPS[kind][id]),
  };
}

export { meta };
