import type { AnchorDict } from "../../../../nf-core/anchors/types.js";
import { parse } from "../../../../nf-core/anchors/parser.js";
import { resolve } from "../../../../nf-core/anchors/resolver.js";
import type { TimelineV08 } from "../../../../nf-core/types.js";
import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";

const SIMPLE_ANCHOR_EXPR = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\.(begin|end|at)\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(s|ms))?\s*$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNotImplemented(error: unknown) {
  return error instanceof Error && /NOT_IMPLEMENTED/.test(error.message);
}

function resolveFallback(dict: AnchorDict, expr: string): number | null {
  const match = expr.match(SIMPLE_ANCHOR_EXPR);
  if (!match) return null;
  const [, anchorId, point, op, rawValue, unit] = match;
  const entry = dict[anchorId];
  if (!entry) return null;
  const base = entry[point as "begin" | "end" | "at"];
  if (!isFiniteNumber(base)) return null;
  if (!rawValue || !unit || !op) return base;
  const offset = Number(rawValue) * (unit === "s" ? 1000 : 1);
  return op === "+" ? base + offset : base - offset;
}

function resolveTime(dict: AnchorDict, value: unknown) {
  if (isFiniteNumber(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    parse(value);
    return resolve(dict, value);
  } catch (error) {
    if (!isNotImplemented(error)) return null;
  }
  return resolveFallback(dict, value);
}

function summarizeTracks(timeline: TimelineV08) {
  return (timeline.tracks || []).map((track, trackIndex) => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const clip of Array.isArray(track.clips) ? track.clips : []) {
      const begin = resolveTime(timeline.anchors || {}, clip.begin ?? clip.at);
      const end = resolveTime(timeline.anchors || {}, clip.end ?? clip.at);
      if (begin !== null) min = Math.min(min, begin);
      if (end !== null) max = Math.max(max, end);
    }
    return {
      id: typeof track.id === "string" && track.id.trim().length > 0 ? track.id : `track_${trackIndex}`,
      kind: track.kind,
      clipCount: Array.isArray(track.clips) ? track.clips.length : 0,
      duration: Number.isFinite(min) ? Math.max(0, max - min) : 0,
    };
  });
}

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const path = positional[0];
  if (!path) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe tracks list <timeline.json> [--json]",
        fix: "Provide a v0.8 timeline JSON path.",
      },
    }, flags);
    return 3;
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
        message: "tracks list requires a v0.8 timeline with tracks[]",
        fix: "Use a timeline JSON whose top-level version is \"0.8\".",
      },
    }, flags);
    return 2;
  }

  const rows = summarizeTracks(timeline as TimelineV08);
  if (flags.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  } else {
    for (const row of rows) {
      process.stdout.write(`${row.id}\t${row.kind}\tclips=${row.clipCount}\tduration=${row.duration}ms\n`);
    }
  }
  return 0;
}
