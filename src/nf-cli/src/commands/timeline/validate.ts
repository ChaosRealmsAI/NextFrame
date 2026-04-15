// nextframe validate <timeline.json>
// Auto-detects v0.1 (tracks/clips) vs v0.3 (layers[]) format.
import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "../_helpers/_resolve.js";
import { detectFormat, validateTimelineLegacy, validateTimelineV3 } from "../_helpers/_timeline-validate.js";

type TimelineCommandResult = {
  ok: boolean;
  errors: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  warnings: Array<{ code: string; message: string; ref?: string; hint?: string }>;
  hints: Array<{ code: string; message: string; ref?: string; hint?: string }>;
};

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
    let fmtResult;
    if (fmt === "v0.1") {
      process.stderr.write("warn: v0.1 tracks/clips format detected — consider migrating to v0.3 layers[]\n");
      fmtResult = validateTimelineLegacy(tl, { projectDir: timelineDir(resolved.jsonPath) });
    } else if (fmt === "v0.3") {
      fmtResult = await validateTimelineV3(tl);
    } else if (fmt === "v0.8") {
      fmtResult = {
        ok: false,
        errors: [{ code: "NOT_IMPLEMENTED", message: "v0.8 timeline validation is not implemented in the walking skeleton" }],
        warnings: [],
        hints: [],
      };
    } else {
      fmtResult = {
        ok: false,
        errors: [{ code: "UNKNOWN_FORMAT", message: "timeline must contain either tracks[] or layers[]" }],
        warnings: [],
        hints: [],
      };
    }
    result = fmtResult;
  }
  const fmt = detectFormat(tl);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ format: fmt, ...result }, null, 2) + "\n");
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
