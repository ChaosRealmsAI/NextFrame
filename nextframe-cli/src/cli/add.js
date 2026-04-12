// nextframe add-clip / move-clip / resize-clip
import { parseFlags, loadTimeline, saveTimeline, emit } from "./_io.js";
import { addClip, moveClip, resizeClip } from "../timeline/ops.js";

export async function run(argv, ctx) {
  const { positional, flags } = parseFlags(argv);
  const sub = ctx.subcommand;
  const [path, ...rest] = positional;
  if (!path) {
    emit({ ok: false, error: { code: "USAGE", message: `usage: nextframe ${sub} <timeline> ...` } }, flags);
    return 3;
  }
  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  let result;
  if (sub === "add-clip") {
    const [trackId, clipJson] = rest;
    if (!trackId || !clipJson) {
      emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe add-clip <timeline> <trackId> <clip-json>" } }, flags);
      return 3;
    }
    let clip;
    try {
      clip = JSON.parse(clipJson);
    } catch (err) {
      emit({ ok: false, error: { code: "BAD_JSON", message: `clip JSON invalid: ${err.message}` } }, flags);
      return 3;
    }
    result = addClip(loaded.value, trackId, clip);
  } else if (sub === "move-clip") {
    const [clipId, startSpec] = rest;
    if (!clipId || startSpec === undefined) {
      emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe move-clip <timeline> <clipId> <start>" } }, flags);
      return 3;
    }
    const start = parseStartSpec(startSpec);
    result = moveClip(loaded.value, clipId, start);
  } else if (sub === "resize-clip") {
    const [clipId, durSpec] = rest;
    if (!clipId || durSpec === undefined) {
      emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe resize-clip <timeline> <clipId> <dur>" } }, flags);
      return 3;
    }
    const dur = Number(durSpec);
    if (!Number.isFinite(dur)) {
      emit({ ok: false, error: { code: "BAD_DUR", message: `cannot parse "${durSpec}"` } }, flags);
      return 3;
    }
    result = resizeClip(loaded.value, clipId, dur);
  } else {
    emit({ ok: false, error: { code: "BAD_SUB", message: `unknown ${sub}` } }, flags);
    return 3;
  }
  if (!result.ok) {
    emit(result, flags);
    return 2;
  }
  const saved = await saveTimeline(path, result.value);
  if (!saved.ok) {
    emit(saved, flags);
    return 2;
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { saved: path } }, null, 2) + "\n");
  } else {
    process.stdout.write(`updated ${path}\n`);
  }
  return 0;
}

function parseStartSpec(spec) {
  // Try JSON first ({"after":"clip-x","gap":0.5})
  if (spec.startsWith("{")) {
    try {
      return JSON.parse(spec);
    } catch {
      // fall through
    }
  }
  // after:clip-x:0.5 syntax → {after:'clip-x', gap:0.5}
  const m = spec.match(/^(after|before|at|sync|until):([^:]+)(?::(.+))?$/);
  if (m) {
    const op = m[1];
    const ref = m[2];
    const gap = m[3] !== undefined ? Number(m[3]) : 0;
    return op === "after" || op === "before" ? { [op]: ref, gap } : { [op]: ref };
  }
  // raw seconds
  const num = Number(spec);
  if (Number.isFinite(num)) return num;
  return spec;
}
