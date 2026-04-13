import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { buildHTML, timelineBaseHref } from "../engine-v2/build.js";
import { validateTimeline } from "../engine-v2/validate.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("build", "", " -o <output.html>") });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const validation = validateTimeline(loaded.value);
  if (!validation.ok) {
    emit({ ok: false, error: { code: "VALIDATION_FAILED", message: validation.errors[0]?.message || "validation failed" }, ...validation }, flags);
    return 2;
  }

  const outputPath = flags.o || flags.output || resolved.jsonPath.replace(/\.json$/, ".html");
  const result = buildHTML(loaded.value, outputPath, {
    mode: "player",
    baseHref: timelineBaseHref(timelineDir(resolved.jsonPath)),
  });
  emit(result, flags);
  return result.ok ? 0 : 2;
}
