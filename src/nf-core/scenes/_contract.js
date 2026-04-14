export class SceneContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "SceneContractError";
  }
}

export function assertSceneContract(id, entry) {
  if (!entry) throw new SceneContractError(`${id}: REGISTRY entry missing`);
  if (typeof entry.render !== "function") throw new SceneContractError(`${id}: render not a function`);
  if (typeof entry.describe !== "function") throw new SceneContractError(`${id}: describe not a function`);
  const meta = entry.META;
  if (!meta || typeof meta !== "object") throw new SceneContractError(`${id}: META missing`);
  for (const k of ["id", "category", "description", "duration_hint", "params"]) {
    if (meta[k] === undefined) throw new SceneContractError(`${id}: META.${k} missing`);
  }
  if (!Array.isArray(meta.params)) throw new SceneContractError(`${id}: META.params not array`);
  for (const p of meta.params) {
    if (!p.name || !p.type) throw new SceneContractError(`${id}: META.params entry missing name/type`);
  }
}

export function assertNoDuplicateIds(ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new SceneContractError(`duplicate scene id "${id}" — registry must not collide`);
    }
    seen.add(id);
  }
}
