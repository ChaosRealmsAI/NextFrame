// nextframe match validate <timeline>
import { readFileSync } from "node:fs";
import { emit, parseFlags } from "../_helpers/_io.js";
import { resolveTimeline } from "../_helpers/_resolve.js";
import { dispatchValidate } from "../../../../nf-core/matches/index.js";
import type { Match, Timeline, ValidationIssue } from "../../../../nf-core/types.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, {
    usage: "usage: nextframe match validate <project> <episode> <segment>\n   or: nextframe match validate <timeline.json>",
  });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const timelinePath = resolved.jsonPath;
  let timeline: Timeline;
  try {
    timeline = JSON.parse(readFileSync(timelinePath, "utf8")) as Timeline;
  } catch (err) {
    emit({ ok: false, error: { code: "READ_FAILED", message: `cannot read ${timelinePath}: ${(err as Error).message}` } }, flags);
    return 2;
  }

  const matches = Array.isArray(timeline.matches) ? (timeline.matches as Match[]) : [];
  if (matches.length === 0) {
    emit({ ok: true, value: { summary: "no matches to validate", matchCount: 0, errors: [] } }, flags);
    return 0;
  }

  const aggregated: Array<{ match: string; error: ValidationIssue }> = [];
  for (const match of matches) {
    const res = dispatchValidate(match, timeline);
    if (!res.ok) {
      for (const err of res.errors ?? []) {
        aggregated.push({ match: match.rule, error: err });
      }
    }
  }

  if (aggregated.length > 0) {
    emit({ ok: false, error: { code: "VALIDATION_FAILED", message: `${aggregated.length} error(s) across ${matches.length} match rule(s)`, hint: JSON.stringify(aggregated) } }, flags);
    return 1;
  }

  emit({ ok: true, value: { summary: "all matches valid", matchCount: matches.length, errors: [] } }, flags);
  return 0;
}
