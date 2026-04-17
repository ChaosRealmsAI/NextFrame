// Track ABI contract. Single file, zero external imports.
//
// Every Track module exports:
//   - describe(): JSON Schema draft-07 object for props
//   - sample(): valid props (satisfies describe())
//   - render(t, keyframes, viewport): { dom?, audio? }
//
// This module exports runtime validation helpers used by the scanner,
// the AJV validator, and by nf-runtime on hot-load.

const REQUIRED_EXPORTS = ["describe", "sample", "render"];

/**
 * Runtime check that a module exports describe/sample/render as functions.
 * @param {object} mod  Imported Track module (ES module namespace or plain object).
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTrackModule(mod) {
  const errors = [];
  if (!mod || typeof mod !== "object") {
    return { ok: false, errors: ["module is not an object"] };
  }
  for (const key of REQUIRED_EXPORTS) {
    if (typeof mod[key] !== "function") {
      errors.push(`missing export: ${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Lightweight check that describe() returns a draft-07 JSON Schema object.
 * Does not fully validate the schema — only the basic envelope.
 * @param {unknown} desc  Value returned from describe().
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDescribe(desc) {
  const errors = [];
  if (!desc || typeof desc !== "object" || Array.isArray(desc)) {
    return { ok: false, errors: ["describe() must return a plain object"] };
  }
  if (desc.type !== "object") {
    errors.push("describe() schema must have type === 'object'");
  }
  if (!desc.properties || typeof desc.properties !== "object") {
    errors.push("describe() schema must have a 'properties' map");
  }
  if (desc.required !== undefined && !Array.isArray(desc.required)) {
    errors.push("describe() 'required' must be an array when present");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Safe wrapper around render(). Returns { ok, dom, audio, error }.
 * Catches thrown errors so the runtime can log + skip the track.
 * @param {object} mod       Validated Track module.
 * @param {object} keyframes Array or object of keyframe props.
 * @param {number} t         Time in 0..1 (or seconds — track-dependent).
 * @param {{w:number,h:number}} viewport
 */
export function renderInto(mod, keyframes, t, viewport) {
  try {
    const out = mod.render(t, keyframes, viewport);
    if (!out || typeof out !== "object") {
      return { ok: false, error: "render() must return an object" };
    }
    return { ok: true, dom: out.dom, audio: out.audio };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Full validation: module shape + describe() envelope + sample() callable.
 * Used by the scanner's runtime step.
 */
export function validateTrack(mod) {
  const shape = validateTrackModule(mod);
  if (!shape.ok) return shape;
  const errors = [];
  let describe;
  try {
    describe = mod.describe();
  } catch (err) {
    errors.push(`describe() threw: ${err?.message ?? String(err)}`);
  }
  if (describe !== undefined) {
    const descCheck = validateDescribe(describe);
    if (!descCheck.ok) errors.push(...descCheck.errors);
  }
  try {
    mod.sample();
  } catch (err) {
    errors.push(`sample() threw: ${err?.message ?? String(err)}`);
  }
  return { ok: errors.length === 0, errors };
}
