import { parseFlags, loadTimeline, saveTimeline, emit, parseTime } from "./_io.js";
import { resolveTimeline as resolveTimelineArg, timelineUsage } from "./_resolve.js";
import {
  addClip,
  addMarker,
  duplicateClip,
  ensureTimelineCollections,
  listClipTracks,
  moveClip,
  removeClip,
  resizeClip,
  setParam,
} from "../timeline/ops.js";
import { resolveTimeline } from "../engine/time.js";
import { getSceneMeta } from "../scenes/meta.js";

const FLAG_USAGE = {
  "add-clip": timelineUsage("add-clip", " --track=ID --scene=SCENE_ID --start=T --duration=N [--id=CLIP_ID] [--params=k=v,...]"),
  "move-clip": timelineUsage("move-clip", " <clipId> --to=T"),
  "resize-clip": timelineUsage("resize-clip", " <clipId> --duration=N"),
  "remove-clip": timelineUsage("remove-clip", " <clipId>"),
  "set-param": timelineUsage("set-param", " <clipId> --KEY=VALUE [--KEY2=VALUE2]"),
  "add-marker": timelineUsage("add-marker", " --id=ID --at=T [--label=TEXT]"),
  "list-clips": timelineUsage("list-clips", " [--json]"),
  "dup-clip": timelineUsage("dup-clip", " <srcClipId> --to=T"),
};

export async function run(argv, ctx) {
  const { positional, flags } = parseFlags(argv);
  const sub = ctx.subcommand;
  const resolved = resolveTimelineArg(positional, { usage: FLAG_USAGE[sub] });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const timeline = ensureTimelineCollections(loaded.value);
  const outcome = execute(sub, timeline, resolved.rest, flags);
  if (!outcome.ok) {
    emit(outcome, flags);
    return 2;
  }
  if (sub === "list-clips") {
    writeListOutput(outcome, flags);
    return 0;
  }
  const saved = await saveTimeline(resolved.jsonPath, outcome.value);
  if (!saved.ok) {
    emit(saved, flags);
    return 2;
  }
  writeMutationOutput(sub, resolved.jsonPath, outcome, flags);
  return 0;
}

function execute(sub, timeline, positional, flags) {
  if (sub === "add-clip") return execAddClip(timeline, positional, flags);
  if (sub === "move-clip") return execMoveClip(timeline, positional, flags);
  if (sub === "resize-clip") return execResizeClip(timeline, positional, flags);
  if (sub === "remove-clip") return execRemoveClip(timeline, positional, flags);
  if (sub === "set-param") return execSetParam(timeline, positional, flags);
  if (sub === "add-marker") return execAddMarker(timeline, flags);
  if (sub === "list-clips") return execListClips(timeline);
  if (sub === "dup-clip") return execDupClip(timeline, positional, flags);
  return { ok: false, error: { code: "BAD_SUBCOMMAND", message: `unknown ${sub}` } };
}

function execAddClip(timeline, positional, flags) {
  const trackId = flags.track || positional[0];
  if (!trackId) return usageError("add-clip");
  const withTrack = ensureTrack(timeline, trackId);
  if (flags.scene || flags.start !== undefined || flags.duration !== undefined || flags.id || flags.params) {
    if (!flags.scene || flags.start === undefined || flags.duration === undefined) return usageError("add-clip");
    const start = normalizeTimeRefs(parseTimeValue(flags.start), timeline);
    const dur = parseNumber(flags.duration, "BAD_DURATION", "duration must be numeric");
    if (dur.error) return dur.error;
    return addClip(withTrack, trackId, {
      id: flags.id,
      scene: flags.scene,
      start,
      dur: dur.value,
      params: parseParams(flags.params),
    });
  }
  const clipJson = positional[1];
  if (!clipJson) return usageError("add-clip");
  let clip;
  try {
    clip = JSON.parse(clipJson);
  } catch (error) {
    return { ok: false, error: { code: "BAD_JSON", message: `clip JSON invalid: ${error.message}` } };
  }
  return addClip(withTrack, trackId, clip);
}

function execMoveClip(timeline, positional, flags) {
  const clipId = positional[0];
  const target = flags.to ?? positional[1];
  if (!clipId || target === undefined) return usageError("move-clip");
  return moveClip(timeline, clipId, normalizeTimeRefs(parseTimeValue(target), timeline));
}

function execResizeClip(timeline, positional, flags) {
  const clipId = positional[0];
  const target = flags.duration ?? positional[1];
  if (!clipId || target === undefined) return usageError("resize-clip");
  const dur = parseNumber(target, "BAD_DURATION", "duration must be numeric");
  if (dur.error) return dur.error;
  return resizeClip(timeline, clipId, dur.value);
}

