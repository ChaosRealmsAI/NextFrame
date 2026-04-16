// Describes the active scenes at a specific timeline time by calling scene describe() hooks.
import { emit, loadTimeline, parseFlags, parseTime } from "../_helpers/_io.js";
import { resolveTimeline as resolveTimelineArgs, timelineUsage } from "../_helpers/_resolve.js";
import { resolveTimeline as resolveLegacyTimeline } from "../_helpers/_legacy-timeline.js";
import { REGISTRY as SCENE_REGISTRY } from "../../lib/scene-registry.js";
import type { Timeline } from "../../../../nf-core/types.js";

const USAGE = timelineUsage("describe-frame", " <t>", " <t>");

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimelineArgs(positional, { usage: USAGE });
  if (resolved.ok === false) {
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

  const normalized = normalizeTimeline(loaded.value as Record<string, unknown>);
  if (!normalized.ok) {
    emit(normalized as unknown as Parameters<typeof emit>[0], flags);
    return 2;
  }

  const described = describeFrame(normalized.value as Record<string, unknown>[], t);
  if (!described.ok) {
    emit(described, flags);
    return 2;
  }

  process.stdout.write(`${JSON.stringify(described.value, null, 2)}\n`);
  return 0;
}

function normalizeTimeline(timeline: Record<string, unknown>) {
  if (Array.isArray(timeline?.layers)) {
    return {
      ok: true,
      value: timeline.layers.map((layer: Record<string, unknown>) => ({
        ...layer,
        start: Number(layer?.start),
        dur: Number(layer?.dur)
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
  if (resolved.ok === false) {
    return resolved;
  }

  const layers = [];
  const resolvedTimeline = resolved.value as Timeline;
  for (const track of resolvedTimeline.tracks || []) {
    if (track?.muted || track?.kind === "audio") continue;
    for (const clip of track.clips || []) {
      layers.push({
        ...(clip as Record<string, unknown>),
        trackId: (clip as Record<string, unknown>)["trackId"] || track?.id || null,
        start: Number(clip?.start),
        dur: Number(clip?.dur),
      });
    }
  }

  return { ok: true, value: layers };
}

export function describeFrame(layers: Record<string, unknown>[], t: number) {
  const activeClips = [];

  for (const clip of layers) {
    const clipStart = Number(clip.start);
    const clipDur = Number(clip.dur);
    if (!Number.isFinite(clipStart) || !Number.isFinite(clipDur) || clipDur <= 0) {
      continue;
    }
    if (t < clipStart || t >= clipStart + clipDur) {
      continue;
    }

    const scene = SCENE_REGISTRY.get(clip.scene as string);
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
        describe_result: scene.describe((clip.params || clip.data || {}) as Record<string, unknown>, clip, t - clipStart),
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "DESCRIBE_FAIL",
          message: `scene "${clip.scene}" describe() failed for clip "${clip.id || "unknown"}": ${(error as Error).message}`,
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
