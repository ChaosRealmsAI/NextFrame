import type { Match, PlanCtx, SceneClip, Timeline, ValidationResult } from "../types.js";
import {
  buildStubPlan,
  getRatioFromPlanCtx,
  loadSceneSpecsForValidation,
  type SceneSpec,
  type SegmentPlan,
} from "./_plan-heuristics.js";

export const name = "scene-per-segment";
type ValidationIssueWithSuggest = ValidationResult["errors"][number] & { suggest?: string };

export async function plan(ctx: PlanCtx): Promise<SegmentPlan[]> {
  return buildStubPlan(ctx);
}

// Reserved LLM integration point. Swap plan() to call this once the planner is wired.
export async function planWithLLM(_ctx: PlanCtx): Promise<SegmentPlan[]> {
  throw new Error("scene-per-segment LLM planner is not wired");
}

export function validate(match: Match, timeline: Timeline): ValidationResult {
  const errors: ValidationIssueWithSuggest[] = [];
  const warnings: ValidationIssueWithSuggest[] = [];
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const source = tracks.find((track) => track?.id === match.source);
  const target = tracks.find((track) => track?.id === match.target);
  const ratio = getRatioFromPlanCtx({ timeline });

  if (!source) {
    errors.push(issue(
      "MATCH_SOURCE_MISSING",
      `scene-per-segment source track '${match.source}' does not exist`,
      "The match points to a track id that is not present in timeline.tracks.",
      "Set match.source to an existing audio track id.",
    ));
  } else if (source.kind !== "audio") {
    errors.push(issue(
      "MATCH_SOURCE_KIND",
      `scene-per-segment source track '${match.source}' must be audio`,
      `Track '${match.source}' has kind '${String(source.kind || "unknown")}', not 'audio'.`,
      "Point match.source at an audio track with TTS segment metadata.",
    ));
  }

  if (!target) {
    errors.push(issue(
      "MATCH_TARGET_MISSING",
      `scene-per-segment target track '${match.target}' does not exist`,
      "The match points to a track id that is not present in timeline.tracks.",
      "Set match.target to an existing scene track id.",
    ));
  } else if (target.kind !== "scene") {
    errors.push(issue(
      "MATCH_TARGET_KIND",
      `scene-per-segment target track '${match.target}' must be scene`,
      `Track '${match.target}' has kind '${String(target.kind || "unknown")}', not 'scene'.`,
      "Point match.target at a scene track.",
    ));
  }

  const segments = source?.kind === "audio" && Array.isArray(source.meta?.segments) ? source.meta.segments : [];
  if (source?.kind === "audio" && segments.length === 0) {
    errors.push(issue(
      "MATCH_SOURCE_SEGMENTS_MISSING",
      `audio track '${match.source}' has no segments`,
      "scene-per-segment expands from audio.meta.segments, but the source track has none.",
      "Regenerate the audio timeline or attach at least one segment to source.meta.segments.",
    ));
  }

  if (!Array.isArray(match.plan)) {
    errors.push(issue(
      "MATCH_PLAN_INVALID",
      "scene-per-segment plan must be an array",
      `Expected match.plan to be an array, received '${typeof match.plan}'.`,
      "Write match.plan as [{ segmentId, scene, params? }, ...].",
    ));
    return finalizeValidation(errors, warnings);
  }

  const sceneSpecs = loadSceneSpecsForValidation(ratio);
  const sceneById = new Map(sceneSpecs.map((scene) => [scene.id, scene]));
  const validSceneIds = sceneSpecs.map((scene) => scene.id);
  const sourceSegmentIds = new Set(segments.map((segment) => segment.id));
  const planCounts = new Map<string, number>();

  for (const entry of match.plan) {
    if (!isPlanEntry(entry)) {
      errors.push(issue(
        "MATCH_PLAN_ENTRY_INVALID",
        "scene-per-segment plan entries must include segmentId and scene strings",
        `Received invalid plan entry: ${JSON.stringify(entry)}`,
        "Rewrite the entry to match { segmentId: string, scene: string | '@prev', params?: object }.",
      ));
      continue;
    }

    planCounts.set(entry.segmentId, (planCounts.get(entry.segmentId) || 0) + 1);

    if (!sourceSegmentIds.has(entry.segmentId)) {
      errors.push(issue(
        "MATCH_SEGMENT_UNKNOWN",
        `plan references unknown segment '${entry.segmentId}'`,
        `The source audio track does not contain a segment with id '${entry.segmentId}'.`,
        "Remove the extra plan entry or rename it to a valid source segment id.",
      ));
    }

    if (entry.scene !== "@prev") {
      const scene = sceneById.get(entry.scene);
      if (!scene) {
        errors.push(issue(
          "MATCH_SCENE_UNKNOWN",
          `unknown scene '${entry.scene}' for ratio ${ratio}`,
          `Valid scenes for ${ratio}: ${validSceneIds.join(", ") || "(none discovered)"}`,
          suggestScene(entry.scene, validSceneIds),
        ));
        continue;
      }
      validateSceneParams(entry, scene, warnings, errors);
    }
  }

  for (const segment of segments) {
    const count = planCounts.get(segment.id) || 0;
    if (count === 0) {
      errors.push(issue(
        "MATCH_SEGMENT_MISSING",
        `plan does not cover segment '${segment.id}'`,
        `Every source segment must appear exactly once, but '${segment.id}' is missing.`,
        "Add one plan entry for the missing segment id.",
      ));
    } else if (count > 1) {
      errors.push(issue(
        "MATCH_SEGMENT_DUPLICATE",
        `plan covers segment '${segment.id}' more than once`,
        `Segment '${segment.id}' appears ${count} times in match.plan.`,
        "Keep exactly one plan entry per source segment.",
      ));
    }
  }

  const firstSegmentId = segments[0]?.id;
  if (firstSegmentId) {
    const firstEntry = match.plan.find((entry): entry is SegmentPlan => isPlanEntry(entry) && entry.segmentId === firstSegmentId);
    if (firstEntry?.scene === "@prev") {
      errors.push(issue(
        "MATCH_PREV_FIRST_SEGMENT",
        "first segment cannot use '@prev'",
        `Segment '${firstSegmentId}' is the first source segment, so there is no previous scene to inherit.`,
        "Use a concrete scene id for the first segment.",
      ));
    }
  }

  return finalizeValidation(errors, warnings);
}

