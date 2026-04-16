// Handles layer list and CRUD CLI subcommands for v0.3 timeline files.
import { parseFlags, loadTimeline, saveTimeline, emit } from "../_helpers/_io.js";
import { resolveTimeline, timelineUsage } from "../_helpers/_resolve.js";
import { addLayer, listLayers, moveLayer, removeLayer, resizeLayer, setLayerProps } from "../../../../nf-core/engine/ops.js";
import type { Timeline } from "../../../../nf-core/types.js";
import { validateTimelineV3 } from "../_helpers/_timeline-validate.js";

export async function run(argv: string[], context: { subcommand?: string; params?: Record<string, unknown> } = {}) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage(context.subcommand || "layer-list") });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const timeline = loaded.value as Timeline;

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
      result = moveLayer(timeline, resolved.rest[0], toNumber(flags.start) ?? 0);
      break;
    case "layer-resize":
      result = resizeLayer(timeline, resolved.rest[0], toNumber(flags.dur) ?? 0);
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
    const validation = await validateTimelineV3(timeline as Record<string, unknown>);
    if (!validation.ok) {
      emit({ ...validation, ok: false, error: { code: "VALIDATION_FAILED", message: validation.errors?.[0]?.message || "validation failed" } }, flags);
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

function parseLayerAddPayload(rest: string[], flags: Record<string, string | boolean>) {
  const [scene] = rest;
  return {
    id: typeof flags.id === "string" ? flags.id : `${scene}-${Date.now()}`,
    scene,
    start: toNumber(flags.start),
    dur: toNumber(flags.dur),
    params: parseJsonFlag(flags.params),
    x: typeof flags.x === "string" ? flags.x : undefined,
    y: typeof flags.y === "string" ? flags.y : undefined,
    w: typeof flags.w === "string" ? flags.w : undefined,
    h: typeof flags.h === "string" ? flags.h : undefined,
    zIndex: toNumber(flags.z),
    enter: typeof flags.enter === "string" ? parseJsonFlag(flags.enter) : undefined,
    exit: typeof flags.exit === "string" ? parseJsonFlag(flags.exit) : undefined,
    transition: typeof flags.transition === "string" ? flags.transition : undefined,
    opacity: toNumber(flags.opacity),
    blend: typeof flags.blend === "string" ? flags.blend : undefined,
  };
}

function parseAssignments(args: string[], flags: Record<string, string | boolean>) {
  const props: Record<string, unknown> = {};
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

function parseJsonFlag(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseScalar(raw: string) {
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

function toNumber(raw: unknown) {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
