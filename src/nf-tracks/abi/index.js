// Track ABI contract. Every Track module exports:
//   - describe(): JSON-schema-like params descriptor
//   - sample(): example props
//   - render(t, keyframes, viewport): { dom?, audio? }
//
// `validateTrack` is a runtime check used by the linter and by nf-runtime on hot-load.

const REQUIRED = ["describe", "sample", "render"];

export function validateTrack(mod) {
  const errors = [];
  for (const key of REQUIRED) {
    if (typeof mod[key] !== "function") {
      errors.push(`missing export: ${key}`);
    }
  }
  if (errors.length === 0) {
    let describe;
    try {
      describe = mod.describe();
    } catch (err) {
      errors.push(`describe() threw: ${err?.message ?? String(err)}`);
    }
    if (describe && typeof describe !== "object") {
      errors.push("describe() must return an object");
    }
  }
  return { ok: errors.length === 0, errors };
}