function execRemoveClip(timeline, positional) {
  const clipId = positional[0];
  if (!clipId) return usageError("remove-clip");
  return removeClip(timeline, clipId);
}

function execSetParam(timeline, positional, flags) {
  const clipId = positional[0];
  if (!clipId) return usageError("set-param");
  const entries = Object.entries(flags).filter(([key]) => key !== "json");
  if (entries.length === 0) {
    const fallbackEntries = positional.slice(1).map(splitKeyValue);
    if (fallbackEntries.some((entry) => !entry.ok)) {
      return fallbackEntries.find((entry) => !entry.ok);
    }
    return applyParams(timeline, clipId, fallbackEntries.map((entry) => entry.value));
  }
  return applyParams(
    timeline,
    clipId,
    entries.map(([key, raw]) => [key, parseParamValue(raw)])
  );
}

function execAddMarker(timeline, flags) {
  if (!flags.id || flags.at === undefined) return usageError("add-marker");
  const at = parseNumber(flags.at, "BAD_TIME", "marker time must be numeric");
  if (at.error) return at.error;
  return addMarker(timeline, { id: flags.id, at: at.value, label: flags.label });
}

function execListClips(timeline) {
  return { ok: true, value: { tracks: listClipTracks(timeline) } };
}

function execDupClip(timeline, positional, flags) {
  const clipId = positional[0];
  const target = flags.to ?? positional[1];
  if (!clipId || target === undefined) return usageError("dup-clip");
  return duplicateClip(timeline, clipId, normalizeTimeRefs(parseTimeValue(target), timeline));
}

function applyParams(timeline, clipId, entries) {
  if (entries.length === 0) return usageError("set-param");
  let current = timeline;
  for (const [key, value] of entries) {
    const checked = validateSceneParam(current, clipId, key, value);
    if (!checked.ok) return checked;
    const result = setParam(current, clipId, key, value);
    if (!result.ok) return result;
    current = result.value;
  }
  return { ok: true, value: current, clipId, updated: Object.fromEntries(entries) };
}

function splitKeyValue(spec) {
  const index = spec.indexOf("=");
  if (index <= 0) {
    return { ok: false, error: { code: "BAD_KV", message: "expected key=value" } };
  }
  return { ok: true, value: [spec.slice(0, index), parseParamValue(spec.slice(index + 1))] };
}

function writeMutationOutput(sub, path, outcome, flags) {
  const result = successPayload(sub, path, outcome);
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  process.stdout.write(result.message + "\n");
}

function writeListOutput(outcome, flags) {
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: outcome.value }, null, 2) + "\n");
    return;
  }
  const lines = [];
  for (const track of outcome.value.tracks) {
    for (const clip of track.clips) {
      lines.push(
        `[${track.id}] ${clip.id}  ${formatSpan(clip)}  ${clip.scene}  ${formatParams(clip.params)}`
      );
    }
  }
  process.stdout.write((lines.join("\n") || "(no clips)") + "\n");
}

function successPayload(sub, path, outcome) {
  const base = { ok: true, value: { saved: path } };
  if (sub === "add-clip") {
    const payload = { ...base, clip_id: outcome.clipId };
    const resolvedStart = resolveClipStart(outcome.value, outcome.clipId);
    if (resolvedStart !== undefined) payload.resolved_start = resolvedStart;
    payload.message = `added clip ${outcome.clipId}`;
    return payload;
  }
  if (sub === "move-clip") {
    return { ...base, clip_id: outcome.clipId, start: outcome.start, message: `moved clip ${outcome.clipId}` };
  }
  if (sub === "resize-clip") {
    return { ...base, clip_id: outcome.clipId, new_duration: outcome.newDuration, message: `resized clip ${outcome.clipId}` };
  }
  if (sub === "remove-clip") {
    return { ...base, removed: outcome.removed, message: `removed clip ${outcome.removed}` };
  }
  if (sub === "set-param") {
    return { ...base, clip_id: outcome.clipId, updated: outcome.updated, message: `updated params for ${outcome.clipId}` };
  }
  if (sub === "add-marker") {
    return { ...base, marker_id: outcome.markerId, message: `added marker ${outcome.markerId}` };
  }
  if (sub === "dup-clip") {
    return { ...base, clip_id: outcome.clipId, message: `duplicated clip ${outcome.clipId}` };
  }
  return { ...base, message: `updated ${path}` };
}

function resolveClipStart(timeline, clipId) {
  const resolved = resolveTimeline(timeline);
  if (!resolved.ok) return undefined;
  for (const track of resolved.value.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.id === clipId && typeof clip.start === "number") return clip.start;
    }
  }
  return undefined;
}

function emitUsage(sub, flags) {
  emit({ ok: false, error: { code: "USAGE", message: FLAG_USAGE[sub] || timelineUsage(sub) } }, flags);
}

