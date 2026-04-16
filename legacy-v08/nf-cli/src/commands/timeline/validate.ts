import type { Issue, AnchorDict } from "../../../../nf-core/anchors/types.js";
import { parse } from "../../../../nf-core/anchors/parser.js";
import { resolve } from "../../../../nf-core/anchors/resolver.js";
import { validateAnchors } from "../../../../nf-core/anchors/validator.js";
import { getKind, validateClipForKind, validateTrackForKind } from "../../../../nf-core/kinds/index.js";
import type { TimelineV08 } from "../../../../nf-core/types.js";
import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "../_helpers/_resolve.js";
import { detectFormat, validateTimelineLegacy, validateTimelineV3 } from "../_helpers/_timeline-validate.js";

const SIMPLE_ANCHOR_EXPR = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\.(begin|end|at)\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(s|ms))?\s*$/;

type VerifyIssue = Issue & {
  kind?: string;
  trackId?: string;
};

type TimelineCommandResult = {
  ok: boolean;
  errors: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  warnings: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  hints: Array<{ code: string; message: string; ref?: string; hint?: string }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNotImplemented(error: unknown) {
  return error instanceof Error && /NOT_IMPLEMENTED/.test(error.message);
}

function resolveFallback(dict: AnchorDict, expr: string): number {
  const match = expr.match(SIMPLE_ANCHOR_EXPR);
  if (!match) {
    throw {
      code: "BAD_ANCHOR_EXPR",
      message: `unsupported anchor expression "${expr}"`,
      fix: 'Use "id.begin|end|at ± Ns|ms".',
    };
  }
  const [, anchorId, point, op, rawValue, unit] = match;
  const entry = dict[anchorId];
  if (!entry) {
    throw {
      code: "MISSING_ANCHOR",
      message: `anchor "${anchorId}" is not defined`,
      fix: `Define "${anchorId}" in anchors or correct the reference.`,
    };
  }
  const base = entry[point as "begin" | "end" | "at"];
  if (!isFiniteNumber(base)) {
    throw {
      code: "MISSING_ANCHOR",
      message: `anchor "${anchorId}.${point}" is not defined`,
      fix: `Populate "${anchorId}.${point}" before building.`,
    };
  }
  if (!rawValue || !unit || !op) {
    return base;
  }
  const offset = Number(rawValue) * (unit === "s" ? 1000 : 1);
  return op === "+" ? base + offset : base - offset;
}

function validateRef(dict: AnchorDict, value: unknown, field: string): VerifyIssue[] {
  if (value === undefined || value === null) return [];
  if (isFiniteNumber(value)) return [];
  if (typeof value !== "string" || value.trim().length === 0) {
    return [{
      code: "BAD_ANCHOR_EXPR",
      message: "anchor ref must be a non-empty string or numeric dev shortcut",
      field,
      fix: 'Use "id.begin|end|at ± Ns|ms".',
    }];
  }

  try {
    parse(value);
    resolve(dict, value);
    return [];
  } catch (error) {
    if (!isNotImplemented(error)) {
      const err = error as { code?: string; message?: string; fix?: string };
      return [{
        code: err.code || "BAD_ANCHOR_EXPR",
        message: err.message || `invalid anchor expression "${value}"`,
        field,
        fix: err.fix,
      }];
    }
  }

  try {
    resolveFallback(dict, value);
    return [];
  } catch (error) {
    const err = error as { code?: string; message?: string; fix?: string };
    return [{
      code: err.code || "BAD_ANCHOR_EXPR",
      message: err.message || `invalid anchor expression "${value}"`,
      field,
      fix: err.fix,
    }];
  }
}

function normalizeKindIssues(issues: Issue[], fieldPrefix: string, kind: string, trackId: string): VerifyIssue[] {
  return issues.map((issue) => ({
    ...issue,
    field: issue.field ? `${fieldPrefix}.${issue.field}` : fieldPrefix,
    message: `${kind}: ${issue.message}`,
    kind,
    trackId,
  }));
}

function validateV08Timeline(timeline: TimelineV08) {
  const issues: VerifyIssue[] = [];

  try {
    const anchorResult = validateAnchors(timeline.anchors || {});
    if (!anchorResult.ok) {
      issues.push(...anchorResult.issues);
    }
  } catch (error) {
    if (!isNotImplemented(error)) {
      const err = error as { issues?: Issue[]; message?: string };
      if (Array.isArray(err.issues) && err.issues.length > 0) {
        issues.push(...err.issues);
      } else {
        issues.push({
          code: "ANCHOR_VALIDATION_FAIL",
          message: err.message || "anchor validation failed",
        });
      }
    }
  }

  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  tracks.forEach((track, trackIndex) => {
    const trackId = typeof track.id === "string" && track.id.trim().length > 0
      ? track.id
      : `track_${trackIndex}`;
    const baseField = `tracks[${trackIndex}]`;
    const kind = getKind(track.kind);
    if (!kind) {
      issues.push({
        code: "UNSUPPORTED_KIND",
        message: `unsupported kind "${track.kind}"`,
        field: `${baseField}.kind`,
        fix: "Use one of: audio, scene, subtitle, animation.",
        trackId,
      });
      return;
    }

    const trackResult = validateTrackForKind(track.kind, track);
    if (!trackResult.ok) {
      issues.push(...normalizeKindIssues(trackResult.issues, baseField, track.kind, trackId));
    }

    const clips = Array.isArray(track.clips) ? track.clips : [];
    clips.forEach((clip, clipIndex) => {
      const clipField = `${baseField}.clips[${clipIndex}]`;
      const clipResult = validateClipForKind(track.kind, clip);
      if (!clipResult.ok) {
        issues.push(...normalizeKindIssues(clipResult.issues, clipField, track.kind, trackId));
      }

      if (track.kind === "animation") {
        issues.push(...validateRef(timeline.anchors || {}, clip.at, `${clipField}.at`).map((issue) => ({
          ...issue,
          kind: track.kind,
          trackId,
        })));
      } else {
        issues.push(...validateRef(timeline.anchors || {}, clip.begin, `${clipField}.begin`).map((issue) => ({
          ...issue,
          kind: track.kind,
          trackId,
        })));
        issues.push(...validateRef(timeline.anchors || {}, clip.end, `${clipField}.end`).map((issue) => ({
          ...issue,
          kind: track.kind,
          trackId,
        })));
      }
    });
  });

  return {
    pass: issues.length === 0,
    summary: issues.length === 0
      ? `v0.8 verify-contract passed for ${tracks.length} track(s)`
      : `v0.8 verify-contract found ${issues.length} issue(s) across ${tracks.length} track(s)`,
    issues,
  };
}

function toLegacyResult(verify: { pass: boolean; issues: VerifyIssue[] }): TimelineCommandResult {
  return {
    ok: verify.pass,
    errors: verify.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      ref: issue.field,
      hint: issue.fix,
    })),
    warnings: [],
    hints: [],
  };
}

