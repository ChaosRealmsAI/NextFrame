import { mkdir } from "node:fs/promises";

import { parseFlags, loadTimeline, emit, parseTime } from "./_io.js";
import { resolveTimeline, segmentFramePath, timelineDir, timelineUsage } from "./_resolve.js";
import { validateTimeline } from "../engine-v2/validate.js";
import { captureFrameToFile } from "../targets/browser.js";

const USAGE = timelineUsage("frame", " <t>", " <t> <out.png>");

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: USAGE });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const [tSpec, explicitOutPath] = resolved.rest;
  if (tSpec === undefined || (!resolved.legacy && explicitOutPath !== undefined)) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const t = parseTime(tSpec);
  if (!Number.isFinite(t)) {
    emit({ ok: false, error: { code: "BAD_TIME", message: `cannot parse time "${tSpec}"` } }, flags);
    return 3;
  }

  const outPath = resolved.legacy ? explicitOutPath : segmentFramePath(resolved.segment, resolved.framesPath, t);
  if (!outPath) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
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

  if (!resolved.legacy) {
    await mkdir(resolved.framesPath, { recursive: true });
  }
  const result = await captureFrameToFile(loaded.value, outPath, { t, baseDir: timelineDir(resolved.jsonPath) });
  if (!result.ok) {
    emit(result, flags);
    return 2;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { path: outPath, t } }, null, 2) + "\n");
  } else {
    process.stdout.write(`wrote ${outPath}\n`);
  }
  return 0;
}
