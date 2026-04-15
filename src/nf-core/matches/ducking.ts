// Runtime should read duckingSchedule against the current playback time and set the
// target audioEl.volume to the latest schedule point's volume on each tick.
import type { AudioTrack, Match, PlanCtx, Segment, Timeline, Track, ValidationIssue, ValidationResult } from "../types.js";

export const name = "ducking";

export interface DuckingSchedulePoint {
  tMs: number;
  volume: number;
}

interface DuckingTrackPatch extends AudioTrack {
  duckingSchedule: DuckingSchedulePoint[];
}

const DEFAULT_DUCK_TO = 0.1;
const DEFAULT_FADE_MS = 50;

export async function plan(_ctx: PlanCtx): Promise<unknown> {
  return {
    duckTo: DEFAULT_DUCK_TO,
    fadeMs: DEFAULT_FADE_MS,
  };
}

function getTracks(timeline: Timeline): AudioTrack[] {
  return (timeline.tracks ?? []).filter((track): track is AudioTrack => track.kind === "audio");
}

function findAnyTrack(timeline: Timeline, trackId: string): Track | undefined {
  return (timeline.tracks ?? []).find((track) => track.id === trackId);
}

function findTrack(timeline: Timeline, trackId: string): AudioTrack | undefined {
  return getTracks(timeline).find((track) => track.id === trackId);
}

function isValidDuckingLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidFadeMs(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function getMatchOption(match: Match, key: "duckTo" | "fadeMs"): unknown {
  if (!Object.prototype.hasOwnProperty.call(match, key) || match[key] === undefined) {
    return key === "duckTo" ? DEFAULT_DUCK_TO : DEFAULT_FADE_MS;
  }
  return match[key];
}

function resolveDuckTo(match: Match): number | undefined {
  const duckTo = getMatchOption(match, "duckTo");
  return isValidDuckingLevel(duckTo) ? duckTo : undefined;
}

function resolveFadeMs(match: Match): number | undefined {
  const fadeMs = getMatchOption(match, "fadeMs");
  return isValidFadeMs(fadeMs) ? fadeMs : undefined;
}

function buildValidationResult(errors: ValidationIssue[]): ValidationResult {
  return {
    ok: errors.length === 0,
    errors,
    warnings: [],
  };
}

function getSourceSegments(track: AudioTrack | undefined): Segment[] | undefined {
  return track?.meta?.segments;
}

export function validate(match: Match, timeline: Timeline): ValidationResult {
  const errors: ValidationIssue[] = [];
  const sourceTrack = findAnyTrack(timeline, match.source);
  const targetTrack = findAnyTrack(timeline, match.target);
  const source = findTrack(timeline, match.source);
  const target = findTrack(timeline, match.target);
  const sourceSegments = getSourceSegments(source);

  if (!sourceTrack) {
    errors.push({
      code: "DUCKING_SOURCE_MISSING",
      message: `ducking source track "${match.source}" was not found`,
      ref: match.source,
      hint: "suggest: set source to an existing audio track id with meta.segments",
    });
  } else if (sourceTrack.kind !== "audio") {
    errors.push({
      code: "DUCKING_SOURCE_NOT_AUDIO",
      message: `ducking source track "${match.source}" must be audio`,
      ref: match.source,
      hint: "suggest: point source at the narration audio track",
    });
  } else if (!Array.isArray(sourceSegments) || sourceSegments.length < 1) {
    errors.push({
      code: "DUCKING_SOURCE_SEGMENTS_REQUIRED",
      message: `ducking source track "${match.source}" must provide meta.segments[]`,
      ref: match.source,
      hint: "suggest: regenerate narration timing so the source audio track has at least one segment",
    });
  }

  if (!targetTrack) {
    errors.push({
      code: "DUCKING_TARGET_MISSING",
      message: `ducking target track "${match.target}" was not found`,
      ref: match.target,
      hint: "suggest: set target to a different existing audio track id",
    });
  } else if (targetTrack.kind !== "audio") {
    errors.push({
      code: "DUCKING_TARGET_NOT_AUDIO",
      message: `ducking target track "${match.target}" must be audio`,
      ref: match.target,
      hint: "suggest: point target at a BGM or SFX audio track",
    });
  }

  if (match.source === match.target) {
    errors.push({
      code: "DUCKING_TARGET_EQUALS_SOURCE",
      message: "ducking target must be a different audio track from the source",
      ref: match.target,
      hint: "suggest: choose a BGM or SFX audio track instead of the narration source",
    });
  }

  const duckTo = getMatchOption(match, "duckTo");
  if (!isValidDuckingLevel(duckTo)) {
    errors.push({
      code: "DUCKING_LEVEL_INVALID",
      message: "duckTo must be a number between 0 and 1",
      ref: match.target,
      hint: `suggest: omit duckTo for the default ${DEFAULT_DUCK_TO}, or set a value like 0.1`,
    });
  }

  const fadeMs = getMatchOption(match, "fadeMs");
  if (!isValidFadeMs(fadeMs)) {
    errors.push({
      code: "DUCKING_FADE_INVALID",
      message: "fadeMs must be a non-negative integer",
      ref: match.target,
      hint: `suggest: omit fadeMs for the default ${DEFAULT_FADE_MS}, or use an integer like 50`,
    });
  }

  return buildValidationResult(errors);
}

function getNormalizedSegments(track: AudioTrack): Segment[] {
  const segments = getSourceSegments(track) ?? [];
  return [...segments].sort((left, right) => left.startMs - right.startMs);
}

function buildDuckingSchedule(segments: Segment[], duckTo: number, fadeMs: number): DuckingSchedulePoint[] {
  if (segments.length === 0) {
    return [];
  }

  const schedule: DuckingSchedulePoint[] = [];
  let activeStartMs = segments[0].startMs;
  let activeEndMs = segments[0].endMs;

  for (const segment of segments.slice(1)) {
    const gapMs = segment.startMs - activeEndMs;
    if (gapMs < fadeMs * 2) {
      if (segment.endMs > activeEndMs) {
        activeEndMs = segment.endMs;
      }
      continue;
    }

    schedule.push({ tMs: activeStartMs, volume: duckTo });
    schedule.push({ tMs: activeEndMs + fadeMs, volume: 1.0 });
    activeStartMs = segment.startMs;
    activeEndMs = segment.endMs;
  }

  schedule.push({ tMs: activeStartMs, volume: duckTo });
  schedule.push({ tMs: activeEndMs + fadeMs, volume: 1.0 });
  schedule.sort((left, right) => left.tMs - right.tMs || right.volume - left.volume);
  return schedule;
}

export function expand(match: Match, timeline: Timeline): Partial<Timeline> {
  const source = findTrack(timeline, match.source);
  const target = findTrack(timeline, match.target);
  const duckTo = resolveDuckTo(match);
  const fadeMs = resolveFadeMs(match);

  if (!source || !target || source.id === target.id || duckTo === undefined || fadeMs === undefined) {
    return { tracks: [] };
  }

  const schedule = buildDuckingSchedule(getNormalizedSegments(source), duckTo, fadeMs);
  const trackPatch: DuckingTrackPatch = {
    id: target.id,
    kind: "audio",
    duckingSchedule: schedule,
  };

  return {
    tracks: [trackPatch],
  };
}