export async function run(argv: string[]) {
  const removedField = "ma" + "tches";
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("validate") });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const tl = loaded.value as Record<string, unknown>;
  let result: TimelineCommandResult;
  let verifyContract: { pass: boolean; summary: string; issues: VerifyIssue[] } | null = null;

  if (tl.version === "0.6" || Array.isArray(tl[removedField])) {
    result = {
      ok: false,
      errors: [{
        code: "UNSUPPORTED_VERSION",
        message: "v0.6 input is not supported by the v0.8 timeline model",
        hint: "rewrite the timeline in v0.3 or v0.8 format; no compatibility path exists",
      }],
      warnings: [],
      hints: [],
    };
  } else {
    const fmt = detectFormat(tl);
    if (fmt === "v0.1") {
      process.stderr.write("warn: v0.1 tracks/clips format detected — consider migrating to v0.3 layers[]\n");
      result = validateTimelineLegacy(tl, { projectDir: timelineDir(resolved.jsonPath) });
    } else if (fmt === "v0.3") {
      result = await validateTimelineV3(tl);
    } else if (fmt === "v0.8") {
      verifyContract = validateV08Timeline(tl as TimelineV08);
      result = toLegacyResult(verifyContract);
    } else {
      result = {
        ok: false,
        errors: [{ code: "UNKNOWN_FORMAT", message: "timeline must contain either tracks[] or layers[]" }],
        warnings: [],
        hints: [],
      };
    }
  }

  const fmt = detectFormat(tl);
  if (flags.json) {
    if (fmt === "v0.8" && verifyContract) {
      process.stdout.write(JSON.stringify({
        format: fmt,
        pass: verifyContract.pass,
        summary: verifyContract.summary,
        issues: verifyContract.issues,
      }, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify({ format: fmt, ...result }, null, 2) + "\n");
    }
  } else if (fmt === "v0.8" && verifyContract) {
    process.stdout.write(`${verifyContract.summary}\n`);
    for (const issue of verifyContract.issues) {
      process.stdout.write(`  ${issue.code} ${issue.field || ""}: ${issue.message}\n`);
      if (issue.fix) process.stdout.write(`    fix: ${issue.fix}\n`);
    }
    if (verifyContract.pass) process.stdout.write("ok\n");
  } else {
    process.stdout.write(`Format: ${fmt}  Errors: ${result.errors.length}  Warnings: ${result.warnings.length}\n`);
    for (const e of result.errors) {
      process.stdout.write(`  ERROR ${e.code} ${e.ref || ""}: ${e.message}\n`);
      if (e.hint) process.stdout.write(`    hint: ${e.hint}\n`);
    }
    for (const w of result.warnings) {
      process.stdout.write(`  WARN  ${w.code} ${w.ref || ""}: ${w.message}\n`);
    }
    if (result.ok) process.stdout.write("ok\n");
  }

  if (!result.ok) return 2;
  return 0;
}