function usageError(sub) {
  return { ok: false, error: { code: "USAGE", message: FLAG_USAGE[sub] } };
}

export function parseParamValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function parseTimeValue(spec) {
  if (typeof spec === "number" || (spec && typeof spec === "object")) return spec;
  const raw = String(spec).trim();
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  const parsed = parseTime(raw);
  return Number.isFinite(parsed) ? parsed : raw;
}

function parseParams(spec) {
  if (!spec) return {};
  const params = {};
  for (const entry of String(spec).split(",")) {
    if (!entry) continue;
    const index = entry.indexOf("=");
    if (index <= 0) continue;
    params[entry.slice(0, index)] = parseParamValue(entry.slice(index + 1));
  }
  return params;
}

function parseNumber(raw, code, message) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { error: { ok: false, error: { code, message: `${message}: ${raw}` } } };
  }
  return { value };
}

function normalizeTimeRefs(value, timeline) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = { ...value };
  for (const key of ["at", "after", "before", "sync", "until", "offset"]) {
    if (typeof normalized[key] !== "string") continue;
    normalized[key] = normalizeRef(normalized[key], timeline);
  }
  return normalized;
}

function normalizeRef(ref, timeline) {
  if (/^(project-(start|end)|clip-|marker-|chapter-)/.test(ref)) return ref;
  const clipIds = new Set((timeline.tracks || []).flatMap((track) => (track.clips || []).map((clip) => clip.id)));
  if (clipIds.has(ref)) return `clip-${ref}`;
  const markerIds = new Set((timeline.markers || []).map((marker) => marker.id));
  if (markerIds.has(ref)) return `marker-${ref}`;
  const chapterIds = new Set((timeline.chapters || []).map((chapter) => chapter.id));
  if (chapterIds.has(ref)) return `chapter-${ref}`;
  return ref;
}

function validateSceneParam(timeline, clipId, key, value) {
  const clip = findClip(timeline, clipId);
  if (!clip) {
    return { ok: false, error: { code: "CLIP_NOT_FOUND", message: `no clip "${clipId}"`, ref: clipId } };
  }
  const meta = getSceneMeta(clip.scene);
  if (!meta) {
    return { ok: false, error: { code: "UNKNOWN_SCENE", message: `unknown scene "${clip.scene}"`, ref: clip.scene } };
  }
  const spec = (meta.params || []).find((entry) => entry.name === key);
  if (!spec) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_PARAM",
        message: `scene "${meta.id}" has no param "${key}"`,
        hint: `available: ${(meta.params || []).map((entry) => entry.name).join(", ")}`,
      },
    };
  }
  if ((spec.type === "string" || spec.type === "color") && typeof value !== "string") {
    return invalidParam(key, "must be a string");
  }
  if (spec.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return invalidParam(key, "must be a finite number");
    if (Array.isArray(spec.range) && (value < spec.range[0] || value > spec.range[1])) {
      return invalidParam(key, `must be in [${spec.range[0]}, ${spec.range[1]}]`);
    }
  }
  if (spec.type === "boolean" && typeof value !== "boolean") {
    return invalidParam(key, "must be true or false");
  }
  if (spec.type === "enum" && !spec.options?.includes(value)) {
    return invalidParam(key, `must be one of ${spec.options.join(", ")}`);
  }
  return { ok: true };
}

function invalidParam(key, hint) {
  return {
    ok: false,
    error: {
      code: "INVALID_PARAM_VALUE",
      message: `param "${key}" is invalid`,
      hint,
    },
  };
}

function findClip(timeline, clipId) {
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.id === clipId) return clip;
    }
  }
  return null;
}

function ensureTrack(timeline, trackId) {
  if ((timeline.tracks || []).some((track) => track.id === trackId)) return timeline;
  return {
    ...timeline,
    tracks: [
      ...(timeline.tracks || []),
      { id: trackId, kind: trackId.startsWith("a") ? "audio" : "video", clips: [] },
    ],
  };
}

function formatSpan(clip) {
  const end = typeof clip.start === "number" && typeof clip.dur === "number" ? clip.start + clip.dur : null;
  if (end === null) return `${formatTimeish(clip.start)}-${formatTimeish(clip.dur)}`;
  return `${formatClock(clip.start)}-${formatClock(end)}`;
}

function formatTimeish(value) {
  return typeof value === "number" ? formatClock(value) : JSON.stringify(value);
}

function formatClock(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  return `${String(min).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
}

function formatParams(params = {}) {
  const entries = Object.entries(params);
  if (entries.length === 0) return "{}";
  return `{${entries.map(([key, value]) => `${key}=${formatParamValue(value)}`).join(",")}}`;
}

function formatParamValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
