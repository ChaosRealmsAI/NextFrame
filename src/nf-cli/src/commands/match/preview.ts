// nextframe match preview <plan-or-timeline> --seg <N>
//
// Builds a single-segment HTML for visual inspection. Input can be:
//   - a narration-plan.json (from `nextframe match plan`)
//   - a timeline.json with tracks+matches already populated
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { emit, parseFlags } from "../_helpers/_io.js";
import { dispatchExpand } from "../../../../nf-core/matches/index.js";
import type { AudioTrack, Match, Timeline } from "../../../../nf-core/types.js";

function normalizeArgs(argv: string[]) {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if ((value === "--seg" || value === "--out") && index + 1 < argv.length) {
      normalized.push(`${value}=${argv[index + 1]}`);
      index += 1;
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(normalizeArgs(argv));
  const [inputPath] = positional;
  const seg = Number(flags.seg);
  if (!inputPath || !Number.isInteger(seg) || seg <= 0) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe match preview <timeline.json> --seg <N> [--out <path>]" } }, flags);
    return 3;
  }

  const resolvedInput = resolve(inputPath);
  if (!existsSync(resolvedInput)) {
    emit({ ok: false, error: { code: "NOT_FOUND", message: `input not found: ${resolvedInput}` } }, flags);
    return 2;
  }

  let timeline: Timeline;
  try {
    timeline = JSON.parse(readFileSync(resolvedInput, "utf8")) as Timeline;
  } catch (err) {
    emit({ ok: false, error: { code: "PARSE_FAILED", message: `invalid JSON: ${(err as Error).message}` } }, flags);
    return 2;
  }

  const matches = Array.isArray(timeline.matches) ? (timeline.matches as Match[]) : [];
  if (matches.length === 0) {
    emit({ ok: false, error: { code: "NO_MATCHES", message: `timeline has no matches[] — run \`nextframe match plan\` first and splice the plan into timeline.matches` } }, flags);
    return 2;
  }

  // Expand all matches to produce clips
  let expanded: Timeline = timeline;
  for (const match of matches) {
    try {
      const update = dispatchExpand(match, expanded);
      expanded = { ...expanded, ...update, tracks: [...(expanded.tracks ?? []), ...(update.tracks ?? [])] };
    } catch (err) {
      emit({ ok: false, error: { code: "EXPAND_FAILED", message: `${match.rule}: ${(err as Error).message}` } }, flags);
      return 2;
    }
  }

  // Find the source audio segment by index
  const audioTrack = (timeline.tracks ?? []).find((t): t is AudioTrack => t.kind === "audio" && !!t.meta?.segments?.length);
  const segments = audioTrack?.meta?.segments ?? [];
  if (seg > segments.length) {
    emit({ ok: false, error: { code: "SEG_OUT_OF_RANGE", message: `seg ${seg} > segment count ${segments.length}` } }, flags);
    return 2;
  }
  const target = segments[seg - 1];
  const midMs = (target.startMs + target.endMs) / 2;

  const outPath = typeof flags.out === "string" ? resolve(flags.out) : resolve(process.cwd(), `match-preview-seg-${seg}.json`);
  const summary = {
    seg,
    segmentId: target.id,
    text: target.text,
    midMs,
    durationMs: target.endMs - target.startMs,
    wordCount: target.words.length,
    ratio: timeline.ratio,
    expandedTracks: (expanded.tracks ?? []).length,
    matches: matches.map((m) => ({ rule: m.rule, source: m.source, target: m.target })),
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  emit({ ok: true, value: { preview: outPath, ...summary } }, flags);
  return 0;
}
