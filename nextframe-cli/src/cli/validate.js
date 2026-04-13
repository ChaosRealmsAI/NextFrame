import { parseFlags, loadTimeline } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";
import { detectFormat, validateTimeline } from "../engine-v2/validate.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("validate") });
  if (!resolved.ok) {
    emitValidationResult(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emitValidationResult(loaded, flags);
    return 2;
  }

  const result = validateTimeline(loaded.value);
  const payload = { ok: result.ok, format: detectFormat(loaded.value), ...result };
  emitValidationResult(payload, flags);
  if (!result.ok) return 2;
  if (result.warnings.length > 0) return 1;
  return 0;
}

function emitValidationResult(result, flags) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (!result.ok && result.error) {
    process.stderr.write(`error: ${result.error.message}\n`);
    return;
  }

  process.stdout.write(`Format: ${result.format}\n`);
  process.stdout.write(`Errors: ${result.errors.length}  Warnings: ${result.warnings.length}\n`);
  for (const error of result.errors) {
    process.stdout.write(`  ERROR ${error.code}${error.ref ? ` ${error.ref}` : ""}: ${error.message}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`  WARN  ${warning.code}${warning.ref ? ` ${warning.ref}` : ""}: ${warning.message}\n`);
  }
  if (result.ok && result.errors.length === 0) {
    process.stdout.write("ok\n");
  }
}