export function expand(match: Match, timeline: Timeline): Partial<Timeline> {
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const source = tracks.find((track) => track?.id === match.source);
  const target = tracks.find((track) => track?.id === match.target);

  if (!source || source.kind !== "audio") {
    throw new Error(`Fix: scene-per-segment source '${match.source}' must be an audio track`);
  }
  if (!target || target.kind !== "scene") {
    throw new Error(`Fix: scene-per-segment target '${match.target}' must be a scene track`);
  }
  if (!Array.isArray(source.meta?.segments) || source.meta.segments.length === 0) {
    throw new Error(`Fix: audio track '${match.source}' must include meta.segments`);
  }
  if (!Array.isArray(match.plan)) {
    throw new Error("Fix: scene-per-segment match.plan must be an array");
  }

  const planBySegmentId = new Map<string, SegmentPlan>();
  for (const entry of match.plan) {
    if (isPlanEntry(entry)) {
      planBySegmentId.set(entry.segmentId, entry);
    }
  }

  const clips: SceneClip[] = [];

  for (const segment of source.meta.segments) {
    const entry = planBySegmentId.get(segment.id);
    if (!entry) {
      throw new Error(`Fix: scene-per-segment plan is missing segment '${segment.id}'`);
    }

    const start = segment.startMs / 1000;
    const end = segment.endMs / 1000;
    if (entry.scene === "@prev") {
      const previous = clips[clips.length - 1];
      if (!previous) {
        throw new Error(`Fix: segment '${segment.id}' cannot use '@prev' without a previous scene clip`);
      }
      previous.dur = roundSeconds(end - Number(previous.start || 0));
      continue;
    }

    clips.push({
      scene: entry.scene,
      start: roundSeconds(start),
      dur: roundSeconds(end - start),
      params: stableCopy(entry.params ?? {}),
    });
  }

  return {
    tracks: [
      {
        ...target,
        id: match.target,
        kind: "scene",
        clips,
      },
    ],
  };
}

