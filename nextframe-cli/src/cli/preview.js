import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { describeAt } from "../engine-v2/describe.js";
import { validateTimeline } from "../engine-v2/validate.js";
import { captureFrames } from "../targets/browser.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("preview") });
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

  const times = parseTimes(flags, loaded.value.duration);
  const outDir = resolve(flags.out || joinTempPreviewDir());
  await mkdir(outDir, { recursive: true });
  const captured = await captureFrames(loaded.value, times, outDir, { baseDir: timelineDir(resolved.jsonPath) });
  if (!captured.ok) {
    emit(captured, flags);
    return 2;
  }

  const screenshots = captured.value.map((shot) => {
    const described = describeAt(loaded.value, shot.t).value;
    return {
      t: shot.t,
      path: shot.path,
      layers: described.active.map((layer) => layer.id),
      count: described.activeCount,
    };
  });

  const result = { ok: true, value: { screenshots, warnings: validation.warnings } };
  emit(result, flags);
  return 0;
}

function parseTimes(flags, duration) {
  if (flags.times) {
    const times = String(flags.times).split(",").map(Number).filter((value) => Number.isFinite(value));
    if (times.length > 0) return times;
  }
  if (flags.time !== undefined) {
    return [Number(flags.time)];
  }

  const points = new Set([0, Math.max(0, duration / 2), Math.max(0, duration - 0.001)]);
  return [...points].sort((a, b) => a - b);
}

function joinTempPreviewDir() {
  return `${tmpdir()}/nextframe-preview`;
}
