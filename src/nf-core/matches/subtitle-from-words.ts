// Match rule for auto-generating subtitles from narration word metadata.
import type { AudioTrack, Match, PlanCtx, SubtitleTrack, Timeline, Track, ValidationIssue, ValidationResult } from "../types.js";

export const name = "subtitle-from-words";

type MatchLevel = "word" | "sentence";

function okResult(): ValidationResult {
  return {
    ok: true,
    errors: [],
    warnings: [],
  };
}

function failResult(errors: ValidationIssue[]): ValidationResult {
  return {
    ok: false,
    errors,
    warnings: [],
  };
}

function isAudioTrack(track: Track | undefined): track is AudioTrack {
  return Boolean(track && track.kind === "audio");
}

function isSubtitleTrack(track: Track | undefined): track is SubtitleTrack {
  return Boolean(track && track.kind === "subtitle");
}

function findTrack(trackId: string, timeline: Timeline): Track | undefined {
  return Array.isArray(timeline.tracks)
    ? timeline.tracks.find((track) => track?.id === trackId)
    : undefined;
}

function normalizeLevel(match: Match): MatchLevel | null {
  const level = typeof match.level === "string" ? match.level : "word";
  if (level === "word" || level === "sentence") {
    return level;
  }
  return null;
}

function hasWordMetadata(track: AudioTrack): boolean {
  const segments = track.meta?.segments;
  return Array.isArray(segments)
    && segments.length > 0
    && segments.every((segment) => Array.isArray(segment.words));
}

export async function plan(_ctx: PlanCtx): Promise<null> {
  // This rule is a pure source-to-target mapping from existing word timings.
  return null;
}

export function validate(match: Match, timeline: Timeline): ValidationResult {
  const errors: ValidationIssue[] = [];
  const source = findTrack(match.source, timeline);
  const target = findTrack(match.target, timeline);
  const level = normalizeLevel(match);

  if (!isAudioTrack(source)) {
    errors.push({
      code: "INVALID_SOURCE_TRACK",
      message: "subtitle-from-words source must be an audio track",
      ref: match.source,
      hint: "Fix: set match.source to an audio track id with meta.segments[].words[]",
    });
  } else if (!hasWordMetadata(source)) {
    errors.push({
      code: "MISSING_WORD_METADATA",
      message: "subtitle-from-words source must include meta.segments[].words[]",
      ref: match.source,
      hint: "Fix: regenerate or attach narration metadata with per-word timings",
    });
  }

  if (!isSubtitleTrack(target)) {
    errors.push({
      code: "INVALID_TARGET_TRACK",
      message: "subtitle-from-words target must be a subtitle track",
      ref: match.target,
      hint: "Fix: set match.target to a subtitle track id",
    });
  }

  if (!level) {
    errors.push({
      code: "INVALID_MATCH_LEVEL",
      message: "subtitle-from-words level must be 'word' or 'sentence'",
      ref: match.target,
      hint: "Fix: omit level for the default 'word' mode, or set it to 'sentence'",
    });
  }

  return errors.length > 0 ? failResult(errors) : okResult();
}

export function expand(_match: Match, _timeline: Timeline): Partial<Timeline> {
  throw new Error("not implemented");
}