function validateSceneParams(
  entry: SegmentPlan,
  scene: SceneSpec,
  warnings: ValidationIssueWithSuggest[],
  errors: ValidationIssueWithSuggest[],
) {
  const params = entry.params;
  if (params === undefined) {
    validateMissingRequiredParams(entry, scene, warnings, errors, {});
    return;
  }

  if (!params || typeof params !== "object" || Array.isArray(params)) {
    errors.push(issue(
      "MATCH_PARAMS_INVALID",
      `plan params for segment '${entry.segmentId}' must be an object`,
      `Scene '${scene.id}' received params of type '${Array.isArray(params) ? "array" : typeof params}'.`,
      "Write params as a JSON object or omit the field.",
    ));
    return;
  }

  const provided = params as Record<string, unknown>;
  const allowed = new Set(
    (scene.contractAllowedParams && scene.contractAllowedParams.length > 0)
      ? scene.contractAllowedParams
      : scene.params.map((param) => param.name),
  );
  for (const key of Object.keys(provided)) {
    if (!allowed.has(key)) {
      errors.push(issue(
        "MATCH_PARAM_DISALLOWED",
        `scene '${scene.id}' does not accept param '${key}'`,
        `Allowed params: ${[...allowed].join(", ") || "(none)"}`,
        "Remove the extra param or rename it to one declared by the scene.",
      ));
    }
  }

  validateMissingRequiredParams(entry, scene, warnings, errors, provided);
}

function validateMissingRequiredParams(
  entry: SegmentPlan,
  scene: SceneSpec,
  warnings: ValidationIssueWithSuggest[],
  errors: ValidationIssueWithSuggest[],
  provided: Record<string, unknown>,
) {
  const defaulted = new Set([
    ...scene.params.filter((param) => param.hasDefault).map((param) => param.name),
    ...(scene.contractDefaultedParams || []),
  ]);
  for (const param of scene.params) {
    if (!param.required || Object.prototype.hasOwnProperty.call(provided, param.name)) {
      continue;
    }
    if (defaulted.has(param.name)) {
      warnings.push(issue(
        "MATCH_PARAM_DEFAULTED",
        `scene '${scene.id}' is missing required param '${param.name}' but has a default`,
        `Segment '${entry.segmentId}' omits '${param.name}', so the scene default will be used.`,
        "Keep the default or provide an explicit value if you want deterministic authored output.",
      ));
      continue;
    }
    errors.push(issue(
      "MATCH_PARAM_REQUIRED",
      `scene '${scene.id}' is missing required param '${param.name}'`,
      `Segment '${entry.segmentId}' does not provide '${param.name}', and the scene has no default for it.`,
      "Add the missing param or choose a scene whose required params can be filled from the segment text.",
    ));
  }
}

function suggestScene(sceneId: string, validSceneIds: string[]): string {
  if (validSceneIds.length === 0) {
    return "Ensure scene discovery succeeds for the current ratio before validating the plan.";
  }
  const suggestions = [...validSceneIds]
    .map((candidate) => ({ candidate, score: similarityScore(sceneId, candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .slice(0, 3)
    .map((entry) => entry.candidate);
  return `Use one of the closest valid scenes: ${suggestions.join(", ")}`;
}

function similarityScore(input: string, candidate: string): number {
  const a = input.toLowerCase();
  const b = candidate.toLowerCase();
  if (a === b) {
    return 1000;
  }
  let score = 0;
  if (a.includes(b) || b.includes(a)) {
    score += 50;
  }
  const shared = [...new Set(a)].filter((char) => b.includes(char)).length;
  score += shared;
  const prefix = commonPrefixLength(a, b);
  score += prefix * 3;
  score -= Math.abs(a.length - b.length);
  return score;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function isPlanEntry(value: unknown): value is SegmentPlan {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as { segmentId?: unknown }).segmentId === "string"
    && typeof (value as { scene?: unknown }).scene === "string",
  );
}

function issue(code: string, message: string, hint: string, suggest: string): ValidationIssueWithSuggest {
  return { code, message, hint, suggest };
}

function finalizeValidation(
  errors: ValidationIssueWithSuggest[],
  warnings: ValidationIssueWithSuggest[],
): ValidationResult {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(6));
}

function stableCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stableCopy(item)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableCopy(nested)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}
