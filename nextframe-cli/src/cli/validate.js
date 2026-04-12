// nextframe validate <timeline.json>
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { validateTimeline } from "../engine/validate.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("validate") });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const result = validateTimeline(loaded.value, { projectDir: timelineDir(resolved.jsonPath) });
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`Errors: ${result.errors.length}  Warnings: ${result.warnings.length}\n`);
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
  if (result.warnings.length > 0) return 1;
  return 0;
}
