import { listKinds } from "../../../../nf-core/kinds/index.js";
import type { Kind } from "../../../../nf-core/kinds/types.js";
import type { TimelineV08 } from "../../../../nf-core/types.js";
import { parseFlags, loadTimeline, saveTimeline, emit } from "../_helpers/_io.js";

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const path = positional[0];
  const kind = typeof flags.kind === "string" ? flags.kind : "";
  const id = typeof flags.id === "string" ? flags.id : "";

  if (!path || !kind || !id) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe tracks add <timeline.json> --kind=<audio|scene|subtitle|animation> --id=<id> [--json]",
        fix: "Provide a v0.8 timeline path plus both --kind and --id.",
      },
    }, flags);
    return 3;
  }

  if (!listKinds().includes(kind as Kind)) {
    emit({
      ok: false,
      error: {
        code: "UNSUPPORTED_KIND",
        message: `unsupported kind "${kind}"`,
        fix: `Use one of: ${listKinds().join(", ")}.`,
      },
    }, flags);
    return 2;
  }

  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const timeline = loaded.value as Partial<TimelineV08>;
  if (timeline.version !== "0.8" || !Array.isArray(timeline.tracks)) {
    emit({
      ok: false,
      error: {
        code: "UNSUPPORTED_FORMAT",
        message: "tracks add requires a v0.8 timeline with tracks[]",
        fix: "Use a timeline JSON whose top-level version is \"0.8\".",
      },
    }, flags);
    return 2;
  }

  if (timeline.tracks.some((track) => track?.id === id)) {
    emit({
      ok: false,
      error: {
        code: "TRACK_ID_EXISTS",
        message: `track id "${id}" already exists`,
        fix: "Choose a new --id value.",
      },
    }, flags);
    return 2;
  }

  const nextTrack = { id, kind, clips: [] };
  const updatedTimeline: TimelineV08 = {
    ...(timeline as TimelineV08),
    tracks: [...timeline.tracks, nextTrack],
  };

  const saved = await saveTimeline(path, updatedTimeline);
  if (!saved.ok) {
    emit(saved, flags);
    return 2;
  }

  emit({
    ok: true,
    value: {
      path,
      track: nextTrack,
      trackCount: updatedTimeline.tracks.length,
    },
  }, flags);
  return 0;
}
