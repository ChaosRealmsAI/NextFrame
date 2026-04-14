import { parseFlags, loadTimeline, saveTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";
import { addLayer, listLayers, moveLayer, removeLayer, resizeLayer, setLayerProps } from "../engine-v2/ops.js";
import { validateTimeline } from "../engine-v2/validate.js";

export async function run(argv, context = {}) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage(context.subcommand || "layer-list") });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const timeline = loaded.value;

  const subcommand = context.subcommand;
  let result;
  switch (subcommand) {
    case "layer-list":
      result = listLayers(timeline);
      break;
    case "layer-add":
      result = addLayer(timeline, parseLayerAddPayload(resolved.rest, flags));
      break;
    case "layer-move":
      result = moveLayer(timeline, resolved.rest[0], flags.start);
      break;
    case "layer-resize":
      result = resizeLayer(timeline, resolved.rest[0], flags.dur);
      break;
    case "layer-remove":
      result = removeLayer(timeline, resolved.rest[0]);
      break;
    case "layer-set":
      result = setLayerProps(timeline, resolved.rest[0], parseAssignments(resolved.rest.slice(1), flags));
      break;
    default:
      result = { ok: false, error: { code: "USAGE", message: `unsupported subcommand ${subcommand}` } };
  }

  if (!result.ok) {
    emit(result, flags);
    return 2;
  }

  if (subcommand !== "layer-list") {
    const validation = validateTimeline(timeline);
    if (!validation.ok) {
      emit({ ok: false, error: { code: "VALIDATION_FAILED", message: validation.errors[0]?.message || "validation failed" }, ...validation }, flags);
      return 2;
    }
    const saved = await saveTimeline(resolved.jsonPath, timeline);
    if (!saved.ok) {
      emit(saved, flags);
      return 2;
    }
    emit({ ok: true, value: result.value }, flags);
    return 0;
  }

  emit(result, flags);
  return 0;
}

function parseLayerAddPayload(rest, flags) {
  const [scene] = rest;
  return {
    id: flags.id || `${scene}-${Date.now()}`,
    scene,
    start: flags.start,
    dur: flags.dur,
    params: parseJsonFlag(flags.params),
    x: flags.x,
    y: flags.y,
    w: flags.w,
    h: flags.h,
    zIndex: toNumber(flags.z),
    enter: flags.enter,
    exit: flags.exit,
    transition: flags.transition,
    opacity: toNumber(flags.opacity),
    blend: flags.blend,
  };
}

function parseAssignments(args, flags) {
  const props = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq <= 0) continue;
    const key = arg.slice(0, eq);
    const raw = arg.slice(eq + 1);
    props[key] = parseScalar(raw);
  }
  if (flags.params) {
    props.params = parseJsonFlag(flags.params);
  }
  return props;
}

function parseJsonFlag(raw) {
  if (!raw) return undefined;
  try {
    return JSON.parse(String(raw));
  } catch {
    return undefined;
  }
}

function parseScalar(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toNumber(raw) {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
