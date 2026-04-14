// Describes the active scenes at a specific timeline time by calling scene describe() hooks.
import { emit, loadTimeline, parseFlags, parseTime } from "../_helpers/_io.js";
import { resolveTimeline as resolveTimelineArgs, timelineUsage } from "../_helpers/_resolve.js";
import { resolveTimeline as resolveLegacyTimeline } from "../../engine/legacy/time.js";
import * as runtimeScenes from "../../../../nf-runtime/web/src/components/index.js";

const USAGE = timelineUsage("describe-frame", " <t>", " <t>");
const SCENE_REGISTRY = new Map(Object.entries(runtimeScenes));

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimelineArgs(positional, { usage: USAGE });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  if (resolved.rest.length !== 1) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const t = parseTime(resolved.rest[0]);
  if (!Number.isFinite(t) || t < 0) {
    emit({
      ok: false,
      error: {
        code: "BAD_TIME",
        message: `cannot parse time "${resolved.rest[0]}"`,
        hint: "use seconds or mm:ss(.f)",
      },
    }, flags);
    return 3;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const normalized = normalizeTimeline(loaded.value);
  if (!normalized.ok) {
    emit(normalized, flags);
    return 2;
  }

  const described = describeFrame(normalized.value, t);
  if (!described.ok) {
    emit(described, flags);
    return 2;
  }

  process.stdout.write(`${JSON.stringify(described.value, null, 2)}\n`);
  return 0;
}

function normalizeTimeline(timeline) {
  if (Array.isArray(timeline?.layers)) {
    return {
      ok: true,
      value: timeline.layers.map((layer) => ({
        ...layer,
        start: Number(layer?.start),
        dur: Number(layer?.dur),
      })),
    };
  }

  if (!Array.isArray(timeline?.tracks)) {
    return {
      ok: false,
      error: {
        code: "BAD_TIMELINE",
        message: "timeline must contain layers[] or tracks[].clips[]",
        hint: "provide a valid NextFrame timeline JSON file",
      },
    };
  }

  const resolved = resolveLegacyTimeline(timeline);
  if (!resolved.ok) {
    return resolved;
  }

  const layers = [];
  for (const track of resolved.value.tracks || []) {
    if (track?.muted || track?.kind === "audio") continue;
    for (const clip of track.clips || []) {
      layers.push({
        ...clip,
        trackId: clip?.trackId || track?.id || null,
        start: Number(clip?.start),
        dur: Number(clip?.dur),
      });
    }
  }

  return { ok: true, value: layers };
}

export function describeFrame(layers, t) {
  const activeClips = [];

  for (const clip of layers) {
    if (!Number.isFinite(clip?.start) || !Number.isFinite(clip?.dur) || clip.dur <= 0) {
      continue;
    }
    if (t < clip.start || t >= clip.start + clip.dur) {
      continue;
    }

    const scene = SCENE_REGISTRY.get(clip.scene);
    if (!scene || typeof scene.describe !== "function") {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_SCENE",
          message: `cannot describe active clip "${clip.id || "unknown"}": unknown scene "${clip.scene || ""}"`,
          hint: "register the scene in src/nf-runtime/web/src/components/index.js or fix the timeline scene id",
        },
      };
    }

    try {
      activeClips.push({
        id: clip.id || null,
        scene: clip.scene,
        describe_result: scene.describe(clip.params || clip.data || {}, clip, t - clip.start),
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "DESCRIBE_FAIL",
          message: `scene "${clip.scene}" describe() failed for clip "${clip.id || "unknown"}": ${error.message}`,
          hint: "check the scene describe() implementation and the clip params it receives",
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      time: t,
      active_clips: activeClips,
    },
  };
}
