// nextframe validate <timeline.json>
// Auto-detects v0.1 (tracks/clips) vs v0.3 (layers[]) format.
import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "../_helpers/_resolve.js";
import { detectFormat, validateTimelineLegacy, validateTimelineV3 } from "../_helpers/_timeline-validate.js";

export async function run(argv: string[]) {
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
  const fmt = detectFormat(tl);
  let result;
  if (fmt === "v0.1") {
    process.stderr.write("warn: v0.1 tracks/clips format detected — consider migrating to v0.3 layers[]\n");
    result = validateTimelineLegacy(tl, { projectDir: timelineDir(resolved.jsonPath) });
  } else if (fmt === "v0.3") {
    result = await validateTimelineV3(tl);
  } else {
    result = {
      ok: false,
      errors: [{ code: "UNKNOWN_FORMAT", message: "timeline must contain either tracks[] or layers[]" }],
      warnings: [],
      hints: [],
    };
  }

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
